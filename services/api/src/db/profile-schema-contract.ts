export type ProfileColumn = { name: string; dataType: string; nullable: string }
export const PROFILE_COLUMNS = ['id','user_id','university','major','current_grade','enrollment_year','gpa_text','rank_text','created_at','updated_at']
export const ENROLLMENT_YEAR_DDL = 'ALTER TABLE user_profiles ADD COLUMN enrollment_year INT NULL AFTER current_grade'
export function inspectProfileSchema(columns: ProfileColumn[]) {
  const byName = new Map(columns.map(column => [column.name,column]))
  const missing = PROFILE_COLUMNS.filter(name => !byName.has(name))
  const incompatible = columns.filter(column => {
    if(!PROFILE_COLUMNS.includes(column.name))return false
    const expectedType=['created_at','updated_at'].includes(column.name)?'timestamp':column.name==='enrollment_year'?'int':'varchar'
    const expectedNull=['id','user_id','created_at','updated_at'].includes(column.name)?'NO':'YES'
    return column.dataType!==expectedType || column.nullable!==expectedNull
  }).map(column=>column.name)
  const compatible = incompatible.length === 0
  return { tableExists: columns.length > 0, missing, incompatible, compatible,
    migrationNeeded: missing.length === 1 && missing[0] === 'enrollment_year' && compatible,
    ready: missing.length === 0 && compatible }
}
