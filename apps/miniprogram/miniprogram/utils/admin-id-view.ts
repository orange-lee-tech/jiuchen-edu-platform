import type { AdminInternalId } from './request'
export const ID_FILTERS = ['全部状态', '可认领', '已绑定', '已暂停', '已撤销']
export function internalIdView(item: AdminInternalId, currentUserId = '') {
  const statusLabel = item.status === 'available' ? '可认领' : item.status === 'claimed' ? '已绑定' : item.userId || !item.claimedAt ? '已暂停' : '已撤销'
  const typeLabel = { student: '学员', teacher: '老师', admin: '管理员' }[item.type]
  const own = Boolean(currentUserId && item.userId === currentUserId)
  const actions = own ? [] : item.status === 'claimed' ? ['暂停访问', '撤销授权'] : item.status === 'disabled' ? ['恢复编号', ...(item.userId ? ['撤销授权'] : ['删除编号'])] : ['绑定账号', '删除编号']
  return { ...item, statusLabel, typeLabel, own, actions }
}
export function filterInternalIds(items: AdminInternalId[], query: string, filterIndex: number, currentUserId = '') {
  const q = query.trim().toUpperCase().replace(/[\s-]/g, '')
  return items.map(i => internalIdView(i, currentUserId)).filter(i => (!q || i.businessId.toUpperCase().replace(/[\s-]/g, '').includes(q)) && (!filterIndex || i.statusLabel === ID_FILTERS[filterIndex]))
}
