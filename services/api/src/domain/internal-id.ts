export function normalizeInternalBusinessId(value: string) {
  // Match client normalization (including full-width and various hyphens).
  // The identifier is a case-insensitive *exact* lookup key, not a role grant.
  const normalized = value.normalize('NFKC').trim().toUpperCase()
  const compact = normalized.replace(/[^A-Z0-9]/g, '')
  const match = compact.match(/^(JC[STA])([A-Z0-9]{4})([A-Z0-9]{4})$/)
  if (match) return `${match[1]}-${match[2]}-${match[3]}`
  return normalized
}

export type ClaimableIdentity = {
  type: 'student' | 'teacher' | 'admin'
  claimMode: 'self' | 'admin'
  status: 'available' | 'claimed' | 'disabled'
  userId: string | null
  entityId: string | null
}

/** Distinguish a nonexistent code from an unavailable code without bypassing authorization. */
export function classifyInternalIdClaim(identity: ClaimableIdentity | undefined): string | null {
  if (!identity) return 'invalid_internal_id'
  if (identity.status !== 'available' || identity.userId) return 'internal_id_not_available'
  // The first administrator is enrolled by presenting an unclaimed JCA code.
  if (identity.type !== 'admin' && identity.claimMode !== 'self') return 'internal_id_restricted'
  if (identity.type !== 'admin' && !identity.entityId) return 'internal_id_not_ready'
  return null
}
