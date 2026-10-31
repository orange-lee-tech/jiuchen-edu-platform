import { request, type NewsPost, ApiRequestError } from './request'

export type TeacherTaggedPost = {
  id: string; title: string; globalTags: string[]; teacherTags: string[]; updatedAt: string | null
}
export async function getTeacherTaggedNews() {
  return (await request<{ ok: true; posts: TeacherTaggedPost[] }>('/me/teacher/news')).posts
}
export async function saveTeacherNewsTags(id: string, tags: string[]) {
  return request<{ ok: true; teacherTags: string[] }>(`/me/teacher/news/${encodeURIComponent(id)}/tags`, 'PUT', { tags })
}
export function newsTagScopeNote(post: NewsPost) {
  const global = post.globalTags ?? post.tags
  const notes = global.length ? [`平台分类：${global.join('、')}`] : []
  for (const scope of post.teacherTags ?? []) {
    if (scope.tags.length) notes.push(`${scope.teacherName}老师分类：${scope.tags.join('、')}`)
  }
  return notes.join('；')
}
export function teacherNewsError(error: unknown) {
  if (error instanceof ApiRequestError) return `读取或保存未成功（${error.statusCode}/${error.code}），请重试。`
  return '网络或服务暂不可用，请重试。'
}
