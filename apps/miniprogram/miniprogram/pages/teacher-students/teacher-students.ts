import { authorizePage } from '../../utils/navigation'
import {isReadOnly} from '../../utils/read-only-context'
import {
  getTeacherStudents,
  getTeacherAiCosts,
  getTeacherTodos, saveTeacherTodo, deleteTeacherTodo, getTeacherStudentSummary, friendlyRequestError,
  type ClassroomPlanType,
  type TeacherStudent,
  type TeacherAiCosts,
  type TeacherTodo,
  type TeacherStudentSummary,
} from '../../utils/request'

function planTypesForStage(stage: string | null): ClassroomPlanType[] {
  if (!stage) return ['gpa', 'english', 'competition', 'research', 'custom']
  if (stage.startsWith('senior-')) return ['internship', 'custom']
  if (stage === 'junior-summer') return ['custom']
  if (stage.includes('winter') || stage.includes('summer')) return ['english', 'competition', 'custom']
  return ['gpa', 'english', 'competition', 'research', 'custom']
}

const LABELS: Record<ClassroomPlanType, string> = {
  gpa: '课程成绩',
  english: '英语',
  competition: '竞赛',
  research: '科研',
  internship: '实习',
  custom: '自定义规划',
}
const STAGES = [
  ['freshman-fall','大一上'],['freshman-winter','大一寒假'],['freshman-spring','大一下'],['freshman-summer','大一暑假'],
  ['sophomore-fall','大二上'],['sophomore-winter','大二寒假'],['sophomore-spring','大二下'],['sophomore-summer','大二暑假'],
  ['junior-fall','大三上'],['junior-winter','大三寒假'],['junior-spring','大三下'],['junior-summer','大三暑假'],
  ['senior-fall','大四上'],['senior-winter','大四寒假'],['senior-spring','大四下'],
]

Page({
  data: {
    loading: true,
    loadError: '',
    students: [] as TeacherStudent[],
    aiCosts:null as TeacherAiCosts|null,
    aiCostsNotice:'',
    readOnly: false, todos: [] as TeacherTodo[], todoError: '', todoTitle: '', todoDescription: '', todoDate: '', todoEditingId: '', todoSaving: false,
    selectedStudentIndex: -1, selectedStageIndex: -1, stageLabels: STAGES.map(stage => stage[1]),
    summaryStudentId: '', studentSummary: null as TeacherStudentSummary | null, studentSummaryError: '', studentSummaryLoading: false,
  },

  workspaceEpoch: 0,
  onShow() {
    ++this.workspaceEpoch
    authorizePage('pages/teacher-students/teacher-students', {}, () => { void this.loadData() })
  },
  onHide() {
    ++this.workspaceEpoch
    this.setData({ students: [], todos: [], aiCosts: null, aiCostsNotice: '', todoError: '', studentSummary: null, summaryStudentId: '', todoTitle: '', todoDescription: '', todoDate: '', todoEditingId: '' })
  },

  async loadData() {
    const epoch = this.workspaceEpoch
    try {
      this.setData({ loading: true, loadError: '', students: [], aiCosts: null, aiCostsNotice: '', readOnly: isReadOnly(), selectedStudentIndex: -1, selectedStageIndex: -1 })
      void this.loadTodos()
      const [students, costResult] = await Promise.all([
        getTeacherStudents(),
        getTeacherAiCosts().then(value=>({value})).catch(()=>({value:null})),
      ])
      if (epoch !== this.workspaceEpoch) return
      this.setData({ students, aiCosts:costResult.value,
        aiCostsNotice:costResult.value?'':'AI 请求摘要暂不可用；学员名单仍可查看，请稍后重试。' })
    } catch (error) {
      if (epoch === this.workspaceEpoch) this.setData({ loadError: '学员名单暂时无法读取，请重试。' })
    } finally {
      if (epoch === this.workspaceEpoch) this.setData({ loading: false })
    }
  },
  async loadTodos() {
    const epoch = this.workspaceEpoch
    try { const todos = await getTeacherTodos(); if (epoch === this.workspaceEpoch) this.setData({ todos, todoError: '' }) }
    catch (error) { if (epoch === this.workspaceEpoch) this.setData({ todoError: friendlyRequestError(error, '个人待办暂时无法读取，请重试') }) }
  },
  onTodoInput(event: WechatMiniprogram.Input) {
    const field = String(event.currentTarget.dataset.field)
    if (field === 'todoTitle' || field === 'todoDescription') this.setData({ [field]: event.detail.value })
  },
  onTodoDate(event: WechatMiniprogram.PickerChange) { this.setData({ todoDate: String(event.detail.value) }) },
  onTodoClearDate() { this.setData({ todoDate: '' }) },
  onTodoEdit(event: WechatMiniprogram.BaseEvent) {
    const todo = this.data.todos.find(item => item.id === event.currentTarget.dataset.id)
    if (todo && !isReadOnly()) this.setData({ todoEditingId: todo.id, todoTitle: todo.title, todoDescription: todo.description || '', todoDate: todo.dueDate || '' })
  },
  onTodoCancel() { this.setData({ todoEditingId: '', todoTitle: '', todoDescription: '', todoDate: '' }) },
  async onTodoSave() {
    if (isReadOnly() || this.data.todoSaving) return
    const epoch = this.workspaceEpoch
    if (!this.data.todoTitle.trim()) { wx.showToast({ title: '请填写待办标题', icon: 'none' }); return }
    this.setData({ todoSaving: true })
    try {
      const current = this.data.todos.find(item => item.id === this.data.todoEditingId)
      await saveTeacherTodo(this.data.todoEditingId, { title: this.data.todoTitle.trim(), description: this.data.todoDescription.trim() || null,
        dueDate: this.data.todoDate || null, status: current?.status || 'pending' })
      if (epoch !== this.workspaceEpoch) return
      this.onTodoCancel(); await this.loadTodos()
    } catch (error) { wx.showToast({ title: friendlyRequestError(error, '保存待办失败，请重试'), icon: 'none' }) }
    finally { this.setData({ todoSaving: false }) }
  },
  async onTodoToggle(event: WechatMiniprogram.BaseEvent) {
    const todo = this.data.todos.find(item => item.id === event.currentTarget.dataset.id)
    if (!todo || isReadOnly() || this.data.todoSaving) return
    const epoch = this.workspaceEpoch
    this.setData({ todoSaving: true })
    try { await saveTeacherTodo(todo.id, { title: todo.title, description: todo.description, dueDate: todo.dueDate, status: todo.status === 'done' ? 'pending' : 'done' }); if (epoch === this.workspaceEpoch) await this.loadTodos() }
    catch (error) { wx.showToast({ title: friendlyRequestError(error, '更新待办失败'), icon: 'none' }) }
    finally { this.setData({ todoSaving: false }) }
  },
  onTodoDelete(event: WechatMiniprogram.BaseEvent) {
    const id = String(event.currentTarget.dataset.id || '')
    if (!id || isReadOnly() || this.data.todoSaving) return
    const epoch = this.workspaceEpoch
    wx.showModal({ title: '删除待办', content: '确认删除这条个人待办？', success: result => {
      if (!result.confirm || epoch !== this.workspaceEpoch) return
      this.setData({ todoSaving: true })
      void deleteTeacherTodo(id).then(() => epoch === this.workspaceEpoch ? this.loadTodos() : undefined).catch(error => wx.showToast({ title: friendlyRequestError(error, '删除失败，请重试'), icon: 'none' })).finally(() => this.setData({ todoSaving: false }))
    } })
  },
  onStudentSelect(event: WechatMiniprogram.PickerChange) { this.setData({ selectedStudentIndex: Number(event.detail.value) }) },
  onStageSelect(event: WechatMiniprogram.PickerChange) { this.setData({ selectedStageIndex: Number(event.detail.value) }) },
  async onStudentSummary(event: WechatMiniprogram.BaseEvent) {
    const id = String(event.currentTarget.dataset.id || '')
    if (!id) return
    this.setData({ summaryStudentId: id, studentSummary: null, studentSummaryError: '', studentSummaryLoading: true })
    try { const summary = await getTeacherStudentSummary(id); if (this.data.summaryStudentId === id) this.setData({ studentSummary: summary }) }
    catch (error) { if (this.data.summaryStudentId === id) this.setData({ studentSummaryError: friendlyRequestError(error, '学员统计暂不可读取，请重试') }) }
    finally { if (this.data.summaryStudentId === id) this.setData({ studentSummaryLoading: false }) }
  },
  onNewStudentPlan() {
    if (isReadOnly()) return
    const student = this.data.students[this.data.selectedStudentIndex], stage = STAGES[this.data.selectedStageIndex]?.[0]
    if (!student || !stage) { wx.showToast({ title: '请选择学员和规划阶段', icon: 'none' }); return }
    const types = planTypesForStage(stage)
    if (!types.length) { wx.showToast({ title: '该阶段暂未配置计划类型', icon: 'none' }); return }
    wx.showActionSheet({ itemList: types.map(type => LABELS[type]), success: picked => {
      const type = types[picked.tapIndex]
      if (type) wx.navigateTo({ url: `/pages/plan-editor/plan-editor?studentId=${encodeURIComponent(student.studentId)}&studentName=${encodeURIComponent(student.name)}&stage=${encodeURIComponent(stage)}&type=${encodeURIComponent(type)}` })
    } })
  },

  onStudentTap(event: WechatMiniprogram.BaseEvent) {
    const index = Number(event.currentTarget.dataset.index)
    const student = this.data.students[index]
    if (!student) return
    wx.navigateTo({
      url: '/packages/read-only/view/view?kind=student&id=' + encodeURIComponent(student.studentId),
    })
  },
  onEditStudentPlan(event: WechatMiniprogram.BaseEvent) {
    if(isReadOnly())return
    const index = Number(event.currentTarget.dataset.index)
    const student = this.data.students[index]
    if (!student) return
    const stage = student.assignedStageCode || student.currentStage
    if (!stage) { wx.showToast({ title: '请在新增规划中选择阶段', icon: 'none' }); return }
    const types = planTypesForStage(stage)
    if (types.length === 0) {
      wx.showToast({ title: '该阶段暂未配置计划类型', icon: 'none' })
      return
    }

    wx.showActionSheet({
      itemList: types.map((type) => LABELS[type]),
      success: (result) => {
        const type = types[result.tapIndex]
        if (!type) return
        wx.navigateTo({
          url: `/pages/plan-editor/plan-editor?studentId=${encodeURIComponent(student.studentId)}&studentName=${encodeURIComponent(student.name)}&stage=${encodeURIComponent(stage)}&type=${encodeURIComponent(type)}`,
        })
      },
    })
  },
})
