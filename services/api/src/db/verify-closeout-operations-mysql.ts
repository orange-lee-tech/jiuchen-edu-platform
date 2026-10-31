// Synthetic isolated fixture only. This never reads a production configuration.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import mysql from 'mysql2/promise'
import { drizzle } from 'drizzle-orm/mysql2'
import Fastify from 'fastify'
import * as schema from './schema.js'
import type { DatabaseContext } from './client.js'
import { registerStaffProfileRoutes } from '../routes/staff-profiles.js'
import { registerAdminCreditAdjustmentRoutes } from '../routes/admin-credit-adjustments.js'
import { registerReadOnlyWriteGuard } from '../services/read-only-context.js'
import { pinDigest } from '../services/admin-control-boxes.js'

const url=process.env.DATABASE_URL
if(!url||new URL(url).hostname!=='127.0.0.1'||new URL(url).pathname!=='/closeout_build_test')throw new Error('isolated_fixture_required')
const pool=mysql.createPool(url),database={configured:true,pool,db:drizzle(pool,{schema,mode:'default'})} as DatabaseContext
const ids={admin:'e1000000-0000-4000-8000-000000000001',teacher:'e1000000-0000-4000-8000-000000000002',student:'e1000000-0000-4000-8000-000000000003'}
const app=Fastify();registerReadOnlyWriteGuard(app);registerStaffProfileRoutes(app,database);registerAdminCreditAdjustmentRoutes(app,database)
try{
  for(const [role,id]of Object.entries(ids)){
    await pool.query('INSERT INTO users (id,role,display_name) VALUES (?,?,?)',[id,role,'Synthetic nickname'])
    await pool.query('INSERT INTO user_sessions (id,user_id,token_hash,expires_at) VALUES (?,?,?,?)',
      [id,id,createHash('sha256').update('closeout-synthetic-'+role).digest('hex'),new Date(Date.now()+3600000)])
  }
  await pool.query("INSERT INTO teachers (id,user_id,name,status) VALUES (?,?,'Synthetic teacher','active')",[ids.teacher,ids.teacher])
  await pool.query("INSERT INTO students (id,user_id,name,current_stage) VALUES (?,?,'Synthetic student','junior-fall')",[ids.student,ids.student])
  const headers=(role:string)=>({authorization:'Bearer closeout-synthetic-'+role})
  const profile={realName:'Synthetic formal name',phone:'13800000000',department:'Synthetic department',supervisor:'Synthetic supervisor'}
  for(const role of ['teacher','admin']){
    const saved=await app.inject({method:'PUT',url:'/me/staff-profile',headers:headers(role),payload:profile})
    assert.equal(saved.statusCode,200,saved.body)
    assert.equal((await app.inject({url:'/me/staff-profile',headers:headers(role)})).json().profile.complete,true)
  }
  assert.equal((await app.inject({url:'/me/admin/staff-profiles',headers:headers('teacher')})).statusCode,403)
  assert.equal((await app.inject({url:'/me/staff-profile',headers:headers('student')})).statusCode,403)
  const [names]=await pool.query<mysql.RowDataPacket[]>('SELECT t.name,u.display_name FROM teachers t INNER JOIN users u ON t.user_id=u.id WHERE t.id=?',[ids.teacher])
  assert.equal(names[0].name,profile.realName);assert.equal(names[0].display_name,'Synthetic nickname')
  const salt='22'.repeat(16)
  await pool.query(`INSERT INTO admin_control_boxes (box,version,pin_salt,pin_hash,owner_user_id) VALUES ('settings',1,?,?,?)`,[salt,pinDigest('123456',salt),ids.admin])
  const grant={userId:ids.student,amount:4,reason:'Synthetic compensation',pin:'123456',idempotencyKey:'e2000000-0000-4000-8000-000000000001'}
  const responses=await Promise.all(Array.from({length:6},()=>app.inject({method:'POST',url:'/me/admin/credit-adjustments',headers:headers('admin'),payload:grant})))
  for(const response of responses){assert.equal(response.statusCode,200,response.body);assert.equal(response.json().after,4)}
  const [ledger]=await pool.query<mysql.RowDataPacket[]>('SELECT COUNT(*) AS n,SUM(delta) AS balance FROM credit_ledger_entries WHERE user_id=?',[ids.student])
  assert.equal(Number(ledger[0].n),1);assert.equal(Number(ledger[0].balance),4)
  const [audit]=await pool.query<mysql.RowDataPacket[]>('SELECT * FROM admin_credit_adjustments WHERE target_user_id=?',[ids.student])
  assert.equal(audit.length,1);assert.equal(audit[0].actor_user_id,ids.admin);assert.equal(audit[0].balance_before,0);assert.equal(audit[0].balance_after,4)
  assert.equal((await app.inject({method:'POST',url:'/me/admin/credit-adjustments',headers:headers('admin'),payload:{...grant,amount:5}})).statusCode,409)
  for(const role of ['teacher','student'])assert.equal((await app.inject({method:'POST',url:'/me/admin/credit-adjustments',headers:headers(role),payload:grant})).statusCode,403)
  for(let i=0;i<5;i++)assert.equal((await app.inject({method:'POST',url:'/me/admin/credit-adjustments',headers:headers('admin'),payload:{...grant,pin:'000000'}})).statusCode,403)
  assert.equal((await app.inject({method:'POST',url:'/me/admin/credit-adjustments',headers:headers('admin'),payload:grant})).statusCode,429)
  const [after]=await pool.query<mysql.RowDataPacket[]>('SELECT SUM(delta) AS balance FROM credit_ledger_entries WHERE user_id=?',[ids.student])
  assert.equal(Number(after[0].balance),4)
  console.info('CLOSEOUT_OPERATIONS_MYSQL_PASS staff_privacy=true nickname_preserved=true concurrent_grants_once=true pin_lock=true audit=true')
}finally{await app.close();await pool.end()}
