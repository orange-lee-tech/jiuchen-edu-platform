import type { AcademicProfile } from './request'

export type PositionProfileForm = { university: string; major: string; currentGrade: string; gpaText: string; rankText: string }

export const EMPTY_POSITION_PROFILE: PositionProfileForm = { university: '', major: '', currentGrade: '', gpaText: '', rankText: '' }
export const POSITION_PROFILE_FIELDS = ['university', 'major', 'currentGrade', 'gpaText', 'rankText'] as const

export function positionProfileForm(profile: AcademicProfile): PositionProfileForm {
  return { university: profile.university || '', major: profile.major || '', currentGrade: profile.currentGrade || '', gpaText: profile.gpaText || '', rankText: profile.rankText || '' }
}

export function positionProfilePatch(form: PositionProfileForm): Partial<AcademicProfile> {
  return { university: form.university.trim() || null, major: form.major.trim() || null, currentGrade: form.currentGrade.trim() || null, gpaText: form.gpaText.trim() || null, rankText: form.rankText.trim() || null }
}

export function positionProfileDirty(draft: PositionProfileForm, saved: PositionProfileForm): boolean {
  return JSON.stringify(positionProfilePatch(draft)) !== JSON.stringify(positionProfilePatch(saved))
}

export function positionProfileError(form: PositionProfileForm): string {
  const limits: Record<keyof PositionProfileForm, number> = { university: 160, major: 160, currentGrade: 40, gpaText: 80, rankText: 80 }
  return POSITION_PROFILE_FIELDS.some(field => form[field].trim().length > limits[field]) ? '填写内容过长，请检查后重试。' : ''
}
