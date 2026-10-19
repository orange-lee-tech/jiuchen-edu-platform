import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import type { FastifyRequest } from 'fastify'
import type { DatabaseContext } from '../db/client.js'
import { internalIds, userSessions, users } from '../db/schema.js'
import {applyReadOnlyContext,getReadOnlyCapability} from './read-only-context.js'

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function issueSession(
  database: DatabaseContext & { configured: true },
  userId: string,
) {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)

  await database.db.insert(userSessions).values({
    id: randomUUID(),
    userId,
    tokenHash: hashToken(token),
    expiresAt,
  })

  return {
    token,
    expiresAt: expiresAt.toISOString(),
  }
}

function readBearerToken(request: FastifyRequest): string | null {
  const value = request.headers.authorization
  if (!value || !value.startsWith('Bearer ')) return null
  const token = value.slice('Bearer '.length).trim()
  return token || null
}

export async function resolveSessionUser(
  request: FastifyRequest,
  database: DatabaseContext,
) {
  if (!database.configured) return null

  const token = readBearerToken(request)
  if (!token) return null
  const capability=token.startsWith('ro.')?getReadOnlyCapability(token):null
  if(token.startsWith('ro.')&&!capability)return null

  const [row] = await database.db
    .select({
      sessionId: userSessions.id,
      userId: users.id,
      role: users.role,
      displayName: users.displayName,
      status: users.status,
      internalIdStatus: internalIds.status,
      expiresAt: userSessions.expiresAt,
    })
    .from(userSessions)
    .innerJoin(users, eq(userSessions.userId, users.id))
    .leftJoin(internalIds, eq(internalIds.userId, users.id))
    .where(
      and(
        capability?eq(userSessions.id,capability.operatorSessionId):eq(userSessions.tokenHash, hashToken(token)),
        isNull(userSessions.revokedAt),
        eq(users.status, 'active'),
      ),
    )
    .limit(1)

  if (!row || row.expiresAt.getTime() <= Date.now() || row.internalIdStatus === 'disabled') {
    return null
  }

  if(capability&&row.userId!==capability.operatorUserId)return null
  return applyReadOnlyContext(request,database,row,capability?.target)
}

export async function revokeCurrentSession(
  request: FastifyRequest,
  database: DatabaseContext,
) {
  if (!database.configured) return false

  const token = readBearerToken(request)
  if (!token) return false

  await database.db
    .update(userSessions)
    .set({ revokedAt: new Date() })
    .where(eq(userSessions.tokenHash, hashToken(token)))

  return true
}
