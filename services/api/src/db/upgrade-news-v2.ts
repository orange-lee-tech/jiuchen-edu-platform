import mysql from 'mysql2/promise'
import 'dotenv/config'

// News V2 is a separate, explicitly approved production migration. This script
// is never imported by the server and must not run during normal deployment.
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required')
const db = await mysql.createConnection(databaseUrl)
try {
  const [base] = await db.query<mysql.RowDataPacket[]>(`SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('news_posts','users')`)
  if (Number(base[0]?.n) !== 2) throw new Error('news_v2_base_schema_not_ready')
  const requiredColumns:Record<string,string[]>= {
    news_display_states:['post_id','phase','buffered_at','retire_at','updated_at'],
    news_favorites:['user_id','post_id','original_url','title','source_time','created_at'],
    news_retirement_batches:['id','entered_json','affected_json','created_at'],
    news_retirement_tasks:['id','batch_id','post_id','state','note','updated_by','updated_at'],
    news_retirement_reads:['batch_id','user_id','read_at'],
    news_task_audit:['id','task_id','actor_id','from_state','to_state','note','created_at'],
    news_sync_runs:['id','status','checked_at','latest_source_time','fetched','created_count','updated_count','failed_count','error_code'],
  }
  const [existingColumns]=await db.query<mysql.RowDataPacket[]>(`SELECT table_name,column_name FROM information_schema.columns
    WHERE table_schema=DATABASE() AND table_name IN (${Object.keys(requiredColumns).map(()=>'?').join(',')})`,Object.keys(requiredColumns))
  for(const [name,columns] of Object.entries(requiredColumns)){
    const found=existingColumns.filter(row=>row.table_name===name).map(row=>String(row.column_name))
    if(found.length && columns.some(column=>!found.includes(column)))throw new Error('news_v2_incompatible_'+name)
  }
  const statements = [
    `CREATE TABLE IF NOT EXISTS news_display_states (
      post_id VARCHAR(36) PRIMARY KEY,
      phase ENUM('normal','buffering','retired','source_invalid') NOT NULL,
      buffered_at TIMESTAMP NULL, retire_at TIMESTAMP NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_news_display_phase_retire (phase,retire_at),
      CONSTRAINT fk_news_display_post FOREIGN KEY(post_id) REFERENCES news_posts(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS news_favorites (
      user_id VARCHAR(36) NOT NULL, post_id VARCHAR(36) NOT NULL,
      original_url TEXT NOT NULL, title VARCHAR(255) NOT NULL,
      source_time TIMESTAMP NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(user_id,post_id), KEY idx_news_fav_user_time(user_id,created_at),
      CONSTRAINT fk_news_fav_user FOREIGN KEY(user_id) REFERENCES users(id),
      CONSTRAINT fk_news_fav_post FOREIGN KEY(post_id) REFERENCES news_posts(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS news_retirement_batches (
      id VARCHAR(36) PRIMARY KEY, entered_json JSON NOT NULL,
      affected_json JSON NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS news_retirement_reads (
      batch_id VARCHAR(36) NOT NULL, user_id VARCHAR(36) NOT NULL,
      read_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(batch_id,user_id),
      CONSTRAINT fk_news_read_batch FOREIGN KEY(batch_id) REFERENCES news_retirement_batches(id),
      CONSTRAINT fk_news_read_user FOREIGN KEY(user_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS news_task_audit (
      id VARCHAR(36) PRIMARY KEY, task_id VARCHAR(36) NOT NULL,
      actor_id VARCHAR(36) NOT NULL, from_state VARCHAR(20) NOT NULL,
      to_state VARCHAR(20) NOT NULL, note TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_news_task_audit_task_time(task_id,created_at),
      CONSTRAINT fk_news_audit_task FOREIGN KEY(task_id) REFERENCES news_retirement_tasks(id),
      CONSTRAINT fk_news_audit_actor FOREIGN KEY(actor_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS news_sync_runs (
      id VARCHAR(36) PRIMARY KEY,
      status ENUM('checked','partial','failed') NOT NULL,
      checked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      latest_source_time TIMESTAMP NULL,
      fetched INT NOT NULL DEFAULT 0, created_count INT NOT NULL DEFAULT 0,
      updated_count INT NOT NULL DEFAULT 0, failed_count INT NOT NULL DEFAULT 0,
      error_code VARCHAR(80) NULL,
      KEY idx_news_sync_checked(checked_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  ]
  for (const statement of statements) await db.query(statement)
  const [tables] = await db.query<mysql.RowDataPacket[]>(`SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name LIKE 'news_%'`)
  const names = new Set(tables.map(row => String(row.table_name)))
  for (const required of Object.keys(requiredColumns)) {
    if (!names.has(required)) throw new Error('news_v2_missing_' + required)
  }
  console.log('NEWS_V2_SCHEMA_READY; no historical articles/favorites/tasks were invented')
} finally { await db.end() }
