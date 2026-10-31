import mysql from 'mysql2/promise'
import 'dotenv/config'
import { upgradeAiOperations } from './ai-operations-schema.js'
if (!process.env.DATABASE_URL) throw new Error('database_configuration_missing')
const db = await mysql.createConnection(process.env.DATABASE_URL)
try { await upgradeAiOperations(db); console.info('ai_operations_schema_ready') }
finally { await db.end() }
