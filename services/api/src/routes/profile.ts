import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { DatabaseContext } from '../db/client.js'
import { students, userProfiles, users } from '../db/schema.js'
import { canEditAcademicProfile, type UserRole } from '../domain/auth-policy.js'
import { resolveSessionUser } from '../services/session.js'

const profilePatchSchema = z
  .object({
    university: z.string().trim().max(160).nullable().optional(),
    major: z.string().trim().max(160).nullable().optional(),
    currentGrade: z.string().trim().max(40).nullable().optional(),
    enrollmentYear: z.number().int().min(1990).max(2100).nullable().optional(),
    gpaText: z.string().trim().max(80).nullable().optional(),
    rankText: z.string().trim().max(80).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required')

const EMPTY_PROFILE = {
  university: null,
  major: null,
  currentGrade: null,
  enrollmentYear: null,
  gpaText: null,
  rankText: null,
}

export function registerProfileRoutes(
  app: FastifyInstance,
  database: DatabaseContext,
) {
  app.put<{Body:unknown}>('/me/display-name', async(request,reply)=>{
    if(!database.configured)return reply.code(503).send({ok:false,error:'database_not_configured'})
    const sessionUser=await resolveSessionUser(request,database)
    if(!sessionUser)return reply.code(401).send({ok:false,error:'unauthorized'})
    const parsed=z.object({displayName:z.string().trim().min(1).max(80)}).strict().safeParse(request.body)
    if(!parsed.success)return reply.code(400).send({ok:false,error:'invalid_display_name'})
    await database.db.transaction(async tx=>{
      await tx.update(users).set({displayName:parsed.data.displayName}).where(eq(users.id,sessionUser.userId))
      if(sessionUser.role==='student'){
        // A claimed student's classroom still reads students.name.
        await tx.update(students).set({name:parsed.data.displayName}).where(eq(students.userId,sessionUser.userId))
      }
    })
    return {ok:true,displayName:parsed.data.displayName}
  })
  app.get('/me/profile', async (request, reply) => {
    if (!database.configured) {
      return reply.code(503).send({
        ok: false,
        error: 'database_not_configured',
      })
    }

    const sessionUser = await resolveSessionUser(request, database)
    if (!sessionUser) {
      return reply.code(401).send({
        ok: false,
        error: 'unauthorized',
      })
    }

    if (!canEditAcademicProfile(sessionUser.role as UserRole)) {
      return reply.code(403).send({
        ok: false,
        error: 'profile_not_available_for_role',
      })
    }

    const [profile] = await database.db
      .select({
        university: userProfiles.university,
        major: userProfiles.major,
        currentGrade: userProfiles.currentGrade,
        enrollmentYear: userProfiles.enrollmentYear,
        gpaText: userProfiles.gpaText,
        rankText: userProfiles.rankText,
      })
      .from(userProfiles)
      .where(eq(userProfiles.userId, sessionUser.userId))
      .limit(1)

    return {
      ok: true,
      profile: profile ?? EMPTY_PROFILE,
    }
  })

  app.put<{ Body: unknown }>('/me/profile', async (request, reply) => {
    if (!database.configured) {
      return reply.code(503).send({
        ok: false,
        error: 'database_not_configured',
      })
    }

    const sessionUser = await resolveSessionUser(request, database)
    if (!sessionUser) {
      return reply.code(401).send({
        ok: false,
        error: 'unauthorized',
      })
    }

    if (!canEditAcademicProfile(sessionUser.role as UserRole)) {
      return reply.code(403).send({
        ok: false,
        error: 'profile_not_available_for_role',
      })
    }

    const parsed = profilePatchSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: 'invalid_profile_payload',
        issues: parsed.error.issues,
      })
    }

    const [existing] = await database.db
      .select({ id: userProfiles.id })
      .from(userProfiles)
      .where(eq(userProfiles.userId, sessionUser.userId))
      .limit(1)

    if (existing) {
      await database.db
        .update(userProfiles)
        .set(parsed.data)
        .where(eq(userProfiles.id, existing.id))
    } else {
      await database.db.insert(userProfiles).values({
        id: randomUUID(),
        userId: sessionUser.userId,
        ...parsed.data,
      })
    }

    const [profile] = await database.db
      .select({
        university: userProfiles.university,
        major: userProfiles.major,
        currentGrade: userProfiles.currentGrade,
        enrollmentYear: userProfiles.enrollmentYear,
        gpaText: userProfiles.gpaText,
        rankText: userProfiles.rankText,
      })
      .from(userProfiles)
      .where(eq(userProfiles.userId, sessionUser.userId))
      .limit(1)

    return {
      ok: true,
      profile: profile ?? EMPTY_PROFILE,
    }
  })
}
