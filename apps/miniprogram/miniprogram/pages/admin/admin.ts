import { getSavedAuthResult } from '../../utils/auth'
import {
  bindAdminInternalId,
  createAdminAssignment,
  createAdminInternalId,
  deleteAdminAssignment,
  deleteAdminInternalId,
  getAdminAssignments,
  getAdminInternalIds,
  getAdminNews,
  getAdminStudents,
  getAdminTeachers,
  getAdminUsers,
  syncOfficialAccountNews,
  unbindAdminInternalId,
  type AdminAssignment,
  type AdminInternalId,
  type AdminNewsPost,
  type AdminTeacher,
  type AdminUser,
  type StudentSummary,
} from '../../utils/request'

type Section = 'admin-users' | 'admin-assignments' | 'admin-news'

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
        posts,
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

  onIdTypeChange(event: WechatMiniprogram.PickerChange) {
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

  onBindIdChange(event: WechatMiniprogram.PickerChange) {
    this.setData({ bindIdIndex: Number(event.detail.value) })
  },

  onBindUserChange(event: WechatMiniprogram.PickerChange) {
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
      title: '解绑内部ID',
      content: '解绑后对应账号会恢复为游客，该内部ID会变为禁用状态。',
      success: async (result) => {
        if (!result.confirm) return
        try {
          await unbindAdminInternalId(id)
          await this.loadData()
          wx.showToast({ title: '已解绑', icon: 'none' })
        } catch (error) {
          const message = error instanceof Error ? error.message : '解绑失败'
          wx.showToast({ title: message, icon: 'none' })
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

  onStudentChange(event: WechatMiniprogram.PickerChange) {
    this.setData({ studentIndex: Number(event.detail.value) })
  },

  onTeacherChange(event: WechatMiniprogram.PickerChange) {
    this.setData({ teacherIndex: Number(event.detail.value) })
  },

  onRelationshipChange(event: WechatMiniprogram.PickerChange) {
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

  async onSyncNews() {
    try {
      this.setData({ actionLoading: true })
      const synced = await syncOfficialAccountNews()
      wx.showToast({ title: `已同步 ${synced} 条`, icon: 'success' })
      this.setData({ posts: await getAdminNews() })
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
