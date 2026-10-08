import { getSavedAuthResult } from '../../utils/auth'
import {
  bindAdminInternalId,
  createAdminAssignment,
  createAdminInternalId,
  deleteAdminAssignment,
  deleteAdminInternalId,
  pauseAdminInternalId,
  restoreAdminInternalId,
  getAdminAssignments,
  getAdminInternalIds,
  getAdminNews,
  getAdminStudents,
  getAdminTeachers,
  getAdminUsers,
  syncOfficialAccountNews,
  unbindAdminInternalId,
  updateAdminNewsTags,
  type AdminAssignment,
  type AdminInternalId,
  type AdminNewsPost,
  type AdminTeacher,
  type AdminUser,
  type StudentSummary,
} from '../../utils/request'

type Section = 'admin-users' | 'admin-assignments' | 'admin-news'

function newsReviewState(posts: AdminNewsPost[]) {
  // Review queue is derived from existing canonical tags; no secondary state store.
  const sorted = [...posts].sort(
    (a, b) => Number(b.tags.length === 0) - Number(a.tags.length === 0),
  )
  return {
    posts: sorted,
    pendingClassificationCount: posts.filter((post) => post.tags.length === 0).length,
  }
}

const ID_TYPES = [
  { value: 'student', label: '学员ID' },
  { value: 'teacher', label: '老师ID' },
  { value: 'admin', label: '管理员ID' },
] as const

Page({
  data: {
    section: 'admin-users' as Section,
    loading: true,
    actionLoading: false,
    internalIds: [] as AdminInternalId[],
    users: [] as AdminUser[],
    students: [] as StudentSummary[],
    teachers: [] as AdminTeacher[],
    assignments: [] as AdminAssignment[],
    posts: [] as AdminNewsPost[],
    pendingClassificationCount: 0,
    idTypes: ID_TYPES,
    newIdTypeIndex: 0,
    newIdName: '',
    availableIds: [] as AdminInternalId[],
    guestUsers: [] as AdminUser[],
    bindIdIndex: 0,
    bindUserIndex: 0,
    studentIndex: 0,
    teacherIndex: 0,
    relationship: 'primary' as 'primary' | 'support',
    relationshipOptions: ['主辅导', '协助'],
  },

  onLoad(options: Record<string, string>) {
    const auth = getSavedAuthResult()
    if (!auth || auth.user.role !== 'admin') {
      wx.showToast({ title: '仅管理员可访问', icon: 'none' })
      wx.navigateBack()
      return
    }

    const section = String(options.section || 'admin-users') as Section
    if (['admin-users', 'admin-assignments', 'admin-news'].includes(section)) {
      this.setData({ section })
    }

    void this.loadData()
  },

  async loadData() {
    try {
      this.setData({ loading: true })
      const [internalIds, users, students, teachers, assignments, posts] = await Promise.all([
        getAdminInternalIds(),
        getAdminUsers(),
        getAdminStudents(),
        getAdminTeachers(),
        getAdminAssignments(),
        getAdminNews(),
      ])

      const availableIds = internalIds.filter((item) => item.status === 'available')
      const guestUsers = users.filter((item) => item.status === 'active' && item.role === 'user')

      this.setData({
        internalIds,
        users,
        students,
        teachers,
        assignments,
        ...newsReviewState(posts),
        availableIds,
        guestUsers,
        bindIdIndex: Math.min(this.data.bindIdIndex, Math.max(0, availableIds.length - 1)),
        bindUserIndex: Math.min(this.data.bindUserIndex, Math.max(0, guestUsers.length - 1)),
        studentIndex: Math.min(this.data.studentIndex, Math.max(0, students.length - 1)),
        teacherIndex: Math.min(this.data.teacherIndex, Math.max(0, teachers.length - 1)),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '管理员数据加载失败'
      wx.showToast({ title: message, icon: 'none', duration: 2500 })
    } finally {
      this.setData({ loading: false })
    }
  },

  onSectionChange(event: WechatMiniprogram.BaseEvent) {
    const section = String(event.currentTarget.dataset.section) as Section
    if (!['admin-users', 'admin-assignments', 'admin-news'].includes(section)) return
    this.setData({ section })
  },

  onIdTypeChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.setData({ newIdTypeIndex: Number(event.detail.value) })
  },

  onNameInput(event: WechatMiniprogram.Input) {
    this.setData({ newIdName: event.detail.value })
  },

  async onCreateId() {
    const selected = ID_TYPES[this.data.newIdTypeIndex]
    try {
      this.setData({ actionLoading: true })
      await createAdminInternalId(selected.value, this.data.newIdName.trim() || null)
      this.setData({ newIdName: '' })
      wx.showToast({ title: '内部ID已生成', icon: 'success' })
      await this.loadData()
    } catch (error) {
      const message = error instanceof Error ? error.message : '生成失败'
      wx.showToast({ title: message, icon: 'none' })
    } finally {
      this.setData({ actionLoading: false })
    }
  },

  onBindIdChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.setData({ bindIdIndex: Number(event.detail.value) })
  },

  onBindUserChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.setData({ bindUserIndex: Number(event.detail.value) })
  },

  async onBindId() {
    const identity = this.data.availableIds[this.data.bindIdIndex]
    const user = this.data.guestUsers[this.data.bindUserIndex]
    if (!identity || !user) {
      wx.showToast({ title: '暂无可绑定ID或游客账号', icon: 'none' })
      return
    }

    try {
      this.setData({ actionLoading: true })
      await bindAdminInternalId(identity.id, user.id)
      wx.showToast({ title: '绑定成功', icon: 'success' })
      await this.loadData()
    } catch (error) {
      const message = error instanceof Error ? error.message : '绑定失败'
      wx.showToast({ title: message, icon: 'none' })
    } finally {
      this.setData({ actionLoading: false })
    }
  },

  onUnbindId(event: WechatMiniprogram.BaseEvent) {
    const id = String(event.currentTarget.dataset.id || '')
    wx.showModal({
      title: '撤销授权',
      content: '撤销后对应账号恢复为游客，ID禁用；恢复授权后编号重新可认领，不会自动绑定原账号。'
      success: async (result) => {
        if (!result.confirm) return
        try {
          await unbindAdminInternalId(id)
          await this.loadData()
          wx.showToast({ title: '授权已撤销', icon: 'none' })
        } catch (error) {
          const message = error instanceof Error ? error.message : '解绑失败'
          wx.showToast({ title: message, icon: 'none' })
        }
      },
    })
  },

  onPauseId(event: WechatMiniprogram.BaseEvent) {
    const id = String(event.currentTarget.dataset.id || '')
    wx.showModal({
      title: '暂停内部ID',
      content: '已绑定账号将立即无法进行授权操作；恢复后原账号可以继续使用。',
      success: async (result) => {
        if (!result.confirm) return
        try {
          await pauseAdminInternalId(id)
          await this.loadData()
          wx.showToast({ title: '已暂停', icon: 'none' })
        } catch (error) {
          wx.showToast({ title: friendlyRequestError(error, '暂停失败'), icon: 'none' })
        }
      },
    })
  },

  onRestoreId(event: WechatMiniprogram.BaseEvent) {
    const id = String(event.currentTarget.dataset.id || '')
    wx.showModal({
      title: '恢复内部ID',
      content: '暂停中的ID恢复原账号访问；已撤销授权的ID恢复为可认领状态。',
      success: async (result) => {
        if (!result.confirm) return
        try {
          await restoreAdminInternalId(id)
          await this.loadData()
          wx.showToast({ title: '已恢复', icon: 'success' })
        } catch (error) {
          wx.showToast({ title: friendlyRequestError(error, '恢复失败'), icon: 'none' })
        }
      },
    })
  },

  onDeleteId(event: WechatMiniprogram.BaseEvent) {
    const id = String(event.currentTarget.dataset.id || '')
    wx.showModal({
      title: '删除内部ID',
      content: '仅未绑定或已解绑的ID可删除。删除对应测试学员/老师ID时，其占位业务档案也会一并删除。',
      confirmColor: '#c2413d',
      success: async (result) => {
        if (!result.confirm) return
        try {
          await deleteAdminInternalId(id)
          await this.loadData()
          wx.showToast({ title: '已删除', icon: 'none' })
        } catch (error) {
          const message = error instanceof Error ? error.message : '删除失败'
          wx.showToast({ title: message, icon: 'none' })
        }
      },
    })
  },

  onStudentChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.setData({ studentIndex: Number(event.detail.value) })
  },

  onTeacherChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.setData({ teacherIndex: Number(event.detail.value) })
  },

  onRelationshipChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.setData({ relationship: Number(event.detail.value) === 0 ? 'primary' : 'support' })
  },

  async onAddAssignment() {
    const student = this.data.students[this.data.studentIndex]
    const teacher = this.data.teachers[this.data.teacherIndex]
    if (!student || !teacher) {
      wx.showToast({ title: '暂无可用老师或学员', icon: 'none' })
      return
    }

    try {
      this.setData({ actionLoading: true })
      await createAdminAssignment({
        studentId: student.id,
        teacherId: teacher.id,
        stageCode: null,
        relationship: this.data.relationship,
      })
      wx.showToast({ title: '分配关系已建立', icon: 'success' })
      await this.loadData()
    } catch (error) {
      const message = error instanceof Error ? error.message : '分配失败'
      wx.showToast({ title: message, icon: 'none' })
    } finally {
      this.setData({ actionLoading: false })
    }
  },

  onDeleteAssignment(event: WechatMiniprogram.BaseEvent) {
    const id = String(event.currentTarget.dataset.id || '')
    wx.showModal({
      title: '移除师生关系',
      content: '移除后该老师将不再通过这条授权关系访问该学员。',
      success: async (result) => {
        if (!result.confirm) return
        try {
          await deleteAdminAssignment(id)
          await this.loadData()
          wx.showToast({ title: '已移除', icon: 'none' })
        } catch (error) {
          const message = error instanceof Error ? error.message : '移除失败'
          wx.showToast({ title: message, icon: 'none' })
        }
      },
    })
  },

  onEditNewsTags(event: WechatMiniprogram.BaseEvent) {
    const id = String(event.currentTarget.dataset.id || '')
    const post = this.data.posts.find((item) => item.id === id)
    if (!post) return

    wx.showModal({
      title: '管理资讯标签',
      content: post.tags.join('、'),
      editable: true,
      placeholderText: '多个标签用逗号、顿号或空格分隔；留空即删除全部标签',
      confirmText: '保存',
      success: async (result) => {
        if (!result.confirm) return
        const raw = String(result.content || '')
        const tags = [...new Set(
          raw
            .split(/[，,、;；\s]+/)
            .map((item) => item.trim())
            .filter(Boolean),
        )].slice(0, 8)

        try {
          this.setData({ actionLoading: true })
          await updateAdminNewsTags(id, tags)
          this.setData(newsReviewState(await getAdminNews()))
          wx.showToast({
            title: tags.length ? '标签已更新' : '标签已清空',
            icon: 'success',
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : '标签保存失败'
          wx.showToast({ title: message, icon: 'none' })
        } finally {
          this.setData({ actionLoading: false })
        }
      },
    })
  },

  async onSyncNews() {
    try {
      this.setData({ actionLoading: true })
      const synced = await syncOfficialAccountNews()
      wx.showToast({ title: `已同步 ${synced} 条`, icon: 'success' })
      this.setData(newsReviewState(await getAdminNews()))
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      const title = message.includes('official_account_not_configured')
        ? '服务号接口尚未配置'
        : '同步失败，请检查服务号接口权限'
      wx.showToast({ title, icon: 'none', duration: 2600 })
    } finally {
      this.setData({ actionLoading: false })
    }
  },
})
