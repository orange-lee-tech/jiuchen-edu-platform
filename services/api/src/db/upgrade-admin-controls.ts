import mysql from 'mysql2/promise'
import 'dotenv/config'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is required')
const connection = await mysql.createConnection(url)
try {
  await connection.query(`CREATE TABLE IF NOT EXISTS admin_control_boxes (
    box varchar(32) NOT NULL,
    version int unsigned NOT NULL DEFAULT 1,
    pin_salt char(32) NOT NULL,
    pin_hash char(128) NOT NULL,
    owner_user_id varchar(36) NOT NULL,
    payload_json json NULL,
    encrypted_secret text NULL,
    failed_attempts int unsigned NOT NULL DEFAULT 0,
    locked_until timestamp NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (box),
    CONSTRAINT admin_control_boxes_owner_fk FOREIGN KEY (owner_user_id) REFERENCES users (id)
  ) ENGINE=InnoDB`)
  await connection.query(`CREATE TABLE IF NOT EXISTS admin_control_audit (
    id varchar(36) NOT NULL,
    box varchar(32) NOT NULL,
    actor_user_id varchar(36) NOT NULL,
    action varchar(32) NOT NULL,
    version int unsigned NOT NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY admin_control_audit_box_created (box, created_at),
    CONSTRAINT admin_control_audit_actor_fk FOREIGN KEY (actor_user_id) REFERENCES users (id)
  ) ENGINE=InnoDB`)
  console.log('ADMIN_CONTROL_BOXES_SCHEMA_READY')
} finally {
  await connection.end()
}
