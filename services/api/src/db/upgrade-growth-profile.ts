import mysql from 'mysql2/promise'
import 'dotenv/config'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required')

const connection = await mysql.createConnection(databaseUrl)

try {
  await connection.query(`CREATE TABLE IF NOT EXISTS \`growth_records\` (
    \`id\` varchar(36) NOT NULL,
    \`user_id\` varchar(36) NOT NULL,
    \`type\` enum('course','language','research','publication','competition','project','internship','campus','award','skill','other') NOT NULL,
    \`title\` varchar(220) NOT NULL,
    \`organization\` varchar(220) NULL,
    \`role\` varchar(160) NULL,
    \`start_date\` varchar(32) NULL,
    \`end_date\` varchar(32) NULL,
    \`description\` varchar(2000) NULL,
    \`result\` varchar(1200) NULL,
    \`standard_expression\` varchar(2400) NULL,
    \`evidence_json\` json NULL,
    \`metadata_json\` json NULL,
    \`source_type\` enum('manual','assessment','classroom','admin') NOT NULL DEFAULT 'manual',
    \`source_record_id\` varchar(80) NULL,
    \`source_key\` varchar(220) NOT NULL,
    \`user_confirmed\` boolean NOT NULL DEFAULT false,
    \`user_confirmed_at\` timestamp NULL,
    \`teacher_confirmed\` boolean NOT NULL DEFAULT false,
    \`teacher_confirmed_at\` timestamp NULL,
    \`admin_confirmed\` boolean NOT NULL DEFAULT false,
    \`admin_confirmed_at\` timestamp NULL,
    \`status\` enum('active','archived') NOT NULL DEFAULT 'active',
    \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`growth_records_source_key_uq\` (\`source_key\`),
    KEY \`growth_records_user_id_idx\` (\`user_id\`),
    KEY \`growth_records_type_idx\` (\`type\`),
    CONSTRAINT \`growth_records_user_id_users_id_fk\`
      FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`)
  ) ENGINE=InnoDB`)
  console.log('✓ growth profile foundation schema is ready')
} finally {
  await connection.end()
}
