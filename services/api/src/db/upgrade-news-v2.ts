import mysql from 'mysql2/promise'
import 'dotenv/config'
import { inspectNewsV2Schema, validateNewsV2SchemaSnapshot } from './news-v2-schema-contract.js'

// News V2 is a separate, explicitly approved production migration. This script
// is never imported by the server and must not run during normal deployment.
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required')
const db = await mysql.createConnection(databaseUrl)
try {
  const [base] = await db.query<mysql.RowDataPacket[]>(`SELECT t.table_name AS tableName,t.engine AS engineName,
    c.data_type AS dataType,c.character_maximum_length AS maxLength,c.is_nullable AS nullableFlag,
    c.character_set_name AS characterSet,c.collation_name AS collationName
    FROM information_schema.tables t JOIN information_schema.columns c
      ON c.table_schema=t.table_schema AND c.table_name=t.table_name AND c.column_name='id'
    WHERE t.table_schema=DATABASE() AND t.table_name IN ('news_posts','users')`)
  if (base.length !== 2 || base.some((row) => String(row.engineName).toUpperCase() !== 'INNODB' ||
    String(row.dataType).toLowerCase() !== 'varchar' || Number(row.maxLength) !== 36 ||
    String(row.nullableFlag).toUpperCase() !== 'NO' || String(row.characterSet).toLowerCase() !== 'utf8mb4')) {
    throw new Error('news_v2_base_schema_not_ready')
  }
  const collations = new Set(base.map((row) => String(row.collationName)))
  const baseCollation = [...collations][0] ?? ''
  if (collations.size !== 1 || !/^[a-zA-Z0-9_]+$/.test(baseCollation)) {
    throw new Error('news_v2_base_id_collation_mismatch')
  }
  const preflightIssues = validateNewsV2SchemaSnapshot(await inspectNewsV2Schema(db), { allowMissingTables: true })
  if (preflightIssues.length) throw new Error('news_v2_incompatible_existing_schema:' + preflightIssues.join('|'))

  // Match the existing FK target collation instead of assuming a server-wide
  // utf8mb4 default. The value comes from information_schema and is allowlisted.
  const tableOptions = `ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE ${baseCollation}`
  const statements = [
    `CREATE TABLE IF NOT EXISTS news_display_states (
      post_id VARCHAR(36) PRIMARY KEY,
      phase ENUM('normal','buffering','retired','source_invalid') NOT NULL,
      buffered_at TIMESTAMP NULL, retire_at TIMESTAMP NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_news_display_phase_retire (phase,retire_at),
      CONSTRAINT fk_news_display_post FOREIGN KEY(post_id) REFERENCES news_posts(id)
    ) ${tableOptions}`,
    `CREATE TABLE IF NOT EXISTS news_favorites (
      user_id VARCHAR(36) NOT NULL, post_id VARCHAR(36) NOT NULL,
      original_url TEXT NOT NULL, title VARCHAR(255) NOT NULL,
      source_time TIMESTAMP NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(user_id,post_id), KEY idx_news_fav_user_time(user_id,created_at),
      CONSTRAINT fk_news_fav_user FOREIGN KEY(user_id) REFERENCES users(id),
      CONSTRAINT fk_news_fav_post FOREIGN KEY(post_id) REFERENCES news_posts(id)
    ) ${tableOptions}`,
    `CREATE TABLE IF NOT EXISTS news_retirement_batches (
      id VARCHAR(36) PRIMARY KEY, entered_json JSON NOT NULL,
      affected_json JSON NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ${tableOptions}`,
    `CREATE TABLE IF NOT EXISTS news_retirement_tasks (
      id VARCHAR(36) PRIMARY KEY, batch_id VARCHAR(36) NOT NULL,
      post_id VARCHAR(36) NOT NULL,
      state ENUM('todo','acknowledged','doing','feedback') NOT NULL DEFAULT 'todo',
      note TEXT NULL, updated_by VARCHAR(36) NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_news_task_batch_post(batch_id,post_id),
      KEY idx_news_task_state(state,updated_at),
      CONSTRAINT fk_news_task_batch FOREIGN KEY(batch_id) REFERENCES news_retirement_batches(id),
      CONSTRAINT fk_news_task_post FOREIGN KEY(post_id) REFERENCES news_posts(id),
      CONSTRAINT fk_news_task_actor FOREIGN KEY(updated_by) REFERENCES users(id)
    ) ${tableOptions}`,
    `CREATE TABLE IF NOT EXISTS news_retirement_reads (
      batch_id VARCHAR(36) NOT NULL, user_id VARCHAR(36) NOT NULL,
      read_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(batch_id,user_id),
      CONSTRAINT fk_news_read_batch FOREIGN KEY(batch_id) REFERENCES news_retirement_batches(id),
      CONSTRAINT fk_news_read_user FOREIGN KEY(user_id) REFERENCES users(id)
    ) ${tableOptions}`,
    `CREATE TABLE IF NOT EXISTS news_task_audit (
      id VARCHAR(36) PRIMARY KEY, task_id VARCHAR(36) NOT NULL,
      actor_id VARCHAR(36) NOT NULL, from_state VARCHAR(20) NOT NULL,
      to_state VARCHAR(20) NOT NULL, note TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_news_task_audit_task_time(task_id,created_at),
      CONSTRAINT fk_news_audit_task FOREIGN KEY(task_id) REFERENCES news_retirement_tasks(id),
      CONSTRAINT fk_news_audit_actor FOREIGN KEY(actor_id) REFERENCES users(id)
    ) ${tableOptions}`,
    `CREATE TABLE IF NOT EXISTS news_sync_runs (
      id VARCHAR(36) PRIMARY KEY,
      status ENUM('checked','partial','failed') NOT NULL,
      checked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      latest_source_time TIMESTAMP NULL,
      fetched INT NOT NULL DEFAULT 0, created_count INT NOT NULL DEFAULT 0,
      updated_count INT NOT NULL DEFAULT 0, failed_count INT NOT NULL DEFAULT 0,
      error_code VARCHAR(80) NULL,
      KEY idx_news_sync_checked(checked_at)
    ) ${tableOptions}`,
  ]
  for (const statement of statements) await db.query(statement)
  const finalIssues = validateNewsV2SchemaSnapshot(await inspectNewsV2Schema(db))
  if (finalIssues.length) throw new Error('news_v2_schema_verification_failed:' + finalIssues.join('|'))
  console.log('NEWS_V2_SCHEMA_READY; no historical articles/favorites/tasks were invented')
} finally { await db.end() }
