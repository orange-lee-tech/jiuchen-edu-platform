import mysql from '../../services/api/node_modules/mysql2/promise.js'

const url = process.env.DATABASE_URL
if (process.env.NODE_ENV !== 'test' || !url) throw new Error('test database required')
const parsed = new URL(url)
if (parsed.hostname !== '127.0.0.1' || parsed.port !== '33306' ||
    parsed.pathname !== '/jiuchen_device_acceptance') {
  throw new Error('refusing non-acceptance database')
}
const db = await mysql.createConnection(url)
const fixtures = [
  { role: 'admin', id: '00000000-0000-4000-8000-000000000101',
    openid: 'device-acceptance-admin', name: '验收管理员',
    businessId: 'JCA-2A2A-2A2A', identityId: '00000000-0000-4000-8000-000000000301' },
  { role: 'teacher', id: '00000000-0000-4000-8000-000000000102',
    openid: 'device-acceptance-teacher', name: '验收老师',
    businessId: 'JCT-3B3B-3B3B', identityId: '00000000-0000-4000-8000-000000000302',
    entityId: '00000000-0000-4000-8000-000000000202' },
  { role: 'student', id: '00000000-0000-4000-8000-000000000103',
    openid: 'device-acceptance-student', name: '验收学员',
    businessId: 'JCS-4C4C-4C4C', identityId: '00000000-0000-4000-8000-000000000303',
    entityId: '00000000-0000-4000-8000-000000000203' },
]

try {
  await db.beginTransaction()
  for (const item of fixtures) {
    await db.query(
      `INSERT INTO users (id,wechat_open_id,role,status,display_name)
       VALUES (?,?,?,'active',?)
       ON DUPLICATE KEY UPDATE id=id`,
      [item.id, item.openid, item.role, item.name])
    if (item.role === 'teacher') {
      await db.query(
        `INSERT INTO teachers (id,user_id,name,status) VALUES (?,?,?,'active')
         ON DUPLICATE KEY UPDATE id=id`, [item.entityId, item.id, item.name])
    }
    if (item.role === 'student') {
      await db.query(
        `INSERT INTO students (id,user_id,name,university,major,current_stage)
         VALUES (?,?,?,'示例大学','示例专业','junior-fall')
         ON DUPLICATE KEY UPDATE id=id`, [item.entityId, item.id, item.name])
      await db.query(
        `INSERT INTO user_profiles (id,user_id,university,major,current_grade)
         VALUES ('00000000-0000-4000-8000-000000000403',?,'示例大学','示例专业','大三')
         ON DUPLICATE KEY UPDATE id=id`, [item.id])
    }
    await db.query(
      `INSERT INTO internal_ids
       (id,business_id,type,claim_mode,status,user_id,entity_id,claimed_at)
       VALUES (?,?,?,?,'claimed',?,?,CURRENT_TIMESTAMP())
       ON DUPLICATE KEY UPDATE id=id`,
      [item.identityId, item.businessId, item.role,
        item.role === 'admin' ? 'admin' : 'self', item.id, item.entityId ?? null])
  }
  await db.query(
    `INSERT INTO student_teacher_assignments (id,student_id,teacher_id,stage_code,relationship)
     VALUES ('00000000-0000-4000-8000-000000000501',
             '00000000-0000-4000-8000-000000000203',
             '00000000-0000-4000-8000-000000000202','junior-fall','primary')
     ON DUPLICATE KEY UPDATE id=id`)
  await db.commit()
  console.log('SYNTHETIC_ADMIN_TEACHER_STUDENT_READY')
} catch (error) {
  await db.rollback()
  throw error
} finally { await db.end() }
