import type mysql from 'mysql2/promise'

export async function upgradeAiOperations(db: Pick<mysql.Connection, 'query'>) {
  const [columns] = await db.query<mysql.RowDataPacket[]>(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ai_balance_snapshots'")
  if (!columns.length) throw new Error('ai_balance_snapshots_migration_required')
  const existing = new Set(columns.map(row => String(row.COLUMN_NAME ?? row.column_name)))
  const additions: Record<string, string> = {
    source: "varchar(20) NOT NULL DEFAULT 'manual'", source_url: 'varchar(500) NULL',
    object_version: 'int unsigned NULL', granted_balance: 'decimal(24,8) NULL',
    topped_up_balance: 'decimal(24,8) NULL', is_available: 'tinyint(1) NULL',
  }
  for (const [name, definition] of Object.entries(additions)) {
    if (!existing.has(name)) await db.query(`ALTER TABLE ai_balance_snapshots ADD COLUMN ${name} ${definition}`)
  }
  // Wider exact decimal storage preserves all previous manual observations.
  await db.query('ALTER TABLE ai_balance_snapshots MODIFY balance decimal(24,8) NOT NULL, MODIFY warning_threshold decimal(24,8) NOT NULL')
  for (const [table, fields] of Object.entries({
    assessment_ai_price_source_checks: { parsed_draft_json: 'json NULL', parser_version: 'varchar(80) NULL', parse_error: 'varchar(120) NULL' },
    assessment_ai_price_versions: { peak_input_cache_hit_per_million: 'decimal(16,6) NULL' },
  })) {
    const [rows] = await db.query<mysql.RowDataPacket[]>(
      'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?', [table])
    const names = new Set(rows.map(row => String(row.COLUMN_NAME ?? row.column_name)))
    for (const [name, definition] of Object.entries(fields)) if (!names.has(name))
      await db.query(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`)
  }
  await db.query(`CREATE TABLE IF NOT EXISTS ai_balance_settings (
    object_id varchar(36) NOT NULL, currency char(3) NOT NULL,
    warning_threshold decimal(24,8) NOT NULL DEFAULT 0, updated_by varchar(36) NOT NULL,
    last_attempt_at timestamp NULL, last_error varchar(80) NULL,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (object_id,currency)
  ) ENGINE=InnoDB`)
  await db.query(`CREATE TABLE IF NOT EXISTS ai_assessment_balance_windows (
    assessment_id varchar(36) NOT NULL PRIMARY KEY, object_id varchar(36) NOT NULL,
    object_version int unsigned NULL, head_version int unsigned NULL, configuration_fingerprint char(64) NULL,
    before_json json NULL, after_json json NULL,
    status varchar(20) NOT NULL DEFAULT 'unavailable', reason varchar(120) NOT NULL,
    started_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, completed_at timestamp NULL,
    KEY ai_balance_windows_object (object_id,started_at)
  ) ENGINE=InnoDB`)
  const [windowColumns]=await db.query<mysql.RowDataPacket[]>(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ai_assessment_balance_windows'")
  const windowNames=new Set(windowColumns.map(row=>String(row.COLUMN_NAME??row.column_name)))
  if(!windowNames.has('head_version'))await db.query('ALTER TABLE ai_assessment_balance_windows ADD COLUMN head_version int unsigned NULL')
  if(!windowNames.has('configuration_fingerprint'))await db.query('ALTER TABLE ai_assessment_balance_windows ADD COLUMN configuration_fingerprint char(64) NULL')
}
