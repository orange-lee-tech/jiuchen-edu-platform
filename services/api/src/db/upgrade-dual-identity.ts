import mysql from 'mysql2/promise'
import 'dotenv/config'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is required')
const db = await mysql.createConnection(url)
try {
  const [duplicates] = await db.query<mysql.RowDataPacket[]>(
    `SELECT user_id,type,COUNT(*) AS n FROM internal_ids WHERE user_id IS NOT NULL
     GROUP BY user_id,type HAVING COUNT(*) > 1 LIMIT 1`)
  if (duplicates.length) throw new Error('duplicate_user_identity_type_requires_review')
  const [indexes] = await db.query<mysql.RowDataPacket[]>(
    `SELECT INDEX_NAME,SEQ_IN_INDEX,COLUMN_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='internal_ids' ORDER BY INDEX_NAME,SEQ_IN_INDEX`)
  const hasPair = indexes.some((row) => row.INDEX_NAME === 'internal_ids_user_type_unique')
  if (!hasPair) await db.query(
    'ALTER TABLE internal_ids ADD UNIQUE KEY internal_ids_user_type_unique (user_id,type)')
  const single = indexes.some((row) => row.INDEX_NAME === 'internal_ids_user_id_unique')
  if (single) await db.query('ALTER TABLE internal_ids DROP INDEX internal_ids_user_id_unique')

  await db.query(`CREATE TABLE IF NOT EXISTS identity_events (
    id varchar(36) NOT NULL PRIMARY KEY,
    actor_user_id varchar(36) NOT NULL,
    identity_id varchar(36) NULL,
    action varchar(40) NOT NULL,
    old_role varchar(16) NULL,
    new_role varchar(16) NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY identity_events_actor (actor_user_id,created_at),
    CONSTRAINT identity_events_actor_fk FOREIGN KEY (actor_user_id) REFERENCES users(id),
    CONSTRAINT identity_events_identity_fk FOREIGN KEY (identity_id) REFERENCES internal_ids(id)
  ) ENGINE=InnoDB`)
  await db.query(`CREATE TABLE IF NOT EXISTS identity_admin_guard (
    id tinyint unsigned NOT NULL PRIMARY KEY
  ) ENGINE=InnoDB`)
  await db.query('INSERT IGNORE INTO identity_admin_guard (id) VALUES (1)')

  // Give legacy administrators an explicit binding, preserving users.role.
  // This also covers accounts that were provisioned before internal IDs existed.
  await db.query(`INSERT INTO internal_ids
      (id,business_id,type,claim_mode,status,user_id,claimed_at)
    SELECT UUID(), CONCAT('JCA-',UPPER(SUBSTRING(REPLACE(UUID(),'-',''),1,4)),
      '-',UPPER(SUBSTRING(REPLACE(UUID(),'-',''),1,4))),
      'admin','admin','claimed',u.id,CURRENT_TIMESTAMP()
    FROM users u LEFT JOIN internal_ids i ON i.user_id=u.id AND i.type='admin'
    WHERE u.role='admin' AND u.status='active' AND i.id IS NULL`)
  console.log('DUAL_IDENTITY_SCHEMA_READY')
} finally { await db.end() }
