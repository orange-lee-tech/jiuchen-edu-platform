import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'

export function isTeacherSchemaError(error: unknown) {
  const seen = new Set<unknown>()
  let current: unknown = error
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    const value = current as { code?: string; errno?: number; cause?: unknown }
    if (['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(value.code || '') || [1146, 1054].includes(value.errno || 0)) {
      return true
    }
    current = value.cause
  }
  return false
}

export function teacherRouteError(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  if (isTeacherSchemaError(error)) return reply.code(503).send({ ok: false, error: 'teacher_schema_not_ready' })
  if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
    return reply.code(error.statusCode).send({ ok: false, error: 'invalid_teacher_request' })
  }
  request.log.warn({ code: /^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'UNKNOWN' }, 'Teacher operation failed')
  return reply.code(500).send({ ok: false, error: 'teacher_operation_failed' })
}
