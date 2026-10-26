import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, isNull } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { AppEnv } from '../config/env.js'
import type { DatabaseContext } from '../db/client.js'
import {
  internalIds,
  newsPosts,
  studentTeacherAssignments,
  students,
  teachers,
  users,
} from '../db/schema.js'
import { canAccessAdminWorkspace } from '../domain/auth-policy.js'
import { getStageDefinition } from '../domain/classroom.js'
import {
  bindInternalIdentity,
  createInternalIdentity,
  unbindInternalIdentity,
} from '../services/internal-identities.js'
import {
  normalizeNewsTags,
  newsSourceTimeOrder,
  newsTimeView,
  syncOfficialAccountPosts,
} from '../services/news.js'
import { resolveSessionUser } from '../services/session.js'
import { readAdminIdentityDirectory,readAdminReadOnlyRoster } from '../services/admin-identity-directory.js'
import { readAssessmentCommerceAnalytics, type AnalyticsPeriod } from '../services/commercial-analytics.js'
import { readAdminAssessmentAiCosts, readAdminDeepseekBalance,
  readTeacherAssessmentAiCosts } from '../services/assessment-ai-cost-summary.js'
import { checkDeepseekPriceSource, reviewDeepseekPrice, reviewExchangeRate } from '../services/assessment-ai-cost.js'
import { ControlError } from '../services/admin-control-boxes.js'
import { reconcileNewsWindow, withNewsLock } from '../services/news-v2-store.js'

const createIdSchema = z.object({
  type: z.enum(['student', 'teacher', 'admin']),
  name: z.string().trim().max(80).nullable().optional(),
})

const bindSchema = z.object({
  userId: z.string().uuid(),
})

const assignmentSchema = z.object({
  studentId: z.string().uuid(),
  teacherId: z.string().uuid(),
  stageCode: z.string().trim().max(32).nullable().optional(),
  relationship: z.enum(['primary', 'support']).default('primary'),
})

const newsTagsSchema = z
  .object({
    tags: z
      .array(z.string().trim().min(1).max(24))
      .max(8)
      .transform((tags) => [...new Set(tags.map((tag) => tag.trim()))]),
  })
  .strict()
const priceReviewSchema=z.object({
  model:z.string().trim().min(1).max(120),expectedLatestVersion:z.string().uuid().nullable(),
  inputCacheHitPerMillion:z.number().min(0).max(10000),
  inputCacheMissPerMillion:z.number().min(0).max(10000),
  outputPerMillion:z.number().min(0).max(10000),
  peakInputCacheMissPerMillion:z.number().min(0).max(10000).nullable(),
  peakOutputPerMillion:z.number().min(0).max(10000).nullable(),
  peakWindowUtc:z.string().trim().max(120).nullable(),
  effectiveAt:z.iso.datetime(),reviewNote:z.string().trim().min(8).max(500),
}).strict()
const fxReviewSchema=z.object({rate:z.number().positive().max(20),sourceUrl:z.string().url().max(500),
  observedAt:z.iso.datetime(),reviewNote:z.string().trim().min(8).max(500)}).strict()

async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
  database: DatabaseContext & { configured: true },
) {
  const user = await resolveSessionUser(request, database)
  if (!user) {
    reply.code(401).send({
      ok: false,
      error: 'unauthorized',
    })
    return null
  }

  if (!canAccessAdminWorkspace(user.role)) {
    reply.code(403).send({
      ok: false,
      error: 'admin_forbidden',
    })
    return null
  }

  return user
}

export function registerMobileAdminRoutes(
  app: FastifyInstance,
  database: DatabaseContext,
  env: AppEnv,
) {
  if (!database.configured) {
    return
  }

  const configuredDatabase = database
  app.get<{ Querystring: { period?: string } }>('/me/admin/assessment-analytics', async (request, reply) => {
    if (!(await requireAdmin(request, reply, configuredDatabase))) return
    const period = request.query.period ?? 'week'
    if (!['week', 'month', 'year'].includes(period)) {
      return reply.code(400).send({ ok: false, error: 'invalid_analytics_period' })
    }
    try {
      const analytics = await readAssessmentCommerceAnalytics(configuredDatabase.pool, period as AnalyticsPeriod, new Date(), env)
      return { ok: true, analytics }
    } catch (error) {
      if (error && typeof error === 'object' &&
        'code' in error && String(error.code) === 'ER_NO_SUCH_TABLE') {
        return reply.code(503).send({ ok: false, error: 'commercial_analytics_schema_not_ready' })
      }
      throw error
    }
  })

  app.get('/me/admin/assessment-ai-costs', async (request, reply) => {
    if (!(await requireAdmin(request, reply, configuredDatabase))) return
    try { return {ok:true, costs:await readAdminAssessmentAiCosts(configuredDatabase.pool)} }
    catch (error) {
      if (['ER_NO_SUCH_TABLE','ER_BAD_FIELD_ERROR'].includes(String((error as {code?:string}).code)))
        return reply.code(503).send({ok:false,error:'assessment_ai_cost_schema_not_ready'})
      throw error
    }
  })
  app.get('/me/admin/assessment-ai-balance', async (request, reply) => {
    if (!(await requireAdmin(request, reply, configuredDatabase))) return
    return {ok:true,balance:await readAdminDeepseekBalance(configuredDatabase.pool,env)}
  })
  app.post('/me/admin/assessment-ai-prices/check-source',async(request,reply)=>{
    if(!(await requireAdmin(request,reply,configuredDatabase)))return
    try{return {ok:true,...await checkDeepseekPriceSource(configuredDatabase.pool)}}
    catch{return reply.code(503).send({ok:false,error:'price_source_unavailable'})}
  })
  app.post<{Body:unknown}>('/me/admin/assessment-ai-prices/review',async(request,reply)=>{
    const user=await requireAdmin(request,reply,configuredDatabase)
    if(!user)return
    const parsed=priceReviewSchema.safeParse(request.body)
    if(!parsed.success)return reply.code(400).send({ok:false,error:'invalid_price_review'})
    try{return {ok:true,...await reviewDeepseekPrice({pool:configuredDatabase.pool,
      actorId:user.userId,...parsed.data,effectiveAt:new Date(parsed.data.effectiveAt)})}}
    catch(error){
      if(error instanceof ControlError)return reply.code(error.status).send({ok:false,error:error.code})
      throw error
    }
  })
  app.post<{Body:unknown}>('/me/admin/assessment-ai-fx/review',async(request,reply)=>{
    const user=await requireAdmin(request,reply,configuredDatabase)
    if(!user)return
    const parsed=fxReviewSchema.safeParse(request.body)
    if(!parsed.success)return reply.code(400).send({ok:false,error:'invalid_fx_review'})
    try{return {ok:true,...await reviewExchangeRate({pool:configuredDatabase.pool,
      actorId:user.userId,...parsed.data,observedAt:new Date(parsed.data.observedAt)})}}
    catch(error){
      if(error instanceof ControlError)return reply.code(error.status).send({ok:false,error:error.code})
      throw error
    }
  })
  app.get<{Querystring:{assessmentId?:string}}>('/me/teacher/assessment-ai-costs', async (request, reply) => {
    const user = await resolveSessionUser(request, configuredDatabase)
    if (!user) return reply.code(401).send({ok:false,error:'unauthorized'})
    if (user.role !== 'teacher') return reply.code(403).send({ok:false,error:'teacher_forbidden'})
    const assessmentId = request.query.assessmentId ?? null
    if (assessmentId && !z.string().uuid().safeParse(assessmentId).success)
      return reply.code(400).send({ok:false,error:'invalid_assessment_id'})
    try { return {ok:true,costs:await readTeacherAssessmentAiCosts(configuredDatabase.pool,
      user.userId,assessmentId)} }
    catch (error) {
      if (['ER_NO_SUCH_TABLE','ER_BAD_FIELD_ERROR'].includes(String((error as {code?:string}).code)))
        return reply.code(503).send({ok:false,error:'assessment_ai_cost_schema_not_ready'})
      throw error
    }
  })

  app.get('/me/admin/internal-ids', async (request, reply) => {
    if (!(await requireAdmin(request, reply, configuredDatabase))) return

    const rows=await readAdminIdentityDirectory(configuredDatabase.pool)

    return {
      ok: true,
      internalIds: rows,
    }
  })

  app.post<{ Body: unknown }>('/me/admin/internal-ids', async (request, reply) => {
    if (!(await requireAdmin(request, reply, configuredDatabase))) return

    const parsed = createIdSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: 'invalid_internal_id_payload',
      })
    }

    const identity = await createInternalIdentity(configuredDatabase, {
      type: parsed.data.type,
      name: parsed.data.name ?? null,
    })

    return {
      ok: true,
      identity,
    }
  })

  app.post<{
    Params: { id: string }
    Body: unknown
  }>('/me/admin/internal-ids/:id/bind', async (request, reply) => {
    if (!(await requireAdmin(request, reply, configuredDatabase))) return

    const parsed = bindSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: 'invalid_bind_payload',
      })
    }

    try {
      const identity = await bindInternalIdentity(
        configuredDatabase,
        request.params.id,
        parsed.data.userId,
      )

      return {
        ok: true,
        identity,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'bind_failed'
      return reply.code(409).send({
        ok: false,
        error: message,
      })
    }
  })

  app.post<{ Params: { id: string } }>(
    '/me/admin/internal-ids/:id/unbind',
    async (request, reply) => {
      const operator = await requireAdmin(request, reply, configuredDatabase)
      if (!operator) return
      const [identity] = await configuredDatabase.db
        .select({ userId: internalIds.userId })
        .from(internalIds).where(eq(internalIds.id, request.params.id)).limit(1)
      if (identity?.userId === operator.userId) {
        return reply.code(409).send({ ok: false, error: 'cannot_modify_own_admin_id' })
      }

      try {
        await unbindInternalIdentity(configuredDatabase, request.params.id)
        return { ok: true }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unbind_failed'
        return reply.code(409).send({
          ok: false,
          error: message,
        })
      }
    },
  )

  // No new schema: disabled with userId = paused; disabled without userId =
  // revoked or unissued ID. Both reject use/claim until restored by an admin.
  app.post<{ Params: { id: string } }>(
    '/me/admin/internal-ids/:id/pause',
    async (request, reply) => {
      const operator = await requireAdmin(request, reply, configuredDatabase)
      if (!operator) return
      const [identity] = await configuredDatabase.db
        .select({ status: internalIds.status, userId: internalIds.userId })
        .from(internalIds).where(eq(internalIds.id, request.params.id)).limit(1)
      if (!identity) return reply.code(404).send({ ok: false, error: 'internal_id_not_found' })
      if (identity.userId === operator.userId)
        return reply.code(409).send({ ok: false, error: 'cannot_modify_own_admin_id' })
      if (identity.status !== 'claimed' && identity.status !== 'available')
        return reply.code(409).send({ ok: false, error: 'internal_id_not_active' })
      const [updated] = await configuredDatabase.db.update(internalIds)
        .set({ status: 'disabled' })
        .where(and(eq(internalIds.id, request.params.id), eq(internalIds.status, identity.status)))
      if (updated.affectedRows !== 1)
        return reply.code(409).send({ ok: false, error: 'internal_id_state_changed' })
      return { ok: true }
    },
  )

  // If bound: restore the existing identity + account. If unbound: make this
  // one-time ID available for claiming again, without granting a user role.
  app.post<{ Params: { id: string } }>(
    '/me/admin/internal-ids/:id/restore',
    async (request, reply) => {
      const operator = await requireAdmin(request, reply, configuredDatabase)
      if (!operator) return
      const [identity] = await configuredDatabase.db
        .select({ status: internalIds.status, userId: internalIds.userId })
        .from(internalIds).where(eq(internalIds.id, request.params.id)).limit(1)
      if (!identity) return reply.code(404).send({ ok: false, error: 'internal_id_not_found' })
      if (identity.userId === operator.userId)
        return reply.code(409).send({ ok: false, error: 'cannot_modify_own_admin_id' })
      if (identity.status !== 'disabled')
        return reply.code(409).send({ ok: false, error: 'internal_id_not_disabled' })
      const status = identity.userId ? 'claimed' : 'available'
      const [updated] = await configuredDatabase.db.update(internalIds)
        .set({ status })
        .where(and(eq(internalIds.id, request.params.id), eq(internalIds.status, 'disabled')))
      if (updated.affectedRows !== 1)
        return reply.code(409).send({ ok: false, error: 'internal_id_state_changed' })
      return { ok: true, status }
    },
  )

  app.delete<{ Params: { id: string } }>(
    '/me/admin/internal-ids/:id',
    async (request, reply) => {
      if (!(await requireAdmin(request, reply, configuredDatabase))) return

      const [identity] = await configuredDatabase.db
        .select({
          status: internalIds.status,
          userId: internalIds.userId,
          entityId: internalIds.entityId,
          type: internalIds.type,
        })
        .from(internalIds)
        .where(eq(internalIds.id, request.params.id))
        .limit(1)

      if (!identity) {
        return reply.code(404).send({
          ok: false,
          error: 'internal_id_not_found',
        })
      }

      if (identity.status === 'claimed' || identity.userId) {
        return reply.code(409).send({
          ok: false,
          error: 'claimed_internal_id_must_unbind_first',
        })
      }

      await configuredDatabase.db.transaction(async (tx) => {
        await tx.delete(internalIds).where(eq(internalIds.id, request.params.id))

        if (identity.type === 'student' && identity.entityId) {
          await tx.delete(students).where(eq(students.id, identity.entityId))
        } else if (identity.type === 'teacher' && identity.entityId) {
          await tx.delete(teachers).where(eq(teachers.id, identity.entityId))
        }
      })

      return { ok: true }
    },
  )

  app.get('/me/admin/users', async (request, reply) => {
    if (!(await requireAdmin(request, reply, configuredDatabase))) return

    const rows = await configuredDatabase.db
      .select({
        id: users.id,
        role: users.role,
        status: users.status,
        displayName: users.displayName,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(asc(users.createdAt))

    return {
      ok: true,
      users: rows,
    }
  })

  app.get('/me/admin/students', async (request, reply) => {
    if (!(await requireAdmin(request, reply, configuredDatabase))) return

    const rows = await configuredDatabase.db
      .select({
        id: students.id,
        name: students.name,
        university: students.university,
        major: students.major,
        currentStage: students.currentStage,
        createdAt: students.createdAt,
      })
      .from(students)
      .orderBy(asc(students.createdAt))

    return {
      ok: true,
      students: rows,
    }
  })

  app.get('/me/admin/read-only-directory',async(request,reply)=>{
    if(!(await requireAdmin(request,reply,configuredDatabase)))return
    return {ok:true,...await readAdminReadOnlyRoster(configuredDatabase.pool)}
  })

  app.get('/me/admin/teachers', async (request, reply) => {
    if (!(await requireAdmin(request, reply, configuredDatabase))) return

    const rows = await configuredDatabase.db
      .select({
        id: teachers.id,
        name: teachers.name,
        title: teachers.title,
        status: teachers.status,
        createdAt: teachers.createdAt,
      })
      .from(teachers)
      .orderBy(asc(teachers.createdAt))

    return {
      ok: true,
      teachers: rows,
    }
  })

  app.get('/me/admin/assignments', async (request, reply) => {
    if (!(await requireAdmin(request, reply, configuredDatabase))) return

    const rows = await configuredDatabase.db
      .select({
        id: studentTeacherAssignments.id,
        studentId: students.id,
        studentName: students.name,
        teacherId: teachers.id,
        teacherName: teachers.name,
        stageCode: studentTeacherAssignments.stageCode,
        relationship: studentTeacherAssignments.relationship,
      })
      .from(studentTeacherAssignments)
      .innerJoin(students, eq(studentTeacherAssignments.studentId, students.id))
      .innerJoin(teachers, eq(studentTeacherAssignments.teacherId, teachers.id))
      .orderBy(asc(studentTeacherAssignments.createdAt))

    return {
      ok: true,
      assignments: rows,
    }
  })

  app.post<{ Body: unknown }>('/me/admin/assignments', async (request, reply) => {
    if (!(await requireAdmin(request, reply, configuredDatabase))) return

    const parsed = assignmentSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: 'invalid_assignment_payload',
      })
    }

    const [student] = await configuredDatabase.db
      .select({ id: students.id })
      .from(students)
      .where(eq(students.id, parsed.data.studentId))
      .limit(1)

    const [teacher] = await configuredDatabase.db
      .select({ id: teachers.id })
      .from(teachers)
      .where(eq(teachers.id, parsed.data.teacherId))
      .limit(1)

    if (!student || !teacher) {
      return reply.code(404).send({
        ok: false,
        error: 'student_or_teacher_not_found',
      })
    }

    if (parsed.data.stageCode && !getStageDefinition(parsed.data.stageCode)) {
      return reply.code(400).send({
        ok: false,
        error: 'invalid_stage',
      })
    }

    const [duplicate] = await configuredDatabase.db
      .select({ id: studentTeacherAssignments.id })
      .from(studentTeacherAssignments)
      .where(
        and(
          eq(studentTeacherAssignments.studentId, parsed.data.studentId),
          eq(studentTeacherAssignments.teacherId, parsed.data.teacherId),
          parsed.data.stageCode
            ? eq(studentTeacherAssignments.stageCode, parsed.data.stageCode)
            : isNull(studentTeacherAssignments.stageCode),
          eq(studentTeacherAssignments.relationship, parsed.data.relationship),
        ),
      )
      .limit(1)

    if (duplicate) {
      return reply.code(409).send({
        ok: false,
        error: 'assignment_already_exists',
      })
    }

    const id = randomUUID()
    await configuredDatabase.db.insert(studentTeacherAssignments).values({
      id,
      studentId: parsed.data.studentId,
      teacherId: parsed.data.teacherId,
      stageCode: parsed.data.stageCode ?? null,
      relationship: parsed.data.relationship,
    })

    return {
      ok: true,
      assignment: {
        id,
        ...parsed.data,
      },
    }
  })

  app.delete<{ Params: { id: string } }>(
    '/me/admin/assignments/:id',
    async (request, reply) => {
      if (!(await requireAdmin(request, reply, configuredDatabase))) return

      await configuredDatabase.db
        .delete(studentTeacherAssignments)
        .where(eq(studentTeacherAssignments.id, request.params.id))

      return { ok: true }
    },
  )

  app.get('/me/admin/news', async (request, reply) => {
    if (!(await requireAdmin(request, reply, configuredDatabase))) return

    const rows = await configuredDatabase.db
      .select({
        id: newsPosts.id,
        title: newsPosts.title,
        summary: newsPosts.summary,
        coverUrl: newsPosts.coverUrl,
        articleUrl: newsPosts.articleUrl,
        tagsJson: newsPosts.tagsJson,
        contentJson: newsPosts.contentJson,
        publishedAt: newsPosts.publishedAt,
        source: newsPosts.source,
        status: newsPosts.status,
      })
      .from(newsPosts)
      .orderBy(desc(newsSourceTimeOrder()), desc(newsPosts.createdAt))
      .limit(50)

    const lifecycle=new Map<string,{phase:string;phaseChangedAt:string|null;bufferedAt:string|null;retireAt:string|null}>()
    let syncHistory:null|{lastCheckedAt:string|null;lastFailedAt:string|null;latestSourceUpdatedAt:string|null;fetched:number;created:number;updated:number;failed:number;lastError:string|null}=null
    if(env.NEWS_V2_ENABLED){
      const [states]=await configuredDatabase.pool.query<import('mysql2/promise').RowDataPacket[]>(`SELECT post_id AS postId,phase,
        UNIX_TIMESTAMP(updated_at) AS changedEpoch,UNIX_TIMESTAMP(buffered_at) AS bufferedEpoch,UNIX_TIMESTAMP(retire_at) AS retireEpoch FROM news_display_states`)
      const time=(epoch:unknown)=>epoch===null?null:new Date(Number(epoch)*1000).toISOString()
      states.forEach(state=>lifecycle.set(String(state.postId),{phase:state.phase,phaseChangedAt:time(state.changedEpoch),bufferedAt:time(state.bufferedEpoch),retireAt:time(state.retireEpoch)}))
      const [runs]=await configuredDatabase.pool.query<import('mysql2/promise').RowDataPacket[]>(`SELECT status,
        UNIX_TIMESTAMP(checked_at) AS checkedEpoch,UNIX_TIMESTAMP(latest_source_time) AS sourceEpoch,
        fetched,created_count AS created,updated_count AS updated,failed_count AS failed,error_code AS errorCode
        FROM news_sync_runs ORDER BY checked_at DESC LIMIT 100`)
      const successful=runs.find(row=>row.status==='checked')
      const failure=runs.find(row=>row.status==='failed'||row.status==='partial')
      syncHistory={lastCheckedAt:successful?new Date(Number(successful.checkedEpoch)*1000).toISOString():null,
        lastFailedAt:failure?new Date(Number(failure.checkedEpoch)*1000).toISOString():null,
        latestSourceUpdatedAt:successful?.sourceEpoch?new Date(Number(successful.sourceEpoch)*1000).toISOString():null,
        fetched:Number(successful?.fetched??0),created:Number(successful?.created??0),updated:Number(successful?.updated??0),
        failed:Number(failure?.failed??0),lastError:failure?.errorCode??null}
    }
    return {
      ok: true,
      newsV2Enabled: Boolean(env.NEWS_V2_ENABLED),
      syncHistory,
      posts: rows.map((row) => ({
        ...row,
        ...newsTimeView(row),
        lifecycle:lifecycle.get(row.id)||null,
        contentJson: undefined,
        tags: normalizeNewsTags(row.tagsJson),
        tagsJson: undefined,
      })),
    }
  })

  app.put<{
    Params: { id: string }
    Body: unknown
  }>('/me/admin/news/:id/tags', async (request, reply) => {
    if (!(await requireAdmin(request, reply, configuredDatabase))) return

    const parsed = newsTagsSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: 'invalid_news_tags',
      })
    }

    const [post] = await configuredDatabase.db
      .select({ id: newsPosts.id })
      .from(newsPosts)
      .where(eq(newsPosts.id, request.params.id))
      .limit(1)

    if (!post) {
      return reply.code(404).send({
        ok: false,
        error: 'news_post_not_found',
      })
    }

    if(env.NEWS_V2_ENABLED){
      await withNewsLock(configuredDatabase.pool,async connection=>{
        await reconcileNewsWindow(connection,new Date(),async()=>{
          await connection.query('UPDATE news_posts SET tags_json=? WHERE id=?',[JSON.stringify(parsed.data.tags),post.id])
        })
      })
    }else{
      await configuredDatabase.db.update(newsPosts).set({ tagsJson: parsed.data.tags }).where(eq(newsPosts.id, post.id))
    }

    return {
      ok: true,
      tags: parsed.data.tags,
    }
  })

  app.post('/me/admin/news/sync', async (request, reply) => {
    if (!(await requireAdmin(request, reply, configuredDatabase))) return

    if (!env.WECHAT_OA_APP_ID || !env.WECHAT_OA_APP_SECRET) {
      return reply.code(503).send({
        ok: false,
        error: 'official_account_not_configured',
      })
    }

    try {
      const result = await syncOfficialAccountPosts(configuredDatabase, env)
      return {
        ok: true,
        status:result.failed||result.truncated?'partial':'checked',
        synced: result.total,
        created: result.created,
        updated: result.updated,
        unchanged:result.unchanged,failed:result.failed,errors:result.errors,
        checkedAt:result.checkedAt,latestSourcePublishedAt:result.latestSourcePublishedAt,
        latestSourceUpdatedAt:result.latestSourceUpdatedAt,groupsFetched:result.groupsFetched,
        pagesFetched:result.pagesFetched,uniqueGroups:result.uniqueGroups,latestArticles:result.latestArticles,
        totalGroups:result.totalGroups,maxGroups:result.maxGroups,truncated:result.truncated,message:result.message,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'official_account_sync_failed'
      app.log.warn({ code: /^official_account_[a-z_0-9]+$/.test(message)?message:'official_account_sync_failed' }, 'Official account sync failed')
      return reply.code(502).send({
        ok: false,
        error: /^official_account_[a-z_0-9]+$/.test(message)?message:'official_account_sync_failed',
        checkedAt:new Date().toISOString(),failed:1,
      })
    }
  })
}
