import mysql from 'mysql2/promise'
import 'dotenv/config'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is required')
const connection = await mysql.createConnection(url)
try {
  await connection.query(`CREATE TABLE IF NOT EXISTS credit_plan_objects (
    id varchar(36) NOT NULL,
    name varchar(120) NOT NULL,
    version int unsigned NOT NULL DEFAULT 1,
    note varchar(1000) NULL,
    creator_user_id varchar(36) NOT NULL,
    pin_salt char(32) NULL,
    pin_hash char(128) NULL,
    failed_attempts int unsigned NOT NULL DEFAULT 0,
    locked_until timestamp NULL,
    count_jc000 int unsigned NOT NULL,
    count_jc001 int unsigned NOT NULL,
    count_jc002 int unsigned NOT NULL,
    count_jc003 int unsigned NOT NULL,
    estimated_cost_fen int unsigned NULL,
    cost_verified_at timestamp NULL,
    cost_config_fingerprint char(64) NULL,
    status enum('candidate','active','disabled','archived') NOT NULL DEFAULT 'candidate',
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT credit_plan_creator_fk FOREIGN KEY (creator_user_id) REFERENCES users (id)
  ) ENGINE=InnoDB`)
  const [fingerprintColumns] = await connection.query<mysql.RowDataPacket[]>(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='credit_plan_objects' AND COLUMN_NAME='cost_config_fingerprint'",
  )
  if (!fingerprintColumns.length) {
    await connection.query('ALTER TABLE credit_plan_objects ADD COLUMN cost_config_fingerprint char(64) NULL AFTER cost_verified_at')
  }

  await connection.query(`CREATE TABLE IF NOT EXISTS credit_plan_head (
    id tinyint unsigned NOT NULL,
    active_plan_id varchar(36) NULL,
    version int unsigned NOT NULL DEFAULT 0,
    pin_salt char(32) NULL,
    pin_hash char(128) NULL,
    failed_attempts int unsigned NOT NULL DEFAULT 0,
    locked_until timestamp NULL,
    initialized tinyint(1) NOT NULL DEFAULT 0,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT credit_plan_head_active_fk FOREIGN KEY (active_plan_id) REFERENCES credit_plan_objects (id)
  ) ENGINE=InnoDB`)
  await connection.query(`CREATE TABLE IF NOT EXISTS credit_plan_events (
    id varchar(36) NOT NULL,
    plan_id varchar(36) NULL,
    actor_user_id varchar(36) NOT NULL,
    action varchar(40) NOT NULL,
    head_version int unsigned NOT NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY credit_plan_events_plan (plan_id, created_at),
    CONSTRAINT credit_plan_events_plan_fk FOREIGN KEY (plan_id) REFERENCES credit_plan_objects (id),
    CONSTRAINT credit_plan_events_actor_fk FOREIGN KEY (actor_user_id) REFERENCES users (id)
  ) ENGINE=InnoDB`)

  // Nullable snapshots leave every historical order and its existing
  // amount_fen/credit_amount untouched. Only newly created orders fill these.
  const additions = [
    ['sku_key', 'varchar(16) NULL'],
    ['plan_id', 'varchar(36) NULL'],
    ['plan_version', 'int unsigned NULL'],
    ['pay_environment', 'varchar(16) NULL'],
    ['wechat_product_id', 'varchar(128) NULL'],
  ] as const
  for (const [name, definition] of additions) {
    const [rows] = await connection.query<mysql.RowDataPacket[]>(
      'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?',
      ['payment_orders', name],
    )
    if (!rows.length) await connection.query(`ALTER TABLE payment_orders ADD COLUMN ${name} ${definition}`)
  }
  const [foreignKeys] = await connection.query<mysql.RowDataPacket[]>(
    "SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payment_orders' AND COLUMN_NAME='plan_id' AND REFERENCED_TABLE_NAME='credit_plan_objects'",
  )
  if (!foreignKeys.length) {
    const [indexes] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payment_orders' AND INDEX_NAME='payment_orders_plan_id_idx'")
    if (!indexes.length) await connection.query('ALTER TABLE payment_orders ADD KEY payment_orders_plan_id_idx (plan_id)')
    await connection.query(`ALTER TABLE payment_orders
      ADD CONSTRAINT payment_orders_plan_fk FOREIGN KEY (plan_id) REFERENCES credit_plan_objects (id)`)
  }

  // Preserve the old settings and free-grant policy in admin_control_boxes.
  // Their previous two prices cannot prove a new four-SKU cost/merchant check.
  const [tables] = await connection.query<mysql.RowDataPacket[]>(
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='admin_control_boxes'",
  )
  if (tables.length) {
    await connection.beginTransaction()
    try {
      const [rows] = await connection.query<mysql.RowDataPacket[]>(
        "SELECT * FROM admin_control_boxes WHERE box='settings' FOR UPDATE",
      )
      const old = rows[0]
      if (old) {
        const legacyId = '00000000-0000-4000-8000-00000000c001'
        await connection.query(
          `INSERT IGNORE INTO credit_plan_objects
           (id,name,version,note,creator_user_id,count_jc000,count_jc001,count_jc002,count_jc003,
            estimated_cost_fen,cost_verified_at,status,created_at)
           SELECT ?, '原有次数设置', 1, '旧设置迁移；微信商品映射及固定售价待核实',
                  owner_user_id,2,1,5,10,NULL,NULL,'active',created_at
             FROM admin_control_boxes WHERE box='settings'`, [legacyId],
        )
        await connection.query(
          `INSERT IGNORE INTO credit_plan_head
           (id,active_plan_id,version,pin_salt,pin_hash,failed_attempts,locked_until,initialized)
           SELECT 1,?,version,pin_salt,pin_hash,failed_attempts,locked_until,1
             FROM admin_control_boxes WHERE box='settings'`, [legacyId],
        )
      }
      await connection.commit()
    } catch (error) { await connection.rollback(); throw error }
  }
  console.log('CREDIT_PLAN_OBJECTS_SCHEMA_READY')
} finally { await connection.end() }
