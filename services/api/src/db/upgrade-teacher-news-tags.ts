import mysql from 'mysql2/promise'
import { pathToFileURL } from 'node:url'
import 'dotenv/config'

export async function upgradeTeacherNewsTags(db: Pick<mysql.Connection, 'query'>) {
  // Additive scope storage: global news tags and existing assignments are untouched.
  // No cross-table FK is added to legacy tables with mixed character sets.
  await db.query(`CREATE TABLE IF NOT EXISTS teacher_news_tags (
    post_id varchar(36) NOT NULL, teacher_id varchar(36) NOT NULL,
    tags_json json NOT NULL,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (post_id,teacher_id),
    KEY teacher_news_tags_owner (teacher_id,updated_at)
  ) ENGINE=InnoDB`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.DATABASE_URL) throw new Error('database_configuration_missing')
  const db = await mysql.createConnection(process.env.DATABASE_URL)
  try { await upgradeTeacherNewsTags(db); console.info('teacher_news_tags_schema_ready') }
  finally { await db.end() }
}
