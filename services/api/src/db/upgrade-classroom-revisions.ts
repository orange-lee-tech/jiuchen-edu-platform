import mysql from 'mysql2/promise'
import 'dotenv/config'

function connectionConfig() {
  if (process.env.DATABASE_URL) {
    return { uri: process.env.DATABASE_URL }
  }

  if (
    process.env.DB_HOST &&
    process.env.DB_USER &&
    process.env.DB_PASSWORD &&
    process.env.DB_NAME
  ) {
    return {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    }
  }

  throw new Error('DATABASE_URL or split DB_* configuration is required')
}

const connection = await mysql.createConnection(connectionConfig())

await connection.query(`CREATE TABLE IF NOT EXISTS \`plan_revisions\` (
  \`id\` varchar(36) NOT NULL,
  \`student_id\` varchar(36) NOT NULL,
  \`stage_code\` varchar(32) NOT NULL,
  \`type\` enum('gpa','english','competition','research','internship') NOT NULL,
  \`title\` varchar(160) NOT NULL,
  \`items_json\` json NOT NULL,
  \`editor_user_id\` varchar(36) NOT NULL,
  \`editor_role\` enum('student','teacher','staff','admin') NOT NULL,
  \`status\` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  \`review_note\` varchar(500) NULL,
  \`reviewed_by_user_id\` varchar(36) NULL,
  \`reviewed_at\` timestamp NULL,
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`plan_revisions_student_stage_type_idx\` (\`student_id\`,\`stage_code\`,\`type\`,\`created_at\`),
  KEY \`plan_revisions_status_idx\` (\`status\`,\`created_at\`),
  CONSTRAINT \`plan_revisions_student_id_students_id_fk\`
    FOREIGN KEY (\`student_id\`) REFERENCES \`students\` (\`id\`),
  CONSTRAINT \`plan_revisions_editor_user_id_users_id_fk\`
    FOREIGN KEY (\`editor_user_id\`) REFERENCES \`users\` (\`id\`),
  CONSTRAINT \`plan_revisions_reviewed_by_user_id_users_id_fk\`
    FOREIGN KEY (\`reviewed_by_user_id\`) REFERENCES \`users\` (\`id\`)
) ENGINE=InnoDB`)

await connection.query(`CREATE TABLE IF NOT EXISTS \`schedule_imports\` (
  \`id\` varchar(36) NOT NULL,
  \`user_id\` varchar(36) NOT NULL,
  \`student_id\` varchar(36) NULL,
  \`source_type\` enum('spreadsheet','image') NOT NULL,
  \`file_id\` varchar(1000) NOT NULL,
  \`file_name\` varchar(255) NOT NULL,
  \`status\` enum('uploaded','parsing','parsed','failed') NOT NULL DEFAULT 'uploaded',
  \`parsed_json\` json NULL,
  \`error_code\` varchar(120) NULL,
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`schedule_imports_user_created_idx\` (\`user_id\`,\`created_at\`),
  CONSTRAINT \`schedule_imports_user_id_users_id_fk\`
    FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`),
  CONSTRAINT \`schedule_imports_student_id_students_id_fk\`
    FOREIGN KEY (\`student_id\`) REFERENCES \`students\` (\`id\`)
) ENGINE=InnoDB`)

await connection.end()
console.log('✓ classroom revision and schedule import schema is ready')
