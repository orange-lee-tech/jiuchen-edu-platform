import 'dotenv/config'
import { eq } from 'drizzle-orm'
import { loadEnv } from '../config/env.js'
import { createDatabaseContext } from './client.js'
import { students } from './schema.js'

const DEMO_STUDENT_ID = '00000000-0000-4000-8000-000000000001'

const env = loadEnv()
const database = createDatabaseContext(env)

if (!database.configured) {
  throw new Error('DATABASE_URL is required to seed the database')
}

const existing = await database.db
  .select({ id: students.id })
  .from(students)
  .where(eq(students.id, DEMO_STUDENT_ID))
  .limit(1)

if (existing.length === 0) {
  await database.db.insert(students).values({
    id: DEMO_STUDENT_ID,
    name: '演示学员',
    university: '示例大学',
    major: '示例专业',
    currentStage: 'freshman-fall',
  })
  console.log(`Seeded demo student: ${DEMO_STUDENT_ID}`)
} else {
  console.log('Demo student already exists; no changes made.')
}

await database.pool.end()
