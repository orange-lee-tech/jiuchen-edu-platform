import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { DatabaseContext } from '../db/client.js'
import {
  students,
  studentTeacherAssignments,
  teachers,
} from '../db/schema.js'
import {
  canAccessTeacherWorkspace,
  type UserRole,
} from '../domain/auth-policy.js'
import { resolveSessionUser } from '../services/session.js'

export function registerTeacherRoutes(
  app: FastifyInstance,
  database: DatabaseContext,
) {
  app.get('/me/teacher/students', async (request, reply) => {
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

    if (!canAccessTeacherWorkspace(sessionUser.role as UserRole)) {
      return reply.code(403).send({
        ok: false,
        error: 'teacher_workspace_forbidden',
      })
    }

    const [teacher] = await database.db
      .select({
        id: teachers.id,
        name: teachers.name,
        title: teachers.title,
        bio: teachers.bio,
      })
      .from(teachers)
      .where(eq(teachers.userId, sessionUser.userId))
      .limit(1)

    if (!teacher) {
      return reply.code(404).send({
        ok: false,
        error: 'teacher_profile_not_bound',
      })
    }

    const assignedStudents = await database.db
      .select({
        assignmentId: studentTeacherAssignments.id,
        relationship: studentTeacherAssignments.relationship,
        assignedStageCode: studentTeacherAssignments.stageCode,
        studentId: students.id,
        name: students.name,
        university: students.university,
        major: students.major,
        currentStage: students.currentStage,
      })
      .from(studentTeacherAssignments)
      .innerJoin(
        students,
        eq(studentTeacherAssignments.studentId, students.id),
      )
      .where(eq(studentTeacherAssignments.teacherId, teacher.id))

    return {
      ok: true,
      teacher,
      students: assignedStudents,
    }
  })
}
