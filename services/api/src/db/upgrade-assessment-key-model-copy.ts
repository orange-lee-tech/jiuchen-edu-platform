import mysql from 'mysql2/promise'
import 'dotenv/config'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required')
const connection = await mysql.createConnection(databaseUrl)
try {
  const [columns] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='assessment_key_objects'
       AND COLUMN_NAME='source_object_id'`,
  )
  if (!columns.length) {
    await connection.query(`ALTER TABLE assessment_key_objects
      ADD COLUMN source_object_id varchar(36) NULL,
      ADD KEY assessment_key_objects_source (source_object_id),
      ADD CONSTRAINT assessment_key_objects_source_fk
        FOREIGN KEY (source_object_id) REFERENCES assessment_key_objects (id)`)
  }
  console.info('assessment_key_model_copy_schema_ready')
} finally {
  await connection.end()
}
