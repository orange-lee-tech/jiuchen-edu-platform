export const USER_ROLES = ['user', 'student', 'teacher', 'staff', 'admin'] as const
export type UserRole = (typeof USER_ROLES)[number]

export const PLACEHOLDER_USER_AGREEMENT_VERSION = 'placeholder-v0'

export function canEditAcademicProfile(role: UserRole): boolean {
  return role === 'user' || role === 'student'
}

export function canUseAssessment(role: UserRole): boolean {
  return role === 'user' || role === 'student'
}

export function canAccessTeacherWorkspace(role: UserRole): boolean {
  return role === 'teacher' || role === 'staff' || role === 'admin'
}

export function canAccessAdminWorkspace(role: UserRole): boolean {
  return role === 'admin'
}

export function roleLabel(role: UserRole): string {
  switch (role) {
    case 'student':
      return '学员'
    case 'teacher':
      return '老师'
    case 'staff':
      return '内部员工'
    case 'admin':
      return '管理员'
    default:
      return '游客'
  }
}
