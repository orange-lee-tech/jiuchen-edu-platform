import type { AdminInternalId } from './request'
export const ID_FILTERS = ['全部状态', '未认领', '已认领', '已暂停', '已撤销', '未分配', '已分配', '资料待完善']
export function internalIdView(item: AdminInternalId, currentUserId = '') {
  const statusLabel = item.status === 'available' ? '未认领' : item.status === 'claimed' ? '已认领' : item.userId || !item.claimedAt ? '已暂停' : '已撤销'
  const typeLabel = { student: '学员', teacher: '老师', admin: '管理员' }[item.type]
  const own = Boolean(currentUserId && item.userId === currentUserId)
  const actions = own ? [] : item.status === 'claimed' ? ['暂停访问', '撤销授权'] : item.status === 'disabled' ? ['恢复编号', ...(item.userId ? ['撤销授权'] : ['删除编号'])] : ['绑定账号', '删除编号']
  return { ...item, statusLabel, typeLabel, own, actions,
    profileLabel:item.nameLabel||(item.userId?'档案待读取':'未认领'),
    allocationLabel:item.assignmentLabel||(item.userId?'分配状态待读取':'未认领'),
    accountLabel:item.userStatus==='deleted'?'账号已停用':item.teacherStatus==='inactive'?'老师档案已停用':'',
  }
}
export function filterInternalIds(items: AdminInternalId[], query: string, filterIndex: number, currentUserId = '') {
  const q = query.trim().toUpperCase().replace(/[\s-]/g, '')
  return items.map(i => internalIdView(i, currentUserId)).filter(i => (!q || [i.businessId,i.name,i.university,i.displayName].some(v=>v?.toUpperCase().replace(/[\s-]/g,'').includes(q))) && (!filterIndex || (filterIndex<5 ? i.statusLabel===ID_FILTERS[filterIndex] : filterIndex===5 ? i.assignmentState==='unassigned' : filterIndex===6 ? i.assignmentState==='assigned' : i.profileState==='incomplete')))
}
