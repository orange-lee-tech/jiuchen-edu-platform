// Run from current/services/api with --env-file. No application/worker imports.
import {createRequire} from 'node:module'
import {resolve} from 'node:path'
const require=createRequire(resolve(process.cwd(),'package.json'))
const mysql=require('mysql2/promise')
let connection
try{
 const config=process.env.DATABASE_URL||{host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME}
 if(!process.env.DATABASE_URL&&!(process.env.DB_HOST&&process.env.DB_USER&&process.env.DB_NAME))throw Object.assign(new Error(),{code:'DATABASE_NOT_CONFIGURED'})
 connection=await mysql.createConnection(config)
 await connection.query('START TRANSACTION READ ONLY')
 const [seedCounts]=await connection.query(`SELECT type,IF(user_id IS NULL,'unbound','bound_requires_review') AS binding,status,COUNT(*) AS count
 FROM internal_ids WHERE batch='dev-seed-v1' GROUP BY type,binding,status`)
 const [demoCounts]=await connection.query(`SELECT IF(user_id IS NULL,'unbound','bound_requires_review') AS binding,COUNT(*) AS count
 FROM students WHERE id='00000000-0000-4000-8000-000000000001' GROUP BY binding`)
 const [schema]=await connection.query(`SELECT COUNT(*) AS enrollmentYearPresent FROM information_schema.columns
 WHERE table_schema=DATABASE() AND table_name='user_profiles' AND column_name='enrollment_year'`)
 console.log(JSON.stringify({mode:'READ_ONLY_AGGREGATE',seedCounts,demoCounts,profile:schema[0]},null,2))
 await connection.rollback()
}catch(error){console.error(JSON.stringify({ok:false,code:String(error?.code||'IDENTITY_AUDIT_FAILED')}));process.exitCode=1}
finally{await connection?.end()}
