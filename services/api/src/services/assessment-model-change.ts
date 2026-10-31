import type mysql from 'mysql2/promise'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import type { AppEnv } from '../config/env.js'
import { ControlError, sixDigitPin, unsealKey, verifyPin } from './admin-control-boxes.js'
import { createAssessmentAIProvider } from './ai-provider.js'
import { secureAssessmentModelFetch, validateAssessmentApiUrl } from './assessment-key-objects.js'
import { validateAssessmentOutput } from '../domain/assessment.js'

export const modelChangeInput = z.object({ expectedVersion: z.number().int().nonnegative(),
  expectedObjectVersion: z.number().int().positive(), currentPin: sixDigitPin,
  model: z.string().trim().min(1).max(120) }).strict()

/** Authorize before probing, then recheck both versions before changing anything.
 * A failed paid format probe cannot replace an active configuration. */
export async function changeAssessmentObjectModel(input: {
  pool: mysql.Pool; actorId: string; id: string; env: AppEnv
  data: z.infer<typeof modelChangeInput>
  probe?: (config: { provider: string; baseUrl: string; model: string; apiKey: string; temperature:number }) => Promise<boolean>
}) {
  const data = modelChangeInput.parse(input.data)
  const connection = await input.pool.getConnection()
  let object: mysql.RowDataPacket
  const authorize = async () => {
    const [heads] = await connection.query<mysql.RowDataPacket[]>(
      'SELECT *, (locked_until>CURRENT_TIMESTAMP()) AS pin_locked FROM assessment_key_head WHERE id=1 FOR UPDATE')
    const head = heads[0]
    if (!head?.initialized) throw new ControlError('assessment_key_not_initialized', 409)
    if (Number(head.version) !== data.expectedVersion) throw new ControlError('control_version_conflict', 409)
    if (Number(head.pin_locked)) throw new ControlError('control_pin_locked', 429)
    if (!head.pin_salt || !head.pin_hash || !verifyPin(data.currentPin, head.pin_salt, head.pin_hash)) {
      const attempts=Number(head.failed_attempts)+1
      await connection.query(`UPDATE assessment_key_head SET failed_attempts=?,
        locked_until=CASE WHEN ?>=5 THEN DATE_ADD(CURRENT_TIMESTAMP(),INTERVAL 15 MINUTE) ELSE locked_until END WHERE id=1`,[attempts,attempts])
      await connection.commit()
      throw new ControlError('control_pin_invalid', 403)
    }
    const [objects] = await connection.query<mysql.RowDataPacket[]>(
      'SELECT * FROM assessment_key_objects WHERE id=? FOR UPDATE', [input.id])
    const row = objects[0]
    if (!row || row.status === 'archived' || row.status === 'disabled') throw new ControlError('assessment_key_not_found', 404)
    if (Number(row.version) !== data.expectedObjectVersion) throw new ControlError('assessment_object_version_conflict', 409)
    if (!row.provider || !row.api_base_url || !row.encrypted_secret) throw new ControlError('assessment_key_connection_incomplete', 409)
    return row
  }
  try {
    await connection.beginTransaction()
    object = await authorize()
    await connection.commit()
    if (!input.env.ADMIN_AI_KEY_ENCRYPTION_KEY) throw new ControlError('key_vault_master_key_missing', 503)
    const config = { provider: String(object.provider), baseUrl: String(object.api_base_url), model: data.model,
      temperature:object.temperature==null?input.env.ASSESSMENT_AI_TEMPERATURE??0:Number(object.temperature),
      apiKey: unsealKey(String(object.encrypted_secret), input.env.ADMIN_AI_KEY_ENCRYPTION_KEY) }
    let valid = false
    try {
      if (input.probe) valid = await input.probe(config)
      else {
        await validateAssessmentApiUrl(config.baseUrl)
        const provider = createAssessmentAIProvider({...input.env,ASSESSMENT_AI_PROVIDER:config.provider,
          ASSESSMENT_AI_BASE_URL:config.baseUrl,ASSESSMENT_AI_MODEL:config.model,
          ASSESSMENT_AI_API_KEY:config.apiKey,ASSESSMENT_AI_TEMPERATURE:config.temperature},secureAssessmentModelFetch)
        const report = await provider.generateJson({ system: '仅输出完整 assessment-output-v1 JSON；这是合成格式探针，不代表真实学员评估。',
          user: '请输出资料不足的报告：profileSummary 为资料不足；strengths、risks、recommendedActions、similarCases 为空数组；targetAssessments 一项，schoolName 示例大学，programName null，tier insufficient_data，rationale 资料不足，gapItems/actions 为空数组，evidenceRefs ["probe:synthetic"]；uncertainties 至少一条；disclaimer 仅测试格式。', maxTokens: 4096 })
        validateAssessmentOutput(report); valid = true
      }
    } catch { valid = false }
    if (!valid) {
      await connection.query(`INSERT INTO assessment_key_events (id,object_id,actor_user_id,action,head_version)
        VALUES (?,?,?,'change_model_probe_failed',?)`, [randomUUID(), input.id, input.actorId, data.expectedVersion])
      throw new ControlError('assessment_model_probe_failed', 422)
    }
    await connection.beginTransaction()
    const current = await authorize()
    // Protect against credentials or identity being changed during the request.
    if (current.encrypted_secret !== object.encrypted_secret || current.api_base_url !== object.api_base_url || current.provider !== object.provider || current.temperature!==object.temperature)
      throw new ControlError('assessment_object_version_conflict', 409)
    await connection.query(`UPDATE assessment_key_objects SET model=?,version=version+1,last_test_result='passed',
      last_test_at=CURRENT_TIMESTAMP() WHERE id=?`, [data.model, input.id])
    await connection.query('UPDATE assessment_key_head SET version=version+1,failed_attempts=0,locked_until=NULL WHERE id=1')
    await connection.query(`INSERT INTO assessment_key_events (id,object_id,actor_user_id,action,head_version)
      VALUES (?,?,?,'change_model',?)`, [randomUUID(), input.id, input.actorId, data.expectedVersion + 1])
    await connection.commit()
    return { id: input.id, model: data.model, objectVersion: data.expectedObjectVersion + 1,
      version: data.expectedVersion + 1, reportSchemaValid: true, mayIncurCost: true }
  } catch (error) { await connection.rollback(); throw error }
  finally { connection.release() }
}
