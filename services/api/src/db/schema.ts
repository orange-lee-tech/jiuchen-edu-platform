import { sql } from 'drizzle-orm'
import {
  int,
  mysqlEnum,
  mysqlTable,
  timestamp,
  varchar,
} from 'drizzle-orm/mysql-core'

export const users = mysqlTable('users', {
  id: varchar('id', { length: 36 }).primaryKey(),
  wechatOpenId: varchar('wechat_open_id', { length: 64 }).unique(),
  role: mysqlEnum('role', ['user', 'student', 'teacher', 'staff', 'admin'])
    .notNull()
    .default('user'),
  displayName: varchar('display_name', { length: 80 }),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`).onUpdateNow(),
})

export const userProfiles = mysqlTable('user_profiles', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 })
    .notNull()
    .unique()
    .references(() => users.id),
  university: varchar('university', { length: 160 }),
  major: varchar('major', { length: 160 }),
  currentGrade: varchar('current_grade', { length: 40 }),
  gpaText: varchar('gpa_text', { length: 80 }),
  rankText: varchar('rank_text', { length: 80 }),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`).onUpdateNow(),
})

export const userSessions = mysqlTable('user_sessions', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 })
    .notNull()
    .references(() => users.id),
  tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  revokedAt: timestamp('revoked_at'),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
})

export const students = mysqlTable('students', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).unique().references(() => users.id),
  name: varchar('name', { length: 80 }).notNull(),
  university: varchar('university', { length: 160 }),
  major: varchar('major', { length: 160 }),
  currentStage: varchar('current_stage', { length: 32 }),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`).onUpdateNow(),
})

export const teachers = mysqlTable('teachers', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).unique().references(() => users.id),
  name: varchar('name', { length: 80 }).notNull(),
  title: varchar('title', { length: 120 }),
  bio: varchar('bio', { length: 500 }),
  status: mysqlEnum('status', ['active', 'inactive']).notNull().default('active'),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`).onUpdateNow(),
})

export const userAgreements = mysqlTable('user_agreements', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 })
    .notNull()
    .references(() => users.id),
  type: mysqlEnum('type', ['user_terms', 'privacy_policy']).notNull(),
  version: varchar('version', { length: 40 }).notNull(),
  acceptedAt: timestamp('accepted_at').notNull().default(sql`CURRENT_TIMESTAMP`),
})

export const studentTeacherAssignments = mysqlTable('student_teacher_assignments', {
  id: varchar('id', { length: 36 }).primaryKey(),
  studentId: varchar('student_id', { length: 36 })
    .notNull()
    .references(() => students.id),
  teacherId: varchar('teacher_id', { length: 36 })
    .notNull()
    .references(() => teachers.id),
  stageCode: varchar('stage_code', { length: 32 }),
  relationship: mysqlEnum('relationship', ['primary', 'support'])
    .notNull()
    .default('primary'),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`).onUpdateNow(),
})

export const studentPlans = mysqlTable('student_plans', {
  id: varchar('id', { length: 36 }).primaryKey(),
  studentId: varchar('student_id', { length: 36 })
    .notNull()
    .references(() => students.id),
  stageCode: varchar('stage_code', { length: 32 }).notNull(),
  type: mysqlEnum('type', ['gpa', 'english', 'competition', 'research', 'internship']).notNull(),
  title: varchar('title', { length: 160 }).notNull(),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`).onUpdateNow(),
})

export const planItems = mysqlTable('plan_items', {
  id: varchar('id', { length: 36 }).primaryKey(),
  planId: varchar('plan_id', { length: 36 })
    .notNull()
    .references(() => studentPlans.id),
  sortOrder: int('sort_order').notNull().default(0),
  name: varchar('name', { length: 160 }).notNull(),
  target: varchar('target', { length: 255 }),
  status: mysqlEnum('status', ['pending', 'in_progress', 'done']).notNull().default('pending'),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`).onUpdateNow(),
})
