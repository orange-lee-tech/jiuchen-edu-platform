import { refreshAuthResult } from '../../utils/auth'
import { openPage, openSlot } from '../../utils/navigation'

type Action = { key: string; title: string; description: string; url: string }
const students: Action = { key: 'students', title: '查看我的学员', description: '查看获授权的学员，进入对应阶段规划。', url: '/pages/teacher-students/teacher-students' }
const reviews: Action = { key: 'reviews', title: '审核学员规划', description: '查看学员提交的更新，按实际内容通过或退回。', url: '/pages/teacher-students/teacher-students' }
const users: Action = { key: 'users', title: '管理用户与编号', description: '查看账号、内部编号及绑定状态。', url: '/pages/admin/admin?section=admin-users' }
const assignments: Action = { key: 'assignments', title: '管理师生分配', description: '查看和维护老师与学员的辅导关系。', url: '/pages/admin/admin?section=admin-assignments' }
const articles: Action = { key: 'articles', title: '管理资讯与标签', description: '维护文章分类，按需同步服务号内容。', url: '/pages/admin/admin?section=admin-news' }
const content: Record<string, { title: string; description: string; actions: Action[] }> = {
  'teacher-home': { title: '从学员的下一步开始', description: '查看学员阶段规划，处理他们提交的更新。', actions: [students, reviews] },
  'teacher-plan': { title: '学员与阶段规划', description: '进入获授权学员的资料与规划，接续日常辅导。', actions: [students] },
  'teacher-opportunity': { title: '跟进学员的规划更新', description: '审核学员提交的版本，或进入学员规划进行调整。', actions: [reviews, students] },
  'admin-home': { title: '把服务关系安排清楚', description: '从用户身份、师生分配与资讯维护进入日常管理。', actions: [users, assignments, articles] },
  'admin-plan': { title: '用户身份与内部编号', description: '打开现有管理页，查看账号和业务身份的真实状态。', actions: [users] },
  'admin-opportunity': { title: '师生分配与资讯维护', description: '维护服务关系和内容分类，操作结果由服务器确认。', actions: [assignments, articles] },
}

Component({
  properties: {
    slot: { type: String, value: 'home' },
    phase: { type: String, value: 'loading' },
    kind: { type: String, value: 'student' },
    roleLabel: { type: String, value: '' },
    message: { type: String, value: '' },
  },
  data: { title: '', description: '', actions: [] as Action[], opening: false },
  observers: {
    'slot, kind': function (slot: string, kind: string) {
      this.setData(content[`${kind}-${slot}`] || { title: '', description: '', actions: [] })
    },
  },
  methods: {
    onRetry() { void refreshAuthResult() },
    onMine() { openSlot('mine') },
    onAction(event: WechatMiniprogram.BaseEvent) {
      if (this.properties.phase !== 'ready' || this.data.opening) return
      const key = String(event.currentTarget.dataset.key || '')
      const action = this.data.actions.find((item) => item.key === key)
      if (!action) return
      this.setData({ opening: true })
      openPage(action.url)
      setTimeout(() => this.setData({ opening: false }), 500)
    },
  },
})
