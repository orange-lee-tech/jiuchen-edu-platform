import type mysql from 'mysql2/promise'
import type { AppEnv } from '../config/env.js'
import { readControlBox, unsealKey } from './admin-control-boxes.js'
import { createAssessmentRuntimeFromEnv, type AssessmentRuntime } from './assessment-runtime.js'

export function createVaultAssessmentRuntime(env: AppEnv, pool: mysql.Pool | null) {
  const baseline = createAssessmentRuntimeFromEnv(env)
  let vaultPresent = false
  let vaultUsable = false
  const runtime: AssessmentRuntime = {
    retriever: baseline.retriever,
    provider: {
      get provider() { return baseline.provider.provider },
      get model() { return baseline.provider.model },
      isConfigured() { return vaultPresent ? vaultUsable : baseline.provider.isConfigured() },
      async analyze(input) {
        const provider = await activeProvider()
        return provider.analyze(input)
      },
      async repair(input) {
        const provider = await activeProvider()
        if (!provider.repair) throw new Error('assessment_repair_not_available')
        return provider.repair(input)
      },
    },
  }
  async function activeProvider() {
    if (!pool || !vaultPresent) return baseline.provider
    const row = await readControlBox(pool, 'assessment_key')
    if (!row?.encrypted_secret || !env.ADMIN_AI_KEY_ENCRYPTION_KEY) {
      throw new Error('assessment_key_vault_unavailable')
    }
    const key = unsealKey(row.encrypted_secret, env.ADMIN_AI_KEY_ENCRYPTION_KEY)
    return createAssessmentRuntimeFromEnv({ ...env, ASSESSMENT_AI_API_KEY: key }).provider
  }
  async function refresh() {
    if (!pool) return
    try {
      const row = await readControlBox(pool, 'assessment_key')
      vaultPresent = Boolean(row)
      vaultUsable = Boolean(row?.encrypted_secret && env.ADMIN_AI_KEY_ENCRYPTION_KEY)
    } catch (error) {
      if ((error as { code?: string }).code !== 'ER_NO_SUCH_TABLE') throw error
    }
  }
  return { runtime, refresh }
}
