import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import Fastify from 'fastify'
import mysql from 'mysql2/promise'
import { drizzle } from 'drizzle-orm/mysql2'
import * as schema from './schema.js'
import type { DatabaseContext } from './client.js'
import { registerTeacherPlanningRoutes } from '../routes/teacher-planning.js'
import { registerReadOnlyWriteGuard } from '../services/read-only-context.js'

const raw = process.env.DATABASE_URL
if (!raw) throw new Error('isolated_database_configuration_missing')
const url = new URL(raw)
if (url.hostname !== '127.0.0.1' || url.pathname !== '/closeout_build_test') throw new Error('isolated_database_only')
const pool = mysql.createPool(raw)
const database = { configured: true, pool, db: drizzle(pool, { schema, mode: 'default' }) } as Extract<DatabaseContext, { configured: true }>
const app = Fastify()
registerReadOnlyWriteGuard(app)
registerTeacherPlanningRoutes(app, database)
const teacherUser = randomUUID(), otherUser = randomUUID(), teacher = randomUUID(), otherTeacher = randomUUID()
const first = randomUUID(), failing = randomUUID(), unrelated = randomUUID()
const token = randomUUID(), otherToken = randomUUID()
const headers = { authorization: 'Bearer ' + token }, otherHeaders = { authorization: 'Bearer ' + otherToken }
let triggerCreated = false
try {
  const [types] = await pool.query<mysql.RowDataPacket[]>("SELECT TABLE_NAME AS tableName,COLUMN_TYPE AS columnType FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('student_plans','plan_revisions') AND COLUMN_NAME='type'")
  assert.equal(types.length, 2)
  for (const row of types) for (const type of ['gpa','english','competition','research','internship','custom']) assert.ok(String(row.columnType).includes("'" + type + "'"))
  for (const [id, sessionToken] of [[teacherUser,token],[otherUser,otherToken]]) {
    await pool.execute("INSERT INTO users (id,role,status,display_name) VALUES (?,'teacher','active','Synthetic teacher')", [id])
    await pool.execute('INSERT INTO user_sessions (id,user_id,token_hash,expires_at) VALUES (?,?,?,?)', [randomUUID(),id,createHash('sha256').update(sessionToken!).digest('hex'),'2099-01-01 00:00:00'])
  }
  await pool.execute("INSERT INTO teachers (id,user_id,name,status) VALUES (?,?,'Synthetic teacher A','active'),(?,?,'Synthetic teacher B','active')", [teacher,teacherUser,otherTeacher,otherUser])
  for (const id of [first,failing,unrelated]) await pool.execute("INSERT INTO students (id,name,current_stage) VALUES (?,'Synthetic learner','senior-fall')", [id])
  for (const id of [first,failing]) await pool.execute("INSERT INTO student_teacher_assignments (id,student_id,teacher_id,relationship) VALUES (?,?,?,'primary')", [randomUUID(),id,teacher])
  const plan = { stageCode:'senior-fall',type:'custom',title:'Synthetic custom plan',items:[{name:'SYNTHETIC_FAIL',target:'Synthetic target',dueDate:'2026-11-01',status:'pending'}] }
  const created = await app.inject({method:'POST',url:'/me/teacher/plan-templates',headers,payload:{name:'Synthetic template',plan}})
  assert.equal(created.statusCode,201)
  const templateId = created.json().id
  assert.equal((await app.inject({url:'/me/teacher/plan-templates',headers:otherHeaders})).json().templates.some((item:{id:string})=>item.id===templateId),false)
  assert.equal((await app.inject({method:'POST',url:'/me/teacher/plan-templates/'+templateId+'/copy',headers:otherHeaders,payload:{}})).statusCode,404)
  const copied = await app.inject({method:'POST',url:'/me/teacher/plan-templates/'+templateId+'/copy',headers,payload:{name:'Synthetic copy'}})
  assert.equal(copied.statusCode,201);assert.notEqual(copied.json().id,templateId)
  await pool.query(`CREATE TRIGGER closeout_teacher_planning_test_fail BEFORE INSERT ON plan_items FOR EACH ROW
    BEGIN IF NEW.name='SYNTHETIC_FAIL' AND EXISTS (SELECT 1 FROM student_plans p WHERE p.id=NEW.plan_id AND p.student_id='${failing}')
    THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic_task_failure'; END IF; END`)
  triggerCreated = true
  const applied = await app.inject({method:'POST',url:'/me/teacher/plan-templates/'+templateId+'/apply',headers,payload:{studentIds:[first,failing,unrelated]}})
  assert.equal(applied.statusCode,200)
  assert.deepEqual(applied.json().results.map((result:{ok:boolean;error?:string})=>[result.ok,result.error]),[[true,undefined],[false,'plan_save_failed'],[false,'student_not_assigned']])
  const [saved] = await pool.query<mysql.RowDataPacket[]>('SELECT p.id AS planId,i.id AS itemId,i.name FROM student_plans p INNER JOIN plan_items i ON i.plan_id=p.id WHERE p.student_id=? AND p.type=\'custom\'', [first])
  assert.equal(saved.length,1)
  const [failedPlans] = await pool.query<mysql.RowDataPacket[]>('SELECT id FROM student_plans WHERE student_id=?', [failing])
  assert.equal(failedPlans.length,0,'failed learner transaction rolls back its plan and items')
  await app.inject({method:'PUT',url:'/me/teacher/plan-templates/'+templateId,headers,payload:{name:'Synthetic edited',plan:{...plan,items:[{name:'Changed template task',status:'done'}]}}})
  const [unchanged] = await pool.query<mysql.RowDataPacket[]>('SELECT name FROM plan_items WHERE id=?', [saved[0]!.itemId])
  assert.equal(unchanged[0]?.name,'SYNTHETIC_FAIL','template edits do not change generated learner tasks')
  await pool.query('DROP TRIGGER closeout_teacher_planning_test_fail');triggerCreated=false
  const retry = await app.inject({method:'POST',url:'/me/teacher/plans/apply',headers,payload:{studentIds:[first,failing],plan}})
  assert.ok(retry.json().results.every((result:{ok:boolean})=>result.ok))
  assert.notEqual(retry.json().results[0].planId,retry.json().results[1].planId)
  await pool.execute('DELETE FROM student_teacher_assignments WHERE teacher_id=? AND student_id=?', [teacher,first])
  assert.equal((await app.inject({method:'POST',url:'/me/teacher/plans/apply',headers,payload:{studentIds:[first],plan}})).json().results[0].error,'student_not_assigned')
  console.info('TEACHER_PLANNING_MYSQL_PASS templates=owner_isolated custom=preserved batch=independent rollback=verified productionWrites=false')
} finally {
  if (triggerCreated) await pool.query('DROP TRIGGER closeout_teacher_planning_test_fail')
  await app.close()
  await pool.end()
}
