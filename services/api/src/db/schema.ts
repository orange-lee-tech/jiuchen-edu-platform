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
  role: mysqlEnum('role', ['user', 'student', 'staff', 'admin']).notNull().default('user'),
  displayName: varchar('display_name', { length: 80 }),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`).onUpdateNow(),
})

export const students = mysqlTable('students', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).references(() => users.id),
  name: varchar('name', { length: 80 }).notNull(),
  university: varchar('university', { length: 160 }),
  major: varchar('major', { length: 160 }),
  currentStage: varchar('current_stage', { length: 32 }),
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
