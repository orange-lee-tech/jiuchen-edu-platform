// Synthetic isolated fixture only. Uses module-specific IDs; never drops tables.
import assert from 'node:assert/strict'
import mysql from 'mysql2/promise'
import { upgradeTeacherNewsTags } from './upgrade-teacher-news-tags.js'
import { readTeacherNewsTagScopes, withNewsTagScopes } from '../services/teacher-news-tags.js'

const url = new URL(process.env.DATABASE_URL || '')
assert.equal(url.hostname, '127.0.0.1', 'isolated_loopback_required')
assert.equal(url.pathname, '/closeout_build_test', 'isolated_database_required')
const pool = mysql.createPool(url.toString())
const id = (n: number) => `f0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const postId = id(100), t1 = id(11), t2 = id(12), t3 = id(13), s1 = id(21), s2 = id(22)
try {
  const [version] = await pool.query<mysql.RowDataPacket[]>('SELECT VERSION() AS version')
  assert.match(String(version[0]?.version), /^8\./)
  // These CREATEs permit running this verifier alone; the integrated fixture
  // may already have the fuller repository schema with the same columns.
  for (const ddl of [
    `CREATE TABLE IF NOT EXISTS users (id varchar(36) PRIMARY KEY,wechat_open_id varchar(64) UNIQUE,
     phone_number varchar(32) UNIQUE,phone_country_code varchar(8),role enum('user','student','teacher','staff','admin') NOT NULL DEFAULT 'user',
     status enum('active','deleted') NOT NULL DEFAULT 'active',display_name varchar(80),deleted_at timestamp NULL,
     created_at timestamp DEFAULT CURRENT_TIMESTAMP,updated_at timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS teachers (id varchar(36) PRIMARY KEY,user_id varchar(36) UNIQUE,name varchar(80) NOT NULL,
     title varchar(120),bio varchar(500),status enum('active','inactive') NOT NULL DEFAULT 'active',
     created_at timestamp DEFAULT CURRENT_TIMESTAMP,updated_at timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS students (id varchar(36) PRIMARY KEY,user_id varchar(36) UNIQUE,name varchar(80) NOT NULL,
     university varchar(160),major varchar(160),current_stage varchar(32),current_stage_mode enum('auto','manual'),
     created_at timestamp DEFAULT CURRENT_TIMESTAMP,updated_at timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS student_teacher_assignments (id varchar(36) PRIMARY KEY,student_id varchar(36) NOT NULL,
     teacher_id varchar(36) NOT NULL,stage_code varchar(32),relationship enum('primary','support') NOT NULL DEFAULT 'primary',
     created_at timestamp DEFAULT CURRENT_TIMESTAMP,updated_at timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS news_posts (id varchar(36) PRIMARY KEY,source enum('manual','wechat_official') NOT NULL,
     source_key varchar(160) NOT NULL UNIQUE,title varchar(255) NOT NULL,summary text,cover_url text,article_url text,
     content_json json,tags_json json,published_at timestamp NULL,status enum('active','hidden') NOT NULL DEFAULT 'active',
     created_at timestamp DEFAULT CURRENT_TIMESTAMP,updated_at timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB`,
  ]) await pool.query(ddl)
  for (const n of [1, 2, 3, 4, 5]) await pool.query(
    "INSERT INTO users(id,role,status,display_name) VALUES(?,?,'active','合成标签验收账号') ON DUPLICATE KEY UPDATE status='active'",
    [id(n), n <= 3 ? 'teacher' : 'student'])
  for (const [teacherId, userId] of [[t1, id(1)], [t2, id(2)], [t3, id(3)]])
    await pool.query("INSERT INTO teachers(id,user_id,name,status) VALUES(?,?,'合成教师','active') ON DUPLICATE KEY UPDATE status='active'", [teacherId, userId])
  for (const [studentId, userId] of [[s1, id(4)], [s2, id(5)]])
    await pool.query("INSERT INTO students(id,user_id,name) VALUES(?,?,'合成学员') ON DUPLICATE KEY UPDATE name=name", [studentId, userId])
  for (const [assignmentId, studentId, teacherId, relationship] of [[id(31), s1, t1, 'primary'], [id(32), s1, t2, 'support'], [id(33), s2, t3, 'primary']])
    await pool.query('INSERT INTO student_teacher_assignments(id,student_id,teacher_id,relationship) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE teacher_id=VALUES(teacher_id)', [assignmentId, studentId, teacherId, relationship])
  await pool.query(`INSERT INTO news_posts(id,source,source_key,title,tags_json) VALUES(?,'manual','synthetic-teacher-news-tags','合成资讯',?)
    ON DUPLICATE KEY UPDATE tags_json=VALUES(tags_json)`, [postId, JSON.stringify(['平台'])])
  const connection = await pool.getConnection()
  try { await upgradeTeacherNewsTags(connection) } finally { connection.release() }
  for (const [teacherId, tags] of [[t1, ['主导师']], [t2, ['协助导师']], [t3, ['他人导师']]] as const)
    await pool.query('INSERT INTO teacher_news_tags(post_id,teacher_id,tags_json) VALUES(?,?,?) ON DUPLICATE KEY UPDATE tags_json=VALUES(tags_json)', [postId, teacherId, JSON.stringify(tags)])
  const [before] = await pool.query('SELECT * FROM teacher_news_tags WHERE post_id=? ORDER BY teacher_id', [postId])
  const repeat = await pool.getConnection()
  try { await upgradeTeacherNewsTags(repeat); await upgradeTeacherNewsTags(repeat) } finally { repeat.release() }
  const [after] = await pool.query('SELECT * FROM teacher_news_tags WHERE post_id=? ORDER BY teacher_id', [postId])
  assert.deepEqual(after, before, 'repeated_migration_preserves_teacher_labels')
  const posts = [{ id: postId, tags: ['平台'] }]
  let [a] = await withNewsTagScopes(pool, { userId: id(4), role: 'student' }, posts)
  const [b] = await withNewsTagScopes(pool, { userId: id(5), role: 'student' }, posts)
  assert.deepEqual(a.tags, ['平台', '主导师', '协助导师'])
  assert.deepEqual(b.tags, ['平台', '他人导师'])
  const teacherPreview = await readTeacherNewsTagScopes(pool, { userId: id(1), role: 'teacher' }, [postId])
  assert.deepEqual(teacherPreview.get(postId)?.map(scope => scope.teacherId), [t1])
  await pool.query('DELETE FROM student_teacher_assignments WHERE id=?', [id(31)])
  ;[a] = await withNewsTagScopes(pool, { userId: id(4), role: 'student' }, posts)
  assert.deepEqual(a.tags, ['平台', '协助导师'], 'removed_assignment_revokes_scope')
  await pool.query("UPDATE teachers SET status='inactive' WHERE id=?", [t2])
  ;[a] = await withNewsTagScopes(pool, { userId: id(4), role: 'student' }, posts)
  assert.deepEqual(a.tags, ['平台'], 'inactive_teacher_scope_is_hidden')
  const [global] = await pool.query<mysql.RowDataPacket[]>('SELECT tags_json AS tags FROM news_posts WHERE id=?', [postId])
  assert.deepEqual(global[0]?.tags, ['平台'], 'global_labels_unchanged')
  const [indexes] = await pool.query<mysql.RowDataPacket[]>("SHOW INDEX FROM teacher_news_tags WHERE Key_name='PRIMARY'")
  assert.deepEqual(indexes.map(index => index.Column_name), ['post_id', 'teacher_id'])
  console.info('TEACHER_NEWS_TAGS_MYSQL_PASS repeated_migration=true scope_revocation=true global_preserved=true')
} finally { await pool.end() }
