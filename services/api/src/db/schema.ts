import { sql } from 'drizzle-orm'
import {
  boolean,
  int,
  index,
  json,
  mysqlEnum,
  mysqlTable,
  timestamp,
  text,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core'

export const users = mysqlTable('users', {
  id: varchar('id', { length: 36 }).primaryKey(),
  wechatOpenId: varchar('wechat_open_id', { length: 64 }).unique(),
  phoneNumber: varchar('phone_number', { length: 32 }).unique(),
  phoneCountryCode: varchar('phone_country_code', { length: 8 }),
  role: mysqlEnum('role', ['user', 'student', 'teacher', 'staff', 'admin'])
    .notNull()
    .default('user'),
  status: mysqlEnum('status', ['active', 'deleted']).notNull().default('active'),
  displayName: varchar('display_name', { length: 80 }),
  deletedAt: timestamp('deleted_at'),
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
  enrollmentYear: int('enrollment_year'),
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

export const internalIds = mysqlTable('internal_ids', {
  id: varchar('id', { length: 36 }).primaryKey(),
  businessId: varchar('business_id', { length: 40 }).notNull().unique(),
  type: mysqlEnum('type', ['student', 'teacher', 'admin']).notNull(),
  claimMode: mysqlEnum('claim_mode', ['self', 'admin']).notNull().default('self'),
  status: mysqlEnum('status', ['available', 'claimed', 'disabled'])
    .notNull()
    .default('available'),
  userId: varchar('user_id', { length: 36 }).references(() => users.id),
  entityId: varchar('entity_id', { length: 36 }),
  batch: varchar('batch', { length: 40 }),
  claimedAt: timestamp('claimed_at'),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`).onUpdateNow(),
}, (table) => [uniqueIndex('internal_ids_user_type_unique').on(table.userId, table.type)])

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

export const coachingRecords = mysqlTable('coaching_records', {
  id: varchar('id', { length: 36 }).primaryKey(),
  studentId: varchar('student_id', { length: 36 })
    .notNull()
    .references(() => students.id),
  teacherId: varchar('teacher_id', { length: 36 }).references(() => teachers.id),
  stageCode: varchar('stage_code', { length: 32 }).notNull(),
  title: varchar('title', { length: 160 }).notNull(),
  content: varchar('content', { length: 2000 }).notNull(),
  occurredAt: timestamp('occurred_at').notNull(),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`).onUpdateNow(),
})

export const newsPosts = mysqlTable('news_posts', {
  id: varchar('id', { length: 36 }).primaryKey(),
  source: mysqlEnum('source', ['manual', 'wechat_official']).notNull(),
  sourceKey: varchar('source_key', { length: 160 }).notNull().unique(),
  title: varchar('title', { length: 255 }).notNull(),
  summary: text('summary'),
  coverUrl: text('cover_url'),
  articleUrl: text('article_url'),
  contentJson: json('content_json'),
  tagsJson: json('tags_json'),
  publishedAt: timestamp('published_at'),
  status: mysqlEnum('status', ['active', 'hidden']).notNull().default('active'),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`).onUpdateNow(),
})

export const productKnowledgeDocuments = mysqlTable('product_knowledge_documents', {
  id: varchar('id', { length: 36 }).primaryKey(),
  documentKey: varchar('document_key', { length: 160 }).notNull().unique(),
  title: varchar('title', { length: 255 }).notNull(),
  productName: varchar('product_name', { length: 255 }).notNull(),
  sourceFile: varchar('source_file', { length: 255 }).notNull(),
  sourceDate: varchar('source_date', { length: 40 }),
  conversionVersion: varchar('conversion_version', { length: 64 }).notNull(),
  status: mysqlEnum('status', ['draft', 'active', 'archived']).notNull().default('draft'),
  contentJson: json('content_json').notNull(),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`).onUpdateNow(),
})

export const productKnowledgeChunks = mysqlTable('product_knowledge_chunks', {
  id: varchar('id', { length: 36 }).primaryKey(),
  documentId: varchar('document_id', { length: 36 })
    .notNull()
    .references(() => productKnowledgeDocuments.id),
  chunkKey: varchar('chunk_key', { length: 220 }).notNull().unique(),
  kind: mysqlEnum('kind', [
    'product',
    'audience',
    'highlight',
    'timeline',
    'module',
    'core_service',
    'teacher',
    'marketing_claim',
    'contact',
    'other',
  ]).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  text: varchar('text', { length: 4000 }).notNull(),
  sourcePage: int('source_page'),
  retrievalAllowed: boolean('retrieval_allowed').notNull().default(true),
  assessmentEvidenceAllowed: boolean('assessment_evidence_allowed').notNull().default(false),
  displayAllowed: boolean('display_allowed').notNull().default(true),
  metadataJson: json('metadata_json'),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`).onUpdateNow(),
})

export const assessments = mysqlTable('assessments', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 })
    .notNull()
    .references(() => users.id),
  status: mysqlEnum('status', ['draft', 'running', 'succeeded', 'failed'])
    .notNull()
    .default('draft'),
  inputSchemaVersion: varchar('input_schema_version', { length: 64 }).notNull(),
  outputSchemaVersion: varchar('output_schema_version', { length: 64 }).notNull(),
  agentVersion: varchar('agent_version', { length: 64 }).notNull(),
  provider: varchar('provider', { length: 80 }),
  model: varchar('model', { length: 160 }),
  knowledgeVersion: varchar('knowledge_version', { length: 120 }),
  inputJson: json('input_json').notNull(),
  evidenceJson: json('evidence_json'),
  outputJson: json('output_json'),
  failureCode: varchar('failure_code', { length: 120 }),
  creditConsumed: boolean('credit_consumed').notNull().default(false),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`).onUpdateNow(),
})

export const paymentOrders = mysqlTable('payment_orders', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 })
    .notNull()
    .references(() => users.id),
  outTradeNo: varchar('out_trade_no', { length: 64 }).notNull().unique(),
  provider: mysqlEnum('provider', ['wechat_pay']).notNull().default('wechat_pay'),
  status: mysqlEnum('status', ['pending', 'paid', 'closed', 'refunded'])
    .notNull()
    .default('pending'),
  amountFen: int('amount_fen').notNull(),
  creditAmount: int('credit_amount').notNull(),
  skuKey: varchar('sku_key', { length: 16 }),
  planId: varchar('plan_id', { length: 36 }),
  planVersion: int('plan_version'),
  payEnvironment: varchar('pay_environment', { length: 16 }),
  wechatProductId: varchar('wechat_product_id', { length: 128 }),
  providerTransactionId: varchar('provider_transaction_id', { length: 64 }).unique(),
  paidAt: timestamp('paid_at'),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`).onUpdateNow(),
})

export const creditLedgerEntries = mysqlTable('credit_ledger_entries', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 })
    .notNull()
    .references(() => users.id),
  type: mysqlEnum('type', [
    'free_grant',
    'payment_grant',
    'assessment_debit',
    'admin_adjustment',
    'correction',
  ]).notNull(),
  delta: int('delta').notNull(),
  assessmentId: varchar('assessment_id', { length: 36 }).references(() => assessments.id),
  paymentOrderId: varchar('payment_order_id', { length: 36 }).references(() => paymentOrders.id),
  idempotencyKey: varchar('idempotency_key', { length: 160 }).notNull().unique(),
  note: varchar('note', { length: 500 }),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
})

export const creditReservations = mysqlTable('credit_reservations', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 })
    .notNull()
    .references(() => users.id),
  assessmentId: varchar('assessment_id', { length: 36 })
    .notNull()
    .unique()
    .references(() => assessments.id),
  amount: int('amount').notNull().default(1),
  status: mysqlEnum('status', ['held', 'consumed', 'released'])
    .notNull()
    .default('held'),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`).onUpdateNow(),
})

export const paymentNotifications = mysqlTable('payment_notifications', {
  id: varchar('id', { length: 36 }).primaryKey(),
  provider: mysqlEnum('provider', ['wechat_pay']).notNull().default('wechat_pay'),
  notificationId: varchar('notification_id', { length: 96 }).notNull().unique(),
  outTradeNo: varchar('out_trade_no', { length: 64 }),
  providerTransactionId: varchar('provider_transaction_id', { length: 64 }),
  payloadHash: varchar('payload_hash', { length: 64 }).notNull(),
  status: mysqlEnum('status', ['received', 'processed', 'rejected'])
    .notNull()
    .default('received'),
  processedAt: timestamp('processed_at'),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
})

// Virtual-payment exceptions and refund outcomes are separate from the immutable
// purchase and credit ledgers. A case never grants or removes credits by itself.
export const virtualPaymentCases = mysqlTable('virtual_payment_cases', {
  id: varchar('id', { length: 36 }).primaryKey(),
  orderId: varchar('order_id', { length: 36 }).references(() => paymentOrders.id),
  eventKey: varchar('event_key', { length: 128 }).notNull().unique(),
  kind: mysqlEnum('kind', ['late_payment', 'refund', 'complaint', 'delivery', 'reconciliation']).notNull(),
  state: mysqlEnum('state', ['open', 'processing', 'succeeded', 'failed', 'resolved']).notNull().default('open'),
  reasonCode: varchar('reason_code', { length: 80 }).notNull(),
  refundAmountFen: int('refund_amount_fen'),
  providerReference: varchar('provider_reference', { length: 96 }),
  attemptCount: int('attempt_count').notNull().default(0),
  lastCheckedAt: timestamp('last_checked_at'),
  resolvedAt: timestamp('resolved_at'),
  resolvedBy: varchar('resolved_by', { length: 36 }).references(() => users.id),
  reviewNote: varchar('review_note', { length: 500 }),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`).onUpdateNow(),
}, (table) => [
  index('virtual_payment_cases_order_state_idx').on(table.orderId,table.state),
  index('virtual_payment_cases_kind_state_idx').on(table.kind,table.state),
])

export const virtualPaymentCaseActions = mysqlTable('virtual_payment_case_actions', {
  id: varchar('id', { length: 36 }).primaryKey(),
  caseId: varchar('case_id', { length: 36 }).notNull().references(() => virtualPaymentCases.id),
  actorUserId: varchar('actor_user_id', { length: 36 }).references(() => users.id),
  action: varchar('action', { length: 48 }).notNull(),
  note: varchar('note', { length: 500 }),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index('virtual_payment_case_actions_case_idx').on(table.caseId,table.createdAt)])

export const growthRecords = mysqlTable('growth_records', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 })
    .notNull()
    .references(() => users.id),
  type: mysqlEnum('type', [
    'course',
    'language',
    'research',
    'publication',
    'competition',
    'project',
    'internship',
    'campus',
    'award',
    'skill',
    'other',
  ]).notNull(),
  title: varchar('title', { length: 220 }).notNull(),
  organization: varchar('organization', { length: 220 }),
  role: varchar('role', { length: 160 }),
  startDate: varchar('start_date', { length: 32 }),
  endDate: varchar('end_date', { length: 32 }),
  description: varchar('description', { length: 2000 }),
  result: varchar('result', { length: 1200 }),
  standardExpression: varchar('standard_expression', { length: 2400 }),
  evidenceJson: json('evidence_json'),
  metadataJson: json('metadata_json'),
  sourceType: mysqlEnum('source_type', ['manual', 'assessment', 'classroom', 'admin'])
    .notNull()
    .default('manual'),
  sourceRecordId: varchar('source_record_id', { length: 80 }),
  sourceKey: varchar('source_key', { length: 220 }).notNull().unique(),
  userConfirmed: boolean('user_confirmed').notNull().default(false),
  userConfirmedAt: timestamp('user_confirmed_at'),
  teacherConfirmed: boolean('teacher_confirmed').notNull().default(false),
  teacherConfirmedAt: timestamp('teacher_confirmed_at'),
  adminConfirmed: boolean('admin_confirmed').notNull().default(false),
  adminConfirmedAt: timestamp('admin_confirmed_at'),
  status: mysqlEnum('status', ['active', 'archived']).notNull().default('active'),
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


export const planRevisions = mysqlTable('plan_revisions', {
  id: varchar('id', { length: 36 }).primaryKey(),
  studentId: varchar('student_id', { length: 36 })
    .notNull()
    .references(() => students.id),
  stageCode: varchar('stage_code', { length: 32 }).notNull(),
  type: mysqlEnum('type', ['gpa', 'english', 'competition', 'research', 'internship']).notNull(),
  title: varchar('title', { length: 160 }).notNull(),
  itemsJson: json('items_json').notNull(),
  editorUserId: varchar('editor_user_id', { length: 36 })
    .notNull()
    .references(() => users.id),
  editorRole: mysqlEnum('editor_role', ['student', 'teacher', 'staff', 'admin']).notNull(),
  status: mysqlEnum('status', ['pending', 'approved', 'rejected'])
    .notNull()
    .default('pending'),
  reviewNote: varchar('review_note', { length: 500 }),
  reviewedByUserId: varchar('reviewed_by_user_id', { length: 36 }).references(() => users.id),
  reviewedAt: timestamp('reviewed_at'),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`).onUpdateNow(),
})

export const scheduleImports = mysqlTable('schedule_imports', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 })
    .notNull()
    .references(() => users.id),
  studentId: varchar('student_id', { length: 36 }).references(() => students.id),
  sourceType: mysqlEnum('source_type', ['spreadsheet', 'image']).notNull(),
  fileId: varchar('file_id', { length: 1000 }).notNull(),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  status: mysqlEnum('status', ['uploaded', 'parsing', 'parsed', 'failed'])
    .notNull()
    .default('uploaded'),
  parsedJson: json('parsed_json'),
  errorCode: varchar('error_code', { length: 120 }),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`).onUpdateNow(),
})
