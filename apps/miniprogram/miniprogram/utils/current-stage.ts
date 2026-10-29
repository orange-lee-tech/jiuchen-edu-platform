import { getSavedAuthResult } from './auth'
import { isReadOnly } from './read-only-context'
import { getCurrentStageSuggestion, setCurrentClassroomStage, type CurrentStageMode } from './request'

export type StageResolution = { stage: string | null; suggested: string | null; mode: CurrentStageMode; notice: string; scheduleSafe: boolean }

/** The server supplies the suggestion; old and manually selected stages are never silently overwritten. */
export async function resolveCurrentStage(): Promise<StageResolution> {
  const auth = getSavedAuthResult()
  if (!auth || auth.user.role !== 'student' || isReadOnly()) throw new Error('stage_read_only')
  const owner = auth.user.id
  const checkOwner = () => {
    const current = getSavedAuthResult()
    if (!current || current.user.id !== owner || current.user.role !== 'student' || isReadOnly()) throw new Error('session_changed')
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    const value = await getCurrentStageSuggestion()
    checkOwner()
    const mode = value.mode ?? null
    const suggestion = value.suggestedStage
    if (suggestion && ((mode === 'auto' && value.currentStage !== suggestion) || (mode === null && (value.currentStage === null || value.currentStage === suggestion)))) {
      try {
        const updated = await setCurrentClassroomStage(suggestion, value.currentStage, { mode: 'auto', expectedMode: mode })
        checkOwner()
        return { stage: updated.currentStage, suggested: suggestion, mode: 'auto', notice: '', scheduleSafe: true }
      } catch (error) {
        checkOwner()
        if (attempt === 0 && (error as { statusCode?: number }).statusCode === 409) continue
        throw error
      }
    }
    if (!suggestion) return { stage: value.currentStage, suggested: null, mode, notice: '入学年份或学期待核对，请完善资料并确认当前阶段。', scheduleSafe: mode === 'manual' && Boolean(value.currentStage) }
    if (mode === null) return { stage: value.currentStage, suggested: suggestion, mode, notice: value.currentStage === suggestion ? '请确认使用自动定位或手动阶段。' : '已保存阶段与入学年份建议不同，请核对。', scheduleSafe: value.currentStage === suggestion }
    if (mode === 'manual' && value.currentStage !== suggestion) return { stage: value.currentStage, suggested: suggestion, mode, notice: '当前为手动阶段，与入学年份建议不同。', scheduleSafe: true }
    return { stage: value.currentStage, suggested: suggestion, mode, notice: '', scheduleSafe: Boolean(value.currentStage) }
  }
  throw new Error('current_stage_changed')
}
