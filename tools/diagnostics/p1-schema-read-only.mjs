// Schema only; no student rows, mutations, app/worker imports, environment output.
import {createRequire} from 'node:module'
import {resolve} from 'node:path'
const mysql=createRequire(resolve(process.cwd(),'package.json'))('mysql2/promise')
const tables=['users','user_sessions','user_agreements','user_profiles','internal_ids','students','teachers','student_teacher_assignments','news_posts','assessments','student_plans','plan_items','plan_revisions','schedule_imports','coaching_records','growth_records','payment_orders','credit_ledger_entries','credit_reservations','news_display_states','news_favorites','news_retirement_batches','news_retirement_tasks','news_retirement_reads','news_task_audit','news_sync_runs']
let connection
try{
 const env=process.env
 if(!env.DATABASE_URL&&!(env.DB_HOST&&env.DB_USER&&env.DB_NAME))throw Object.assign(new Error(),{code:'DATABASE_NOT_CONFIGURED'})
 connection=await mysql.createConnection(env.DATABASE_URL?{uri:env.DATABASE_URL,connectTimeout:10000}:{host:env.DB_HOST,port:Number(env.DB_PORT||3306),user:env.DB_USER,password:env.DB_PASSWORD,database:env.DB_NAME,connectTimeout:10000})
 await connection.query('START TRANSACTION READ ONLY')
 const [runtime]=await connection.query('SELECT VERSION() AS mysqlVersion,@@session.time_zone AS sessionTimezone')
 const [columns]=await connection.query('SELECT TABLE_NAME AS tableName,COLUMN_NAME AS columnName,COLUMN_TYPE AS columnType,IS_NULLABLE AS nullable,COLLATION_NAME AS collation FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name IN (?) ORDER BY table_name,ordinal_position',[tables])
 const present=new Set(columns.map(row=>row.tableName)),ddl=[]
 for(const table of tables)if(present.has(table)){
  const [rows]=await connection.query('SHOW CREATE TABLE `'+table+'`')
  ddl.push({table,createStatement:rows[0]['Create Table']})
 }
 await connection.rollback()
 console.log(JSON.stringify({mode:'READ_ONLY_SCHEMA_NO_PERSONAL_ROWS',checkedAt:new Date().toISOString(),runtime:runtime[0],columns,ddl,missing:tables.filter(table=>!present.has(table)),productionBackupRestored:false},null,2))
}catch(error){console.error(JSON.stringify({ok:false,code:String(error?.code||'SCHEMA_READ_FAILED')}));process.exitCode=1}
finally{await connection?.end()}
