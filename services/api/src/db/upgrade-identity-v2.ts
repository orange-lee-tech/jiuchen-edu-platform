import mysql from 'mysql2/promise'
import 'dotenv/config'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required')

const connection = await mysql.createConnection(databaseUrl)

async function columnExists(table: string, column: string) {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?
      LIMIT 1`,
    [table, column],
  )
  return rows.length > 0
}

async function tableExists(table: string) {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT 1 FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = ?
      LIMIT 1`,
    [table],
  )
  return rows.length > 0
}

try {
  await connection.query('SELECT 1')
  console.log('✓ database connection ok')

  if (!(await columnExists('users', 'status'))) {
    await connection.query(
      "ALTER TABLE `users` ADD COLUMN `status` ENUM('active','deleted') NOT NULL DEFAULT 'active' AFTER `role`",
    )
    console.log('✓ users.status added')
  } else {
    console.log('✓ users.status already exists')
  }

  if (!(await columnExists('users', 'deleted_at'))) {
    await connection.query(
      'ALTER TABLE `users` ADD COLUMN `deleted_at` TIMESTAMP NULL AFTER `display_name`',
    )
    console.log('✓ users.deleted_at added')
  } else {
    console.log('✓ users.deleted_at already exists')
  }

  if (!(await tableExists('internal_ids'))) {
    await connection.query(
      `CREATE TABLE \`internal_ids\` (
        \`id\` varchar(36) NOT NULL,
        \`business_id\` varchar(40) NOT NULL,
        \`type\` enum('student','teacher','admin') NOT NULL,
        \`claim_mode\` enum('self','admin') NOT NULL DEFAULT 'self',
        \`status\` enum('available','claimed','disabled') NOT NULL DEFAULT 'available',
        \`user_id\` varchar(36) NULL,
        \`entity_id\` varchar(36) NULL,
        \`batch\` varchar(40) NULL,
        \`claimed_at\` timestamp NULL,
        \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`internal_ids_business_id_unique\` (\`business_id\`),
        UNIQUE KEY \`internal_ids_user_id_unique\` (\`user_id\`),
        KEY \`internal_ids_entity_id_idx\` (\`entity_id\`),
        CONSTRAINT \`internal_ids_user_id_users_id_fk\`
          FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`)
      ) ENGINE=InnoDB`,
    )
    console.log('✓ internal_ids created')
  } else {
    console.log('✓ internal_ids already exists')
  }


  if (!(await tableExists('news_posts'))) {
    await connection.query(
      `CREATE TABLE \`news_posts\` (
        \`id\` varchar(36) NOT NULL,
        \`source\` enum('manual','wechat_official') NOT NULL,
        \`source_key\` varchar(160) NOT NULL,
        \`title\` varchar(255) NOT NULL,
        \`summary\` varchar(500) NULL,
        \`cover_url\` varchar(1000) NULL,
        \`article_url\` varchar(1000) NULL,
        \`published_at\` timestamp NULL,
        \`status\` enum('active','hidden') NOT NULL DEFAULT 'active',
        \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`news_posts_source_key_unique\` (\`source_key\`)
      ) ENGINE=InnoDB`,
    )
    console.log('✓ news_posts created')
  } else {
    console.log('✓ news_posts already exists')
  }

  console.log('✓ identity v2 schema is ready')
} finally {
  await connection.end()
}
