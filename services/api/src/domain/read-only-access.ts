/** Target-specific viewing rights. Never grants target account credentials or writes. */
export function mayViewStudent(role:string, assigned:boolean):boolean {
  return role === 'admin' || (role === 'teacher' && assigned)
}
export function mayViewTeacher(role:string):boolean {
  return role === 'admin'
}
export function readOnlyMethodAllowed(method:string):boolean {
  return method.toUpperCase() === 'GET'
}

/** Explicit allowlist: never expose the linked account userId via classroom.student. */
export function pickClassroomStudent(student: {
  id:string; name:string; university:string|null; major:string|null;
  currentStage:string|null; userId?:string|null
}) {
  return {
    id:student.id,name:student.name,university:student.university,
    major:student.major,currentStage:student.currentStage,
  }
}
