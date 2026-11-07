export type PlanNavigationIntent = { intent?: string; owner?: string; createdAt?: number }

export function isValidWeekNavigationIntent(intent: PlanNavigationIntent | undefined, owner: string, now = Date.now()) {
  if (!intent || intent.intent !== 'week' || !owner || intent.owner !== owner) return false
  const createdAt = Number(intent.createdAt)
  const age = now - createdAt
  return Number.isFinite(createdAt) && age >= 0 && age < 120000
}

/** Resolve after the current account/read-only owner has been established. */
export function initialPlanView(owner: string, intent: PlanNavigationIntent | undefined, now = Date.now()) {
  return isValidWeekNavigationIntent(intent, owner, now) ? 'week' : 'stage'
}
