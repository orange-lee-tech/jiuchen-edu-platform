import assert from 'node:assert/strict'
import test from 'node:test'
import { upgradePersonalWorkspace } from './upgrade-personal-workspace.js'

test('additive workspace upgrade completes partial DDL and repeats without deleting legacy data', async () => {
  const state = { profileStage: false, profileMode: false, owner: false,
    ownerIndex: false, ownerKey: false, nullableStudent: false, manualSource: false }
  const statements: string[] = []
  const db = { async query(sql: string, params?: unknown[]) {
    statements.push(sql)
    if (sql.startsWith('SELECT COLUMN_NAME AS')) {
      const table = params?.[0]
      if (table === 'user_profiles') return [[{ name: 'id' }, { name: 'user_id' },
        ...(state.profileStage ? [{ name: 'current_stage' }] : []),
        ...(state.profileMode ? [{ name: 'current_stage_mode' }] : [])]]
      if (table === 'student_plans') return [[{ name: 'id' }, { name: 'student_id', nullable: state.nullableStudent ? 'YES' : 'NO' },
        ...(state.owner ? [{ name: 'owner_user_id' }] : [])]]
      if (table === 'schedule_imports') return [[{ name: 'source_type' }]]
    }
    if (sql.includes('information_schema.STATISTICS')) return [state.ownerIndex ? [{ name: 'student_plans_owner_stage_type_idx' }] : []]
    if (sql.includes('information_schema.KEY_COLUMN_USAGE')) return [state.ownerKey ? [{ name: 'student_plans_owner_user_id_fk' }] : []]
    if (sql.includes('COLUMN_TYPE AS type')) return [[{ type: state.manualSource ? "enum('spreadsheet','image','manual')" : "enum('spreadsheet','image')" }]]
    if (sql.includes('ADD COLUMN current_stage VARCHAR')) state.profileStage = true
    if (sql.includes('ADD COLUMN current_stage_mode')) state.profileMode = true
    if (sql.includes('ADD COLUMN owner_user_id')) state.owner = true
    if (sql.includes('ADD INDEX student_plans_owner_stage_type_idx')) state.ownerIndex = true
    if (sql.includes('ADD CONSTRAINT student_plans_owner_user_id_fk')) state.ownerKey = true
    if (sql.includes('MODIFY COLUMN student_id')) state.nullableStudent = true
    if (sql.includes('MODIFY COLUMN source_type')) state.manualSource = true
    return [[]]
  } } as any
  await upgradePersonalWorkspace(db)
  const firstDdl = statements.filter(sql => sql.startsWith('ALTER TABLE'))
  assert.equal(firstDdl.length, 7)
  assert.ok(statements.some(sql => sql.includes('COALESCE(user_profiles.current_stage')))
  await upgradePersonalWorkspace(db)
  assert.equal(statements.filter(sql => sql.startsWith('ALTER TABLE')).length, firstDdl.length)
  assert.deepEqual(Object.values(state), Array(Object.keys(state).length).fill(true))
  assert.equal(statements.some(sql => /DELETE\s+FROM|DROP\s+TABLE|TRUNCATE/i.test(sql)), false)
})
