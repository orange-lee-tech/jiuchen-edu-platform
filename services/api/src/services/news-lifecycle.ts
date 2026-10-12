export type DisplayPhase = 'normal' | 'buffering' | 'retired' | 'source_invalid'
export type DisplayState = {
  postId: string
  phase: DisplayPhase
  bufferedAt: string | null
  retireAt: string | null
}
export type DisplayCandidate = { id: string; sortTime: string | null; approved: boolean; hidden: boolean }

const WINDOW = 20
const BUFFER_MS = 72 * 60 * 60 * 1000

/** Reconcile only after a complete, successful source scan or an approved tag change.
 * The caller persists all changes and one batch event in a single transaction.
 */
export function planNewsWindow(candidates: DisplayCandidate[], existing: DisplayState[], now: Date, sourceComplete: boolean) {
  if (!sourceComplete) return { changes: [] as DisplayState[], entered: [] as string[], leaving: [] as DisplayState[], normalIds: [] as string[] }
  const states = new Map(existing.map(row => [row.postId, row]))
  const approved = candidates.filter(row => row.approved && !row.hidden && states.get(row.id)?.phase !== 'source_invalid')
    .sort((a, b) => (b.sortTime || '').localeCompare(a.sortTime || '') || a.id.localeCompare(b.id))
  const normalIds = approved.slice(0, WINDOW).map(row => row.id)
  const normal = new Set(normalIds)
  const changes: DisplayState[] = []
  const entered: string[] = []
  const leaving: DisplayState[] = []
  const approvedIds = new Set(approved.map(row => row.id))
  for (const row of approved) {
    const old = states.get(row.id)
    if (normal.has(row.id)) {
      if (old?.phase === 'normal') continue
      const next: DisplayState = { postId: row.id, phase: 'normal', bufferedAt: null, retireAt: null }
      changes.push(next)
      if (old || existing.length > 0) entered.push(row.id) // initial import is not a new-post event
    } else if (old?.phase === 'retired' || old?.phase === 'buffering') {
      if (old.phase === 'buffering' && old.retireAt && new Date(old.retireAt).getTime() <= now.getTime())
        changes.push({ ...old, phase: 'retired' })
    } else if(old?.phase==='normal') {
      const next: DisplayState = { postId: row.id, phase: 'buffering', bufferedAt: now.toISOString(), retireAt: new Date(now.getTime() + BUFFER_MS).toISOString() }
      changes.push(next)
      leaving.push(next)
    } else {
      // Bootstrap overflow never occupied the public window.
      changes.push({postId:row.id,phase:'retired',bufferedAt:null,retireAt:null})
    }
  }
  // Removing a label or hiding an article must remove it from the public window.
  for (const old of existing) {
    if (!['normal','buffering'].includes(old.phase) || approvedIds.has(old.postId)) continue
    changes.push({ ...old, phase: 'retired', bufferedAt: old.bufferedAt ?? now.toISOString(), retireAt: old.retireAt ?? now.toISOString() })
  }
  return { changes, entered, leaving, normalIds }
}

export function shouldCreateRetirementEvent(plan: ReturnType<typeof planNewsWindow>) {
  return plan.entered.length > 0 && plan.leaving.length > 0
}
