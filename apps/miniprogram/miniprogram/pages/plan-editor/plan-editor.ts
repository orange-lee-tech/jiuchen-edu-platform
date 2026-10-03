import {
  friendlyRequestError,
  getMyClassroom,
  getMyPlanVersions,
  getTeacherStudentClassroom,
  saveMyClassroomPlan,
  saveTeacherStudentPlan,
  type ClassroomPlanType,
  type PlanEditorItem,
  type PlanRevision,
} from '../../utils/request'

function formatVersionDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const STATUS_OPTIONS = [
  { value: 'pending', label: '未开始' },
  { value: 'in_progress', label: '进行中' },
  { value: 'done', label: '已完成' },
] as const

Page({
  data: {
    loading: true,
    saving: false,
    teacherMode: false,
    studentId: '',
    studentName: '',
    stageCode: '',
    type: 'gpa' as ClassroomPlanType,
    title: '',
    items: [] as PlanEditorItem[],
    versions: [] as PlanRevision[],
    revisionStatus: 'none' as 'none' | 'pending' | 'approved',
    statusOptions: STATUS_OPTIONS,
  },

  onLoad(options: Record<string, string>) {
    const stageCode = decodeURIComponent(options.stage || '')
    const type = decodeURIComponent(options.type || '') as ClassroomPlanType
    const studentId = decodeURIComponent(options.studentId || '')
    this.setData({
      stageCode,
      type,
      studentId,
      teacherMode: Boolean(studentId),
      studentName: decodeURIComponent(options.studentName || ''),
    })
    void this.loadPlan()
  },

  async loadPlan() {
    try {
      this.setData({ loading: true })
      const classroom = this.data.teacherMode
        ? await getTeacherStudentClassroom(this.data.studentId, this.data.stageCode)
        : await getMyClassroom(this.data.stageCode)
      const plan = classroom.plans.find((item) => item.type === this.data.type)
      if (!plan) throw new Error('当前阶段没有该计划')

      this.setData({
        studentName: this.data.studentName || classroom.student.name,
        title: plan.title,
        items: plan.items.map((item) => ({
          name: item.name,
          target: item.target,
          status: item.status,
        })),
        revisionStatus: plan.revisionStatus || (plan.id ? 'approved' : 'none'),
      })

      if (!this.data.teacherMode) {
        const versions = await getMyPlanVersions(this.data.stageCode, this.data.type).catch(() => [])
        this.setData({
          versions: versions.map((version) => ({
            ...version,
            createdAt: formatVersionDate(version.createdAt),
          })),
        })
      }
    } catch (error) {
      wx.showToast({
        title: friendlyRequestError(error, '计划加载失败，请稍后重试'),
        icon: 'none',
        duration: 2600,
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  onTitleInput(event: WechatMiniprogram.Input) {
    this.setData({ title: event.detail.value })
  },

  onAddItem() {
    if (this.data.items.length >= 50) return
    this.setData({
      items: [
        ...this.data.items,
        { name: '', target: '', status: 'pending' as const },
      ],
    })
  },

  onItemInput(event: WechatMiniprogram.Input) {
    const index = Number(event.currentTarget.dataset.index)
    const field = String(event.currentTarget.dataset.field) as 'name' | 'target'
    const items = [...this.data.items]
    if (!items[index]) return
    items[index] = { ...items[index], [field]: event.detail.value }
    this.setData({ items })
  },

  onStatusChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const index = Number(event.currentTarget.dataset.index)
    const option = STATUS_OPTIONS[Number(event.detail.value)]
    const items = [...this.data.items]
    if (!items[index] || !option) return
    items[index] = { ...items[index], status: option.value }
    this.setData({ items })
  },

  onRemoveItem(event: WechatMiniprogram.BaseEvent) {
    const index = Number(event.currentTarget.dataset.index)
    const items = [...this.data.items]
    items.splice(index, 1)
    this.setData({ items })
  },

  async onSave() {
    const title = this.data.title.trim()
    const items = this.data.items
      .map((item) => ({
        name: item.name.trim(),
        target: item.target?.trim() || null,
        status: item.status,
      }))
      .filter((item) => item.name)

    if (!title) {
      wx.showToast({ title: '请填写计划名称', icon: 'none' })
      return
    }

    try {
      this.setData({ saving: true })
      if (this.data.teacherMode) {
        await saveTeacherStudentPlan(
          this.data.studentId,
          this.data.stageCode,
          this.data.type,
          { title, items },
        )
        wx.showToast({ title: '已保存为正式版', icon: 'success' })
      } else {
        await saveMyClassroomPlan(this.data.stageCode, this.data.type, { title, items })
        wx.showToast({ title: '已提交老师审核', icon: 'success' })
      }
      await this.loadPlan()
    } catch (error) {
      wx.showToast({
        title: friendlyRequestError(error, '计划保存失败，请稍后重试'),
        icon: 'none',
        duration: 2600,
      })
    } finally {
      this.setData({ saving: false })
    }
  },
})
