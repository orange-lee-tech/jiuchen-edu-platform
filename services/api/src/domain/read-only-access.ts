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
