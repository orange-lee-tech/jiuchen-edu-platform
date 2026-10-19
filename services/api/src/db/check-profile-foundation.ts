import mysql from 'mysql2/promise'
import { createHash } from 'node:crypto'
import 'dotenv/config'
import { inspectProfileSchema, type ProfileColumn } from './profile-schema-contract.js'

async function check() {
  const url=process.env.DATABASE_URL
  if(!url)throw new Error('database_configuration_missing')
  const target=new URL(url)
  const db=await mysql.createConnection(url)
  try {
    const [names]=await db.query<mysql.RowDataPacket[]>('SELECT DATABASE() AS databaseName')
    const [columns]=await db.query<mysql.RowDataPacket[]>(
      `SELECT column_name AS name, data_type AS dataType, is_nullable AS nullable
       FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='user_profiles' ORDER BY ordinal_position`)
    const result=inspectProfileSchema(columns as ProfileColumn[])
    console.log(JSON.stringify({
      mode:'READ_ONLY',instanceId:createHash('sha256').update(target.hostname+':'+(target.port||'3306')).digest('hex').slice(0,12),
      databaseName:names[0]?.databaseName, table:'user_profiles',columns,...result,approval:'WAITING',
    },null,2))
    if(!result.ready)process.exitCode=2
  } finally {await db.end()}
}
check().catch(()=>{console.error('Profile schema check failed; inspect locally without exposing credentials.');process.exitCode=1})
