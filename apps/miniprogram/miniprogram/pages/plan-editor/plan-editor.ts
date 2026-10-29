import { authorizePage } from '../../utils/navigation'
import {isReadOnly} from '../../utils/read-only-context'
import {
  friendlyRequestError,
  getLatestScheduleImport,
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
    loadError: '',
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
    schedulePrefillCount: 0,
    statusOptions: STATUS_OPTIONS,
  },

  onLoad(options: Record<string, string>) {
    authorizePage('pages/plan-editor/plan-editor', options, () => this.initializePlanEditor(options))
  },
  initializePlanEditor(options: Record<string, string>) {
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
      this.setData({ loading: true, loadError: '', versions: [] })
      const classroom = this.data.teacherMode
        ? await getTeacherStudentClassroom(this.data.studentId, this.data.stageCode)
        : await getMyClassroom(this.data.stageCode)
      const plan = classroom.plans.find((item) => item.type === this.data.type)
      if (!plan) throw new Error('当前阶段没有该计划')

      const revisionStatus = plan.revisionStatus || (plan.id ? 'approved' : 'none')
      const items = plan.items.map((item) => ({
        name: item.name,
        target: item.target,
        dueDate: item.dueDate ?? null,
        status: item.status,
      }))
      this.setData({
        studentName: this.data.studentName || classroom.student.name,
        title: plan.title,
        items,
        revisionStatus,
        schedulePrefillCount: 0,
      })

      if (!isReadOnly() && !this.data.teacherMode && this.data.type === 'gpa' && items.length === 0 && revisionStatus === 'none') {
        const latestSchedule = await getLatestScheduleImport(this.data.stageCode).catch(() => null)
        const courseNames = Array.from(new Set(
          (latestSchedule?.schedule?.courses ?? [])
            .map((course) => course.name.trim())
            .filter(Boolean),
        ))
        if (courseNames.length > 0) {
          this.setData({
            items: courseNames.map((name) => ({
              name,
              target: '',
              status: 'pending' as const,
            })),
            schedulePrefillCount: courseNames.length,
          })
        }
      }

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
      this.setData({ loadError: friendlyRequestError(error, '计划加载失败，请稍后重试') })
    } finally {
      this.setData({ loading: false })
    }
  },

  onRetryLoad() { void this.loadPlan() },

  onTitleInput(event: WechatMiniprogram.Input) {
    if(isReadOnly())return
    this.setData({ title: event.detail.value })
  },

  onAddItem() {
    if(isReadOnly())return
    if (this.data.items.length >= 50) return
    this.setData({
      items: [
        ...this.data.items,
        { name: '', target: '', status: 'pending' as const },
      ],
    })
  },

  onItemInput(event: WechatMiniprogram.Input) {
    if(isReadOnly())return
    const index = Number(event.currentTarget.dataset.index)
    const field = String(event.currentTarget.dataset.field) as 'name' | 'target'
    const items = [...this.data.items]
    if (!items[index]) return
    items[index] = { ...items[index], [field]: event.detail.value }
    this.setData({ items })
  },

  onStatusChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    if(isReadOnly())return
    const index = Number(event.currentTarget.dataset.index)
    const option = STATUS_OPTIONS[Number(event.detail.value)]
    const items = [...this.data.items]
    if (!items[index] || !option) return
    items[index] = { ...items[index], status: option.value }
    this.setData({ items })
  },

  onDueDateChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    if (isReadOnly() || this.data.saving) return
    const index = Number(event.currentTarget.dataset.index)
    const items = [...this.data.items]
    if (!items[index]) return
    items[index] = { ...items[index], dueDate: event.detail.value }
    this.setData({ items })
  },

  onClearDueDate(event: WechatMiniprogram.BaseEvent) {
    if (isReadOnly() || this.data.saving) return
    const index = Number(event.currentTarget.dataset.index)
    const items = [...this.data.items]
    if (!items[index]) return
    items[index] = { ...items[index], dueDate: null }
    this.setData({ items })
  },

  onRemoveItem(event: WechatMiniprogram.BaseEvent) {
    if(isReadOnly())return
    const index = Number(event.currentTarget.dataset.index)
    const items = [...this.data.items]
    items.splice(index, 1)
    this.setData({ items })
  },

  async onSave() {
    if(isReadOnly())return
    if (this.data.saving) return
    if (this.data.loading || this.data.loadError) {
      wx.showToast({ title: '请先重新读取规划', icon: 'none' })
      return
    }
    const title = this.data.title.trim()
    const items = this.data.items
      .map((item) => ({
        name: item.name.trim(),
        target: item.target?.trim() || null,
        dueDate: item.dueDate || null,
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
        wx.showToast({ title: '计划已保存', icon: 'success' })
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
