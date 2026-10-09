import {
  createScheduleImport,
  friendlyRequestError,
  getLatestScheduleImport,
  updateScheduleImport,
  type ParsedSchedule,
  type ParsedScheduleCourse,
  getMyAcademicProfile,
} from '../../utils/request'
import { uploadAuthenticatedCloudFile } from '../../utils/cloud-upload'
import { authorizePage } from '../../utils/navigation'
import { currentWeekFromStart, weekMatches } from '../../utils/schedule-view'

const MAX_SPREADSHEET_BYTES = 5 * 1024 * 1024
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const DAY_OPTIONS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const TERM_OPTIONS = [
  { code: 'freshman-fall', label: '大一上' }, { code: 'freshman-spring', label: '大一下' },
  { code: 'sophomore-fall', label: '大二上' }, { code: 'sophomore-spring', label: '大二下' },
  { code: 'junior-fall', label: '大三上' }, { code: 'junior-spring', label: '大三下' },
  { code: 'senior-fall', label: '大四上' }, { code: 'senior-spring', label: '大四下' },
]
function hintTerm(enrollmentYear: number | null): string {
  if (!enrollmentYear) return '未填写入学年份，可前往「我的」补充。请自行选择课表归属学期。'
  const china = new Date(Date.now() + 8 * 3600000)
  const year = china.getUTCFullYear(), month = china.getUTCMonth() + 1
  const academicYear = month >= 9 ? year : year - 1
  const level = academicYear - enrollmentYear
  if (level < 0 || level > 3) return '当前日期与入学年份无法形成在读学期，请自行核对。'
  const label = ['大一','大二','大三','大四'][level] + (month >= 9 || month <= 1 ? '上' : '下')
  return '按入学年份粗略推算现在约处于「' + label + '」，但导入课表须由本人确认，系统不会代选。'
}

function sectionRange(value: string) {
  const nums = value.match(/\d+/g)?.map(Number) ?? []
  if (nums.length === 0) return { start: null, end: null }
  return { start: nums[0], end: nums[nums.length - 1] }
}

function emptyDraft(): ParsedScheduleCourse {
  return {
    name: '',
    day: '周一',
    dayIndex: 1,
    slot: '第1-2节',
    startSection: 1,
    endSection: 2,
    time: null,
    location: null,
    teacher: null,
    weeks: null,
    raw: '',
  }
}

Page({
  data: {
    parsing: false,
    saving: false,
    showStagePicker: false,
    stageOptions: TERM_OPTIONS,
    stageChoice: '',
    stageChoiceLabel: '',
    sourceForStage: '' as '' | 'spreadsheet' | 'image',
    stageHint: '正在读取入学年份…',
    fileName: '',
    importId: '',
    schedule: null as ParsedSchedule | null,
    visibleCourses: [] as ParsedScheduleCourse[],
    viewMode: 'current' as 'current' | 'all' | 'manage',
    termStartDate: '',
    currentWeek: 0,
    currentWeekLabel: '未设置学期第一周',
    dayOptions: DAY_OPTIONS,
    editingIndex: -1,
    editing: false,
    courseDraft: emptyDraft(),
  },

  onLoad(options: Record<string, string | undefined>) {
    authorizePage('pages/schedule-import/schedule-import', options, () => this.initializeSchedule(options))
  },
  initializeSchedule(options: Record<string, string | undefined>) {
    const requested = options.view === 'manage' ? 'manage' : 'current'
    this.setData({ viewMode: requested })
    void this.loadLatestSchedule()
    void getMyAcademicProfile()
      .then(profile => this.setData({ stageHint: hintTerm(profile.enrollmentYear) }))
      .catch(() => this.setData({ stageHint: '入学年份尚未读取；导入前仍须本人确认归属学期。' }))
  },

  async loadLatestSchedule() {
    try {
      const latest = await getLatestScheduleImport()
      if (!latest?.schedule) return

      const schedule = latest.schedule
      this.setData({
        importId: latest.id,
        fileName: latest.fileName,
        schedule,
        termStartDate: schedule.termStartDate || '',
        stageChoice: schedule.stageCode || '',
        stageChoiceLabel: TERM_OPTIONS.find(stage => stage.code === schedule.stageCode)?.label || '未归档的旧课表',
      })
      this.refreshVisibleCourses()
    } catch (error) {
      console.info('Latest schedule unavailable.', error)
    }
  },

  refreshVisibleCourses() {
    const schedule = this.data.schedule
    if (!schedule) {
      this.setData({
        visibleCourses: [],
        currentWeek: 0,
        currentWeekLabel: '未导入课表',
      })
      return
    }

    const currentWeek = currentWeekFromStart(schedule.termStartDate)
    const viewMode = this.data.viewMode
    const visibleCourses =
      viewMode === 'current' && currentWeek > 0
        ? schedule.courses.filter((course) => weekMatches(course.weeks, currentWeek))
        : viewMode === 'current'
          ? []
          : schedule.courses

    this.setData({
      visibleCourses,
      currentWeek,
      currentWeekLabel:
        currentWeek > 0
          ? `第 ${currentWeek} 周`
          : '请先设置本学期第一周周一',
    })
  },

  onViewModeTap(event: WechatMiniprogram.BaseEvent) {
    const mode = String(event.currentTarget.dataset.mode || '') as
      | 'current'
      | 'all'
      | 'manage'
    if (!['current', 'all', 'manage'].includes(mode)) return
    this.setData({ viewMode: mode }, () => this.refreshVisibleCourses())
  },

  onChooseSpreadsheet() { this.openStageSelection('spreadsheet') },
  onChooseImage() { this.openStageSelection('image') },
  openStageSelection(source: 'spreadsheet' | 'image') {
    this.setData({ showStagePicker: true, sourceForStage: source, stageChoice: '', stageChoiceLabel: '' })
  },
  onSelectStage(event: WechatMiniprogram.BaseEvent) {
    const code = String(event.currentTarget.dataset.code)
    const found = TERM_OPTIONS.find(stage => stage.code === code)
    if (found) this.setData({ stageChoice: found.code, stageChoiceLabel: found.label })
  },
  onDismissStage() {
    this.setData({ showStagePicker: false, sourceForStage: '', stageChoice: '' })
  },
  onConfirmStage() {
    if (!this.data.stageChoice) {
      wx.showToast({ title: '请先选择课表归属学期', icon: 'none' })
      return
    }
    const source = this.data.sourceForStage
    this.setData({ showStagePicker: false })
    if (source === 'spreadsheet') this.chooseSpreadsheetFile()
    else if (source === 'image') this.chooseImageFile()
  },
  chooseSpreadsheetFile() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['xlsx', 'xls', 'csv'],
      success: (result) => {
        const file = result.tempFiles[0]
        if (!file) return
        void this.uploadAndParse(
          file.path,
          file.name || 'schedule.xlsx',
          'spreadsheet',
          file.size ?? 0,
        )
      },
    })
  },

  chooseImageFile() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (result) => {
        const file = result.tempFiles[0]
        if (!file) return
        const extension = file.tempFilePath.toLowerCase().includes('.png') ? 'png' : 'jpg'
        void this.uploadAndParse(
          file.tempFilePath,
          `schedule.${extension}`,
          'image',
          file.size ?? 0,
        )
      },
    })
  },

  async uploadAndParse(
    filePath: string,
    fileName: string,
    sourceType: 'spreadsheet' | 'image',
    fileSize = 0,
  ) {
    try {
      const selectedStage = this.data.stageChoice
      if (!TERM_OPTIONS.some(stage => stage.code === selectedStage))
        throw new Error('请先确认课表归属学期')
      const maxBytes = sourceType === 'image' ? MAX_IMAGE_BYTES : MAX_SPREADSHEET_BYTES
      if (fileSize > maxBytes) {
        throw new Error(sourceType === 'image' ? '图片不能超过 5MB' : '课表文件不能超过 5MB')
      }

      this.setData({
        parsing: true,
        fileName,
        schedule: null,
        visibleCourses: [],
      })

      const fileID = await uploadAuthenticatedCloudFile({ namespace: 'schedule-imports', filePath, fileName })
      const result = await createScheduleImport({ fileID, fileName, sourceType, stageCode: selectedStage })
      const schedule = result.schedule

      this.setData({
        importId: result.importId,
        schedule,
        termStartDate: schedule.termStartDate || '',
        viewMode: 'manage',
        stageChoice: selectedStage,
        stageChoiceLabel: TERM_OPTIONS.find(stage => stage.code === selectedStage)?.label || '',
      })
      this.refreshVisibleCourses()

      if (result.fallbackReason) {
        wx.showModal({
          title: '已进入手动校正模式',
          content: schedule.warnings[0] || '自动解析未完成，你可以直接新增和编辑课程。',
          showCancel: false,
        })
      } else {
        wx.showToast({
          title: `识别到 ${schedule.courses.length} 门课程`,
          icon: 'success',
        })
      }
    } catch (error) {
      wx.showModal({
        title: '课表导入失败',
        content: friendlyRequestError(error, '请检查文件格式、网络与课表布局后重试'),
        showCancel: false,
      })
    } finally {
      this.setData({ parsing: false })
    }
  },

  async persistSchedule(schedule: ParsedSchedule) {
    if (!this.data.importId) {
      wx.showToast({ title: '请先导入一个课表', icon: 'none' })
      return false
    }
    if (!TERM_OPTIONS.some(stage => stage.code === schedule.stageCode)) {
      this.openStageSelection('spreadsheet')
      wx.showToast({ title: '旧课表需重新确认归属学期', icon: 'none' })
      return false
    }

    try {
      this.setData({ saving: true })
      const persisted = await updateScheduleImport(this.data.importId, schedule)
      this.setData({
        schedule: persisted,
        termStartDate: persisted.termStartDate || '',
      })
      this.refreshVisibleCourses()
      return true
    } catch (error) {
      wx.showToast({
        title: friendlyRequestError(error, '课表保存失败'),
        icon: 'none',
      })
      return false
    } finally {
      this.setData({ saving: false })
    }
  },

  onTermStartChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const termStartDate = event.detail.value
    const schedule = this.data.schedule
    if (!schedule) return

    const next: ParsedSchedule = {
      ...schedule,
      termStartDate,
    }
    this.setData({ termStartDate })
    void this.persistSchedule(next)
  },

  onAddCourse() {
    if (!this.data.schedule) {
      wx.showToast({ title: '请先导入课表，再手动补录', icon: 'none' })
      return
    }
    this.setData({
      editing: true,
      editingIndex: -1,
      courseDraft: emptyDraft(),
    })
  },

  onEditCourse(event: WechatMiniprogram.BaseEvent) {
    const index = Number(event.currentTarget.dataset.index)
    const course = this.data.schedule?.courses[index]
    if (!course) return

    this.setData({
      editing: true,
      editingIndex: index,
      courseDraft: { ...course },
    })
  },

  onDraftName(event: WechatMiniprogram.Input) {
    this.setData({ 'courseDraft.name': event.detail.value })
  },

  onDraftDay(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const dayIndex = Number(event.detail.value) + 1
    this.setData({
      'courseDraft.dayIndex': dayIndex,
      'courseDraft.day': DAY_OPTIONS[dayIndex - 1],
    })
  },

  onDraftSlot(event: WechatMiniprogram.Input) {
    const slot = event.detail.value
    const sections = sectionRange(slot)
    this.setData({
      'courseDraft.slot': slot,
      'courseDraft.startSection': sections.start,
      'courseDraft.endSection': sections.end,
    })
  },

  onDraftLocation(event: WechatMiniprogram.Input) {
    this.setData({ 'courseDraft.location': event.detail.value || null })
  },

  onDraftTeacher(event: WechatMiniprogram.Input) {
    this.setData({ 'courseDraft.teacher': event.detail.value || null })
  },

  onDraftWeeks(event: WechatMiniprogram.Input) {
    this.setData({ 'courseDraft.weeks': event.detail.value || null })
  },

  onCancelEdit() {
    this.setData({
      editing: false,
      editingIndex: -1,
      courseDraft: emptyDraft(),
    })
  },

  async onSaveCourse() {
    const schedule = this.data.schedule
    if (!schedule) return

    const draft = this.data.courseDraft
    if (!draft.name.trim() || !draft.slot.trim()) {
      wx.showToast({ title: '请填写课程名和节次', icon: 'none' })
      return
    }

    const normalized: ParsedScheduleCourse = {
      ...draft,
      name: draft.name.trim(),
      slot: draft.slot.trim(),
      location: draft.location?.trim() || null,
      teacher: draft.teacher?.trim() || null,
      weeks: draft.weeks?.trim() || null,
      raw: draft.raw || draft.name.trim(),
    }

    const courses = [...schedule.courses]
    if (this.data.editingIndex >= 0) {
      courses[this.data.editingIndex] = normalized
    } else {
      courses.push(normalized)
    }

    const ok = await this.persistSchedule({
      ...schedule,
      courses,
      warnings: schedule.warnings.filter((item) => !item.includes('手动')),
    })

    if (ok) {
      this.onCancelEdit()
      wx.showToast({ title: '课表已保存', icon: 'success' })
    }
  },

  onDeleteCourse(event: WechatMiniprogram.BaseEvent) {
    const index = Number(event.currentTarget.dataset.index)
    const schedule = this.data.schedule
    const course = schedule?.courses[index]
    if (!schedule || !course) return

    wx.showModal({
      title: '删除课程',
      content: `确定删除“${course.name}”吗？这项临时课表修改不需要老师审核。`,
      confirmColor: '#c2413d',
      success: async (result) => {
        if (!result.confirm) return
        const courses = schedule.courses.filter((_, itemIndex) => itemIndex !== index)
        const ok = await this.persistSchedule({ ...schedule, courses })
        if (ok) wx.showToast({ title: '课程已删除', icon: 'none' })
      },
    })
  },
})
