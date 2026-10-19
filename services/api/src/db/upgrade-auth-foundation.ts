import mysql from 'mysql2/promise'
import 'dotenv/config'

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required')
}

const connection = await mysql.createConnection(databaseUrl)

async function tableExists(tableName: string) {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT 1
       FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name = ?
      LIMIT 1`,
    [tableName],
  )
  return rows.length > 0
}

async function hasUniqueIndex(tableName: string, columnName: string) {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT 1
       FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND column_name = ?
        AND non_unique = 0
      LIMIT 1`,
    [tableName, columnName],
  )
  return rows.length > 0
}

async function ensureUsersRole() {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT column_type
       FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'users'
        AND column_name = 'role'
      LIMIT 1`,
  )

  if (rows.length === 0) {
    throw new Error('users.role is missing; refusing to continue')
  }

  const columnType = String(rows[0].column_type ?? '')
  if (columnType.includes("'teacher'")) {
    console.log('✓ users.role already includes teacher')
    return
  }

  await connection.query(
    "ALTER TABLE `users` MODIFY COLUMN `role` ENUM('user','student','teacher','staff','admin') NOT NULL DEFAULT 'user'",
  )
  console.log('✓ users.role added teacher')
}

async function ensureStudentUserUnique() {
  if (await hasUniqueIndex('students', 'user_id')) {
    console.log('✓ students.user_id already unique')
    return
  }

  const [duplicates] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT user_id, COUNT(*) AS count
       FROM students
      WHERE user_id IS NOT NULL
      GROUP BY user_id
     HAVING COUNT(*) > 1
      LIMIT 1`,
  )

  if (duplicates.length > 0) {
    throw new Error(
      'students.user_id contains duplicate bindings; refusing to add unique index',
    )
  }

  await connection.query(
    'ALTER TABLE `students` ADD UNIQUE INDEX `students_user_id_unique` (`user_id`)',
  )
  console.log('✓ students.user_id unique index added')
}

async function createMissingTable(name: string, ddl: string) {
  if (await tableExists(name)) {
    console.log(`✓ ${name} already exists`)
    return
  }

  await connection.query(ddl)
  console.log(`✓ ${name} created`)
}

try {
  await connection.query('SELECT 1')
  console.log('✓ database connection ok')

  await ensureUsersRole()
  await ensureStudentUserUnique()

  await createMissingTable(
    'user_profiles',
    `CREATE TABLE \`user_profiles\` (
      \`id\` varchar(36) NOT NULL,
      \`user_id\` varchar(36) NOT NULL,
      \`university\` varchar(160) NULL,
      \`major\` varchar(160) NULL,
      \`current_grade\` varchar(40) NULL,
      \`gpa_text\` varchar(80) NULL,
      \`rank_text\` varchar(80) NULL,
      \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`user_profiles_user_id_unique\` (\`user_id\`),
      CONSTRAINT \`user_profiles_user_id_users_id_fk\`
        FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`)
    ) ENGINE=InnoDB`,
  )

  await createMissingTable(
    'user_sessions',
    `CREATE TABLE \`user_sessions\` (
      \`id\` varchar(36) NOT NULL,
      \`user_id\` varchar(36) NOT NULL,
      \`token_hash\` varchar(64) NOT NULL,
      \`expires_at\` timestamp NOT NULL,
      \`revoked_at\` timestamp NULL,
      \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`user_sessions_token_hash_unique\` (\`token_hash\`),
      KEY \`user_sessions_user_id_idx\` (\`user_id\`),
      CONSTRAINT \`user_sessions_user_id_users_id_fk\`
        FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`)
    ) ENGINE=InnoDB`,
  )

  await createMissingTable(
    'user_agreements',
    `CREATE TABLE \`user_agreements\` (
      \`id\` varchar(36) NOT NULL,
      \`user_id\` varchar(36) NOT NULL,
      \`type\` enum('user_terms','privacy_policy') NOT NULL,
      \`version\` varchar(40) NOT NULL,
      \`accepted_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`user_agreements_user_id_idx\` (\`user_id\`),
      CONSTRAINT \`user_agreements_user_id_users_id_fk\`
        FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`)
    ) ENGINE=InnoDB`,
  )

  await createMissingTable(
    'teachers',
    `CREATE TABLE \`teachers\` (
      \`id\` varchar(36) NOT NULL,
      \`user_id\` varchar(36) NULL,
      \`name\` varchar(80) NOT NULL,
      \`title\` varchar(120) NULL,
      \`bio\` varchar(500) NULL,
      \`status\` enum('active','inactive') NOT NULL DEFAULT 'active',
      \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`teachers_user_id_unique\` (\`user_id\`),
      CONSTRAINT \`teachers_user_id_users_id_fk\`
        FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`)
    ) ENGINE=InnoDB`,
  )

  await createMissingTable(
    'student_teacher_assignments',
    `CREATE TABLE \`student_teacher_assignments\` (
      \`id\` varchar(36) NOT NULL,
      \`student_id\` varchar(36) NOT NULL,
      \`teacher_id\` varchar(36) NOT NULL,
      \`stage_code\` varchar(32) NULL,
      \`relationship\` enum('primary','support') NOT NULL DEFAULT 'primary',
      \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`student_teacher_assignments_student_idx\` (\`student_id\`),
      KEY \`student_teacher_assignments_teacher_idx\` (\`teacher_id\`),
      CONSTRAINT \`student_teacher_assignments_student_id_students_id_fk\`
        FOREIGN KEY (\`student_id\`) REFERENCES \`students\` (\`id\`),
      CONSTRAINT \`student_teacher_assignments_teacher_id_teachers_id_fk\`
        FOREIGN KEY (\`teacher_id\`) REFERENCES \`teachers\` (\`id\`)
    ) ENGINE=InnoDB`,
  )

  console.log('✓ auth/profile foundation schema is ready')
} finally {
  await connection.end()
}
