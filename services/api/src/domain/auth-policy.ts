export const LOGIN_PORTALS = ['student', 'teacher'] as const
export type LoginPortal = (typeof LOGIN_PORTALS)[number]

export const USER_ROLES = ['user', 'student', 'teacher', 'staff', 'admin'] as const
export type UserRole = (typeof USER_ROLES)[number]

export const PLACEHOLDER_USER_AGREEMENT_VERSION = 'placeholder-v0'

export function canEnterPortal(role: UserRole, portal: LoginPortal): boolean {
  if (portal === 'teacher') {
    return role === 'teacher' || role === 'staff' || role === 'admin'
  }

  return role !== 'teacher'
}

export function needsStudentBinding(role: UserRole, portal: LoginPortal): boolean {
  return portal === 'student' && role === 'user'
}
