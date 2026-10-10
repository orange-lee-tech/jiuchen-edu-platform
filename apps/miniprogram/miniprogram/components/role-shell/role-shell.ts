import { refreshAuthResult } from '../../utils/auth'
import { openPage, openSlot } from '../../utils/navigation'

type Action = { key: string; title: string; description: string; url: string }
const students: Action = { key: 'students', title: '查看我的学员', description: '查看获授权的学员，进入对应阶段规划。', url: '/pages/teacher-students/teacher-students' }
const reviews: Action = { key: 'reviews', title: '审核学员规划', description: '查看学员提交的更新，按实际内容通过或退回。', url: '/pages/teacher-students/teacher-students' }
const mirror: Action = { key:'mirror', title:'只读查看学员与老师', description:'搜索或选择对象，查看真实业务档案。管理员身份不变。', url:'/pages/admin/admin?section=admin-readonly' }
const users: Action = { key: 'users', title: '管理用户与编号', description: '查看账号、内部编号及绑定状态。', url: '/pages/admin/admin?section=admin-users' }
const assignments: Action = { key: 'assignments', title: '管理师生分配', description: '查看和维护老师与学员的辅导关系。', url: '/pages/admin/admin?section=admin-assignments' }
const articles: Action = { key: 'articles', title: '管理资讯与标签', description: '维护文章分类，按需同步服务号内容。', url: '/pages/admin/admin?section=admin-news' }
const analytics: Action = { key: 'analytics', title: 'AI 评估与充值统计', description: '真实评估次数、充值订单与金额排行榜。', url: '/pages/admin/admin?section=admin-analytics' }
const content: Record<string, { title: string; description: string; actions: Action[] }> = {
  'teacher-home': { title: '从学员的下一步开始', description: '查看学员阶段规划，处理他们提交的更新。', actions: [students, reviews] },
  'teacher-plan': { title: '学员与阶段规划', description: '进入获授权学员的资料与规划，接续日常辅导。', actions: [students] },
  'teacher-opportunity': { title: '跟进学员的规划更新', description: '审核学员提交的版本，或进入学员规划进行调整。', actions: [reviews, students] },
  'admin-home': { title: '九辰管理工作台', description: '高频工作直接进入：身份查阅、账号管理与业务运营不再经过重复菜单。', actions: [mirror, users, assignments, analytics] },
  'admin-plan': { title: '跨身份只读查阅', description: '查看任意学员或老师的档案。只读，不继承被查看人的操作权限。', actions: [mirror] },
  'admin-opportunity': { title: '业务与数据运营', description: '师生关系、资讯发布、评估与充值统计各自独立进入。', actions: [assignments, articles, analytics] },
}

Component({
  properties: {
    viewSlot: { type: String, value: 'home' },
    phase: { type: String, value: 'loading' },
    kind: { type: String, value: 'student' },
    roleLabel: { type: String, value: '' },
    message: { type: String, value: '' },
  },
  data: { title: '', description: '', actions: [] as Action[], opening: false },
  observers: {
    'viewSlot, kind': function (viewSlot: string, kind: string) {
      this.setData(content[`${kind}-${viewSlot}`] || { title: '', description: '', actions: [] })
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
