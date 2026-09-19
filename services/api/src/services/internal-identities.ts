import { randomBytes, randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { DatabaseContext } from '../db/client.js'
import { internalIds, students, teachers, users } from '../db/schema.js'

export type InternalIdType = 'student' | 'teacher' | 'admin'

const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

function randomToken(length = 8) {
  const bytes = randomBytes(length)
  let result = ''
  for (let index = 0; index < length; index += 1) {
    result += alphabet[bytes[index] % alphabet.length]
  }
  return result
}

function prefixForType(type: InternalIdType) {
  if (type === 'student') return 'JCS'
  if (type === 'teacher') return 'JCT'
  return 'JCA'
}

export async function generateBusinessId(
  database: DatabaseContext & { configured: true },
  type: InternalIdType,
) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const raw = randomToken()
    const businessId = `${prefixForType(type)}-${raw.slice(0, 4)}-${raw.slice(4)}`
    const [existing] = await database.db
      .select({ id: internalIds.id })
      .from(internalIds)
      .where(eq(internalIds.businessId, businessId))
      .limit(1)

    if (!existing) return businessId
  }

  throw new Error('business_id_generation_failed')
}

export async function createInternalIdentity(
  database: DatabaseContext & { configured: true },
  input: {
    type: InternalIdType
    name?: string | null
    batch?: string | null
  },
) {
  const businessId = await generateBusinessId(database, input.type)
  const internalId = randomUUID()
  let entityId: string | null = null

  await database.db.transaction(async (tx) => {
    if (input.type === 'student') {
      entityId = randomUUID()
      await tx.insert(students).values({
        id: entityId,
        name: input.name?.trim() || '待命名学员',
        currentStage: 'freshman-fall',
      })
    } else if (input.type === 'teacher') {
      entityId = randomUUID()
      await tx.insert(teachers).values({
        id: entityId,
        name: input.name?.trim() || '待命名老师',
        status: 'active',
      })
    }

    await tx.insert(internalIds).values({
      id: internalId,
      businessId,
      type: input.type,
      claimMode: input.type === 'admin' ? 'admin' : 'self',
      status: 'available',
      entityId,
      batch: input.batch ?? null,
    })
  })

  return {
    id: internalId,
    businessId,
    type: input.type,
    claimMode: input.type === 'admin' ? ('admin' as const) : ('self' as const),
    status: 'available' as const,
    userId: null,
    entityId,
  }
}

export async function bindInternalIdentity(
  database: DatabaseContext & { configured: true },
  internalId: string,
  userId: string,
) {
  const [identity] = await database.db
    .select({
      id: internalIds.id,
      businessId: internalIds.businessId,
      type: internalIds.type,
      status: internalIds.status,
      entityId: internalIds.entityId,
    })
    .from(internalIds)
    .where(eq(internalIds.id, internalId))
    .limit(1)

  if (!identity || identity.status !== 'available') {
    throw new Error('internal_id_not_available')
  }

  const [user] = await database.db
    .select({
      id: users.id,
      role: users.role,
      status: users.status,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!user || user.status !== 'active') {
    throw new Error('user_not_found')
  }

  if (user.role !== 'user') {
    throw new Error('user_role_already_assigned')
  }

  const [existingBinding] = await database.db
    .select({ id: internalIds.id })
    .from(internalIds)
    .where(eq(internalIds.userId, userId))
    .limit(1)

  if (existingBinding) {
    throw new Error('user_already_has_internal_id')
  }

  if (identity.type !== 'admin' && !identity.entityId) {
    throw new Error('internal_id_entity_missing')
  }

  await database.db.transaction(async (tx) => {
    await tx
      .update(internalIds)
      .set({
        userId,
        status: 'claimed',
        claimedAt: new Date(),
      })
      .where(eq(internalIds.id, identity.id))

    await tx
      .update(users)
      .set({ role: identity.type })
      .where(eq(users.id, userId))

    if (identity.type === 'student') {
      await tx
        .update(students)
        .set({ userId })
        .where(eq(students.id, identity.entityId!))
    } else if (identity.type === 'teacher') {
      await tx
        .update(teachers)
        .set({ userId })
        .where(eq(teachers.id, identity.entityId!))
    }
  })

  return {
    ...identity,
    userId,
    status: 'claimed' as const,
  }
}

export async function unbindInternalIdentity(
  database: DatabaseContext & { configured: true },
  internalId: string,
) {
  const [identity] = await database.db
    .select({
      id: internalIds.id,
      type: internalIds.type,
      userId: internalIds.userId,
      entityId: internalIds.entityId,
    })
    .from(internalIds)
    .where(eq(internalIds.id, internalId))
    .limit(1)

  if (!identity) {
    throw new Error('internal_id_not_found')
  }

  await database.db.transaction(async (tx) => {
    if (identity.userId) {
      await tx
        .update(users)
        .set({ role: 'user' })
        .where(eq(users.id, identity.userId))
    }

    if (identity.type === 'student' && identity.entityId) {
      await tx
        .update(students)
        .set({ userId: null })
        .where(eq(students.id, identity.entityId))
    } else if (identity.type === 'teacher' && identity.entityId) {
      await tx
        .update(teachers)
        .set({ userId: null })
        .where(eq(teachers.id, identity.entityId))
    }

    await tx
      .update(internalIds)
      .set({
        userId: null,
        status: 'disabled',
      })
      .where(eq(internalIds.id, identity.id))
  })
}
