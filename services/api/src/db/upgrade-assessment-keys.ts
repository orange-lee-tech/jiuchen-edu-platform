import mysql from 'mysql2/promise'
import 'dotenv/config'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is required')
const connection = await mysql.createConnection(url)
try {
  await connection.query(`CREATE TABLE IF NOT EXISTS assessment_key_objects (
    id varchar(36) NOT NULL,
    label varchar(120) NOT NULL,
    provider varchar(120) NULL,
    api_base_url varchar(500) NULL,
    model varchar(120) NULL,
    temperature decimal(3,2) NULL,
    encrypted_secret text NOT NULL,
    creator_user_id varchar(36) NOT NULL,
    note varchar(1000) NULL,
    pin_salt char(32) NULL,
    pin_hash char(128) NULL,
    failed_attempts int unsigned NOT NULL DEFAULT 0,
    locked_until timestamp NULL,
    status enum('candidate','active','disabled','archived') NOT NULL DEFAULT 'candidate',
    version int unsigned NOT NULL DEFAULT 1,
    last_test_result enum('passed','failed') NULL,
    last_test_at timestamp NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY assessment_key_objects_creator (creator_user_id),
    CONSTRAINT assessment_key_objects_creator_fk FOREIGN KEY (creator_user_id) REFERENCES users (id)
  ) ENGINE=InnoDB`)
  await connection.query(`CREATE TABLE IF NOT EXISTS assessment_key_head (
    id tinyint unsigned NOT NULL,
    active_object_id varchar(36) NULL,
    version int unsigned NOT NULL DEFAULT 0,
    pin_salt char(32) NULL,
    pin_hash char(128) NULL,
    failed_attempts int unsigned NOT NULL DEFAULT 0,
    locked_until timestamp NULL,
    initialized tinyint(1) NOT NULL DEFAULT 0,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT assessment_key_head_active_fk FOREIGN KEY (active_object_id) REFERENCES assessment_key_objects (id)
  ) ENGINE=InnoDB`)
  await connection.query(`CREATE TABLE IF NOT EXISTS assessment_key_events (
    id varchar(36) NOT NULL,
    object_id varchar(36) NULL,
    actor_user_id varchar(36) NOT NULL,
    action varchar(40) NOT NULL,
    head_version int unsigned NOT NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY assessment_key_events_object (object_id, created_at),
    CONSTRAINT assessment_key_events_object_fk FOREIGN KEY (object_id) REFERENCES assessment_key_objects (id),
    CONSTRAINT assessment_key_events_actor_fk FOREIGN KEY (actor_user_id) REFERENCES users (id)
  ) ENGINE=InnoDB`)

  // The old active ciphertext and control PIN remain usable. The legacy object
  // deliberately has no independent object PIN: its plaintext PIN is unknown,
  // so the creator must set one before this object can be a future target.
  const [tables] = await connection.query<mysql.RowDataPacket[]>(
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='admin_control_boxes'",
  )
  if (tables.length) {
    await connection.beginTransaction()
    try {
      const [oldRows] = await connection.query<mysql.RowDataPacket[]>(
        "SELECT * FROM admin_control_boxes WHERE box='assessment_key' FOR UPDATE",
      )
      const old = oldRows[0]
      if (old?.encrypted_secret) {
        const legacyId = '00000000-0000-4000-8000-00000000a001'
        await connection.query(
          `INSERT IGNORE INTO assessment_key_objects
           (id,label,provider,api_base_url,model,temperature,encrypted_secret,
            creator_user_id,note,status,version,created_at)
           SELECT ?,?,?,?,?,?,encrypted_secret,owner_user_id,?,'active',1,created_at
             FROM admin_control_boxes WHERE box='assessment_key'`,
          [legacyId, '原有 AI 连接', process.env.ASSESSMENT_AI_PROVIDER ?? null,
            process.env.ASSESSMENT_AI_BASE_URL ?? null, process.env.ASSESSMENT_AI_MODEL ?? null,
            process.env.ASSESSMENT_AI_TEMPERATURE ?? null,
            '旧控制盒迁移；对象口令待创建者重新设置'],
        )
        await connection.query(
          `INSERT IGNORE INTO assessment_key_head
           (id,active_object_id,version,pin_salt,pin_hash,failed_attempts,locked_until,initialized)
           SELECT 1,?,version,pin_salt,pin_hash,failed_attempts,locked_until,1
             FROM admin_control_boxes WHERE box='assessment_key'`, [legacyId],
        )
      }
      await connection.commit()
    } catch (error) { await connection.rollback(); throw error }
  }
  console.log('ASSESSMENT_KEY_OBJECTS_SCHEMA_READY')
} finally { await connection.end() }
