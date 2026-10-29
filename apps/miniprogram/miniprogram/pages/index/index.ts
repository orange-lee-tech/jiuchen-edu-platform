import { INITIAL_SHELL, loginFor, observeSlot, openPage, openSlot, shellView } from '../../utils/navigation'
import { openVerifiedWechatCustomerService } from '../../utils/customer-service'
import { getLatestScheduleImport, getMyAcademicProfile, getMyClassroom, type ParsedSchedule } from '../../utils/request'
import { courseTimeLabel, dailyScheduleView } from '../../utils/schedule-view'
import { resolveCurrentStage } from '../../utils/current-stage'

const STAGE_NAMES: Record<string, string> = {
  'freshman-fall':'大一上','freshman-winter':'大一寒假','freshman-spring':'大一下','freshman-summer':'大一暑假',
  'sophomore-fall':'大二上','sophomore-winter':'大二寒假','sophomore-spring':'大二下','sophomore-summer':'大二暑假',
  'junior-fall':'大三上','junior-winter':'大三寒假','junior-spring':'大三下','junior-summer':'大三暑假',
  'senior-fall':'大四上','senior-winter':'大四寒假','senior-spring':'大四下',
}
const TERM_STAGE = /^(freshman|sophomore|junior|senior)-(fall|spring)$/

function courseStartMinutes(value: string | null) {
  const match = value?.match(/(?:^|\s)(\d{1,2}):(\d{2})/)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}


type CountdownEntry = { id: string; title: string; date: string }
type CountdownView = CountdownEntry & { remainingDays: number; dateValid: boolean; remainingLabel: string }
const COUNTDOWN_PREFIX = 'jiuchen-countdowns-v1:'
function dateText(value: Date) {
  const n = (v: number) => String(v).padStart(2, '0')
  return `${value.getFullYear()}-${n(value.getMonth() + 1)}-${n(value.getDate())}`
}
function daysUntil(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const [year, month, day] = date.split('-').map(Number)
  const target = new Date(year, month - 1, day)
  if (target.getFullYear() !== year || target.getMonth() !== month - 1 || target.getDate() !== day) return null
  const now = new Date()
  return Math.round((target.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000)
}

Page({
  data: { ...INITIAL_SHELL, loggedIn: false, assessmentReady: false,
    todayLabel: '', greeting: '你好', userName: '同学', scheduleDay: 0 as 0 | 1, scheduleDateLabel: '',
    scheduleLoading: false, scheduleError: '', scheduleState: 'missing', scheduleLabel: '', scheduleStage: '',
    scheduleCourses: [] as Array<{time:string;name:string;location:string;next:boolean}>,
    planLoading: false, planError: '', planState: 'unbound', planStageLabel: '', stageNotice: '',
    stageConfirmed: false, stageNeedsEnrollmentYear: false,
    planPreview: [] as Array<{title:string;status:string}>,
    countdowns: [] as CountdownView[], countdownPreview: [] as CountdownView[], countdownOpen: false,
    countdownTitle: '', countdownDate: dateText(new Date()), countdownEditingId: '', countdownPickerStart: dateText(new Date()),
    countdownToday: dateText(new Date()), countdownSaving: false, countdownEntryCount: 0,
  },
  homeEpoch: 0,
  countdownOwner: '',
  countdownKey() { return COUNTDOWN_PREFIX + this.countdownOwner },
  loadCountdowns(owner: string | null) {
    const nextOwner = owner || ''
    if (!nextOwner) {
      this.countdownOwner = ''
      this.setData({countdowns:[],countdownPreview:[],countdownOpen:false,countdownTitle:'',countdownEditingId:'',countdownEntryCount:0})
      return
    }
    if (nextOwner !== this.countdownOwner) this.setData({countdownOpen:false,countdownTitle:''})
    this.countdownOwner = nextOwner
    let entries: CountdownEntry[] = []
    try {
      const stored: unknown = wx.getStorageSync(this.countdownKey())
      if (Array.isArray(stored)) entries = stored.filter((e):e is CountdownEntry =>
        Boolean(e && typeof e === 'object' && typeof e.id === 'string' &&
          typeof e.title === 'string' && typeof e.date === 'string'))
    } catch { /* A storage error must not block the home workbench. */ }
    const active: CountdownView[] = entries.map(e=>{
      const days=daysUntil(e.date)
      return {...e, dateValid:days!==null, remainingDays:days ?? 0,
        remainingLabel:days===null?'日期需修正':days<0?`已过期 ${Math.abs(days)} 天`:days===0?'就是今天':`还剩 ${days} 天`}
    }).sort((a,b)=>{
      if(a.dateValid!==b.dateValid)return a.dateValid?-1:1
      if(!a.dateValid)return a.title.localeCompare(b.title)
      const aExpired=a.remainingDays<0,bExpired=b.remainingDays<0
      if(aExpired!==bExpired)return aExpired?1:-1
      return aExpired ? b.remainingDays-a.remainingDays : a.remainingDays-b.remainingDays
    })
    this.setData({countdowns:active,countdownPreview:active.slice(0,3),countdownToday:dateText(new Date()),countdownEntryCount:entries.length})
  },
  onCountdownToggle() {
    if (!this.countdownOwner) { wx.showToast({title:'登录学员身份后可设置',icon:'none'}); return }
    const opening = !this.data.countdownOpen
    this.setData({
      countdownOpen: opening, countdownTitle: '', countdownDate: dateText(new Date()), countdownPickerStart: dateText(new Date()), countdownEditingId: '',
    }, () => {
      // Editor is below the shortcut grid: without scrolling the tap looks unresponsive.
      if (opening) wx.pageScrollTo({selector:'.countdown-panel',duration:220,
        fail:()=>wx.showToast({title:'请向下查看倒数日',icon:'none'})})
    })
  },
  onCountdownTitleInput(event:WechatMiniprogram.Input) {
    this.setData({countdownTitle:String(event.detail.value||'')})
  },
  onCountdownDateChange(event:WechatMiniprogram.CustomEvent<{value:string}>) {
    this.setData({countdownDate:String(event.detail.value||'')})
  },
  onCountdownEdit(event:WechatMiniprogram.BaseEvent) {
    const id = String(event.currentTarget.dataset.id || '')
    const entry = this.data.countdowns.find(item => item.id === id)
    if (!entry || !this.countdownOwner) return
    this.setData({ countdownOpen:true, countdownEditingId:id, countdownTitle:entry.title, countdownDate:entry.dateValid ? entry.date : dateText(new Date()), countdownPickerStart:entry.dateValid && entry.remainingDays < 0 ? entry.date : dateText(new Date()) }, () => {
      wx.pageScrollTo({selector:'.countdown-panel',duration:220})
    })
  },
  onCountdownCancelEdit() {
    this.setData({ countdownEditingId:'', countdownTitle:'', countdownDate:dateText(new Date()), countdownPickerStart:dateText(new Date()) })
  },
  onCountdownSave() {
    if (!this.countdownOwner || this.data.countdownSaving) return
    const title=this.data.countdownTitle.trim()
    const date=this.data.countdownDate
    const editingId=this.data.countdownEditingId
    const days=daysUntil(date)
    const existing=this.data.countdowns.find(entry=>entry.id===editingId)
    const existingDays=existing ? daysUntil(existing.date) : null
    if (!title || title.length>24 || days===null || (days<0 && !(existing && existingDays!==null && existingDays<0))) {
      wx.showToast({title:'填写事件名称和有效日期',icon:'none'});return
    }
    if (!editingId && this.data.countdownEntryCount>=8) {
      wx.showToast({title:'最多设置8个倒数日',icon:'none'});return
    }
    this.setData({countdownSaving:true})
    try {
      const stored: unknown = wx.getStorageSync(this.countdownKey())
      let entries: unknown[] = Array.isArray(stored) ? stored.slice() : []
      if (editingId) {
        if (!entries.some(entry => Boolean(entry && typeof entry === 'object' && (entry as {id?:unknown}).id === editingId))) {
          wx.showToast({title:'找不到这条倒数日，请刷新后重试',icon:'none'})
          return
        }
        entries = entries.map(entry => entry && typeof entry === 'object' && (entry as {id?:unknown}).id === editingId ? {id:editingId,title,date} : entry)
      } else {
        entries = [...entries, {id:String(Date.now())+'-'+Math.random().toString(36).slice(2,8),title,date}]
      }
      wx.setStorageSync(this.countdownKey(),entries)
      this.loadCountdowns(this.countdownOwner)
      this.setData({countdownTitle:'',countdownOpen:false,countdownEditingId:'',countdownDate:dateText(new Date()),countdownPickerStart:dateText(new Date())})
      wx.showToast({title:editingId?'倒数日已更新':'倒数日已保存到本机',icon:'success'})
    } catch { wx.showToast({title:'本机保存失败，请重试',icon:'none'}) }
    finally { this.setData({countdownSaving:false}) }
  },
  onCountdownDelete(event:WechatMiniprogram.BaseEvent) {
    const id=String(event.currentTarget.dataset.id||'')
    if (!this.countdownOwner || !this.data.countdowns.some(e=>e.id===id)) return
    const owner=this.countdownOwner
    wx.showModal({title:'删除倒数日',content:'确定删除这个倒数日吗？',
      success:result=>{
        if (!result.confirm || this.countdownOwner !== owner || !this.data.countdowns.some(e=>e.id===id)) return
        try {
          const stored: unknown = wx.getStorageSync(this.countdownKey())
          const entries = Array.isArray(stored) ? stored.filter(entry => {
            if (!entry || typeof entry !== 'object') return true
            return !('id' in entry) || (entry as {id?:unknown}).id !== id
          }) : []
          wx.setStorageSync(this.countdownKey(),entries)
          this.loadCountdowns(this.countdownOwner)
          wx.showToast({title:'倒数日已删除',icon:'success'})
          if (this.data.countdownEditingId === id) this.setData({countdownEditingId:'',countdownTitle:'',countdownDate:dateText(new Date()),countdownPickerStart:dateText(new Date())})
        } catch { wx.showToast({title:'删除失败，请重试',icon:'none'}) }
      },
    })
  },
  currentHomeStudentId: null as string | null,
  homeSchedule: null as ParsedSchedule | null,
  stopShell: undefined as (() => void) | undefined,
  onShow() {
    this.stopShell?.()
    const epoch = ++this.homeEpoch
    this.homeSchedule = null
    const today = dailyScheduleView(null, 0)
    const hour = (new Date().getUTCHours() + 8) % 24
    this.setData({ todayLabel: today.dateLabel, greeting: hour < 11 ? '早上好' : hour < 18 ? '下午好' : '晚上好', scheduleDay: 0, scheduleDateLabel: today.dateLabel, stageConfirmed:false, stageNeedsEnrollmentYear:false })
    this.stopShell = observeSlot('home', (state) => {
      const studentId = state.phase === 'ready' && state.auth?.user.role === 'student'
        ? state.auth.user.id : null
      this.currentHomeStudentId = studentId
      this.loadCountdowns(studentId)
      this.setData({ ...shellView(state), loggedIn: Boolean(state.auth), userName: state.auth?.user.displayName || '同学', assessmentReady: false })
      if (!studentId) { this.homeSchedule = null; this.setData({ planLoading: false, planError: '', planState: 'unbound', planPreview: [], stageNotice: '', stageConfirmed:false, stageNeedsEnrollmentYear:false, scheduleLoading: false, scheduleError: '', scheduleStage: '', scheduleCourses: [], scheduleState: 'missing' }); return }
      this.setData({ scheduleLoading: true, scheduleError: '', scheduleStage: '', scheduleCourses: [], planLoading: true, planError: '', planPreview: [], stageNotice: '' })
      void (async () => {
        const resolution = await resolveCurrentStage().catch(() => null)
        if (epoch !== this.homeEpoch || studentId !== this.currentHomeStudentId) return null
        const view = await getMyClassroom(resolution?.stage || undefined)
        return { view, resolution }
      })().then(result => {
        if (!result) return
        if (epoch !== this.homeEpoch || studentId !== this.currentHomeStudentId) return
        const { view, resolution } = result
        const stageCode = view.stage.code
        const stageChanged = Boolean(resolution && view.student.currentStage !== resolution.stage)
        const stageConfirmed = Boolean(resolution?.scheduleSafe && !stageChanged)
        this.setData({ planLoading: false, planState: 'ready', stageConfirmed,
          stageNeedsEnrollmentYear: Boolean(resolution && !resolution.suggested),
          stageNotice: stageChanged ? '档案阶段刚刚变化，请重新确认。' : resolution ? resolution.notice : '自动定位暂不可用，可直接手动校准当前学期。',
          planStageLabel: STAGE_NAMES[stageCode] || '档案当前阶段待确认',
          planPreview: view.plans.slice(0, 4).map(plan => ({ title: plan.title,
            status: plan.revisionStatus === 'pending' ? '旧版草稿未生效' : plan.id ? '已保存' : '未建立，查看规划' })) })
        if (!resolution?.scheduleSafe || stageChanged) {
          this.homeSchedule = null
          this.setData({ scheduleLoading: false, scheduleError: '当前学期尚未确认；校准后即可查看课表', scheduleStage: '', scheduleCourses: [] })
          return
        }
        if (!TERM_STAGE.test(stageCode)) {
          this.homeSchedule = null
          this.setData({ scheduleLoading: false, scheduleState: 'holiday',
            scheduleStage: STAGE_NAMES[stageCode] || '当前阶段', scheduleCourses: [] })
          return
        }
        void getLatestScheduleImport(stageCode).then(latest => {
          if (epoch !== this.homeEpoch || studentId !== this.currentHomeStudentId) return
          if (latest?.schedule && latest.schedule.stageCode !== stageCode) {
            this.setData({ scheduleLoading: false, scheduleError: '课表阶段与档案不一致，请在规划页核对' })
            return
          }
          this.homeSchedule = latest?.schedule || null
          this.setData({ scheduleLoading: false, scheduleStage: STAGE_NAMES[stageCode] || '当前学期' })
          this.renderScheduleDay()
        }).catch(() => {
          if (epoch === this.homeEpoch && studentId === this.currentHomeStudentId)
            this.setData({ scheduleLoading: false, scheduleError: '课表读取失败，请检查网络后重试' })
        })
      }).catch(() => {
        if (epoch === this.homeEpoch && studentId === this.currentHomeStudentId)
          this.setData({ planLoading: false, planError: '请完善入学年份或进入规划页核对当前学期',
            scheduleLoading: false, scheduleError: '无法确认档案学期，请进入规划页重试' })
      })
      void getMyAcademicProfile().then(profile => {
        if (epoch !== this.homeEpoch || studentId !== this.currentHomeStudentId ||
          this.data.shellPhase !== 'ready') return
        // A bound student with the minimum required canonical academic identity.
        const ready = Boolean(profile.university?.trim() && profile.major?.trim() && profile.currentGrade?.trim())
        this.setData({ assessmentReady: ready })
      }).catch(() => {
        // Fail closed: never show a completed-profile CTA from a stale client cache.
        if (epoch === this.homeEpoch && studentId === this.currentHomeStudentId)
          this.setData({ assessmentReady: false })
      })
    })
  },
  renderScheduleDay() {
    const view = dailyScheduleView(this.homeSchedule, this.data.scheduleDay)
    const now = new Date()
    const chinaMinutes = ((now.getUTCHours() + 8) % 24) * 60 + now.getUTCMinutes()
    const nextIndex = view.courses.findIndex(course => {
      const start = courseStartMinutes(course.time || course.slot)
      return this.data.scheduleDay === 1 || (start !== null && start >= chinaMinutes)
    })
    this.setData({ scheduleState: view.state, scheduleDateLabel: view.dateLabel,
      scheduleLabel: view.week ? `第 ${view.week} 周` : '',
      scheduleCourses: view.courses.map((course, index) => ({
        time: courseTimeLabel(course), name: course.name, location: course.location || '待确认', next: index === nextIndex,
      })) })
  },
  onScheduleDay(event: WechatMiniprogram.BaseEvent) {
    const day = Number(event.currentTarget.dataset.day)
    if (day !== 0 && day !== 1) return
    this.setData({ scheduleDay: day as 0 | 1 })
    if (this.data.scheduleState === 'holiday') {
      this.setData({ scheduleDateLabel: dailyScheduleView(null, day as 0 | 1).dateLabel })
      return
    }
    this.renderScheduleDay()
  },
  onHide() { ++this.homeEpoch; this.currentHomeStudentId = null; this.countdownOwner = ''; this.homeSchedule = null; this.stopShell?.(); this.setData({ shellPhase: 'loading', assessmentReady: false, scheduleCourses: [], planPreview: [], countdowns: [], countdownPreview: [], countdownOpen: false, countdownEditingId: '' }) },
  onUnload() { ++this.homeEpoch; this.stopShell?.() },
  onPrimary() {
    // The daily workflow starts with the plan, not another AI request.
    // Public visitor still enters the planning shell and can bind an account there.
    openSlot('plan')
  },
  onCompleteProfile() {
    if(this.data.loggedIn)openPage('/pages/profile-edit/profile-edit')
    else loginFor('pages/profile-edit/profile-edit')
  },
  onAssessment() { openPage('/pages/position/position') },
  onPlanning() { openSlot('plan') },
  onSchools() { openPage('/packages/schools/directory/directory') },
  onNews() { openSlot('opportunity') },
  onProducts() { openPage('/pages/products/products') },
  onBrand() { openPage('/pages/brand/brand') },
  onWebsite() { (this.selectComponent('#website-dialog') as { open?: () => void } | null)?.open?.() },
  onCustomerService() { void openVerifiedWechatCustomerService('保研规划咨询') },
})
