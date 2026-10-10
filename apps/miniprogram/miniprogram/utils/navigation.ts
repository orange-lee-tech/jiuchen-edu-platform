import { getSavedAuthResult, refreshAuthResult, subscribeAuth, type AuthState, type BootstrapResult, type UserRole } from './auth'

export const SHELL_PATHS = ['pages/index/index', 'pages/classroom/classroom', 'pages/news/news', 'pages/profile/profile'] as const
export type ShellSlot = 'home' | 'plan' | 'opportunity' | 'mine'
export type ShellKind = 'student' | 'teacher' | 'admin'
const SLOT_INDEX: Record<ShellSlot, number> = { home: 0, plan: 1, opportunity: 2, mine: 3 }
export const ROLE_LABELS: Record<UserRole, string> = { user: '普通用户', student: '学员', teacher: '老师', staff: '内部员工', admin: '管理员' }
export const TAB_LABELS: Record<ShellKind, readonly string[]> = {
  student: ['首页', '规划', '机会', '我的'], teacher: ['工作台', '学员', '辅导', '我的'], admin: ['工作台', '查阅', '运营', '我的'],
}
export function shellKind(role?: UserRole): ShellKind {
  return role === 'admin' ? 'admin' : role === 'teacher' || role === 'staff' ? 'teacher' : 'student'
}
export const TAB_ICONS: Record<ShellKind, readonly string[]> = {
  student: ['home', 'calendar', 'opportunity', 'mine'], teacher: ['workbench', 'users', 'coaching', 'mine'], admin: ['workbench', 'users', 'business', 'mine'],
}
export function shellView(state: AuthState) {
  return { shellPhase: state.phase, shellKind: shellKind(state.auth?.user.role), shellRoleLabel: state.auth ? ROLE_LABELS[state.auth.user.role] : '未登录', shellMessage: state.message }
}
export const INITIAL_SHELL = shellView({ phase: 'loading', auth: null, message: '' })

export function observeShell(listener: (state: AuthState) => void) {
  void refreshAuthResult()
  return subscribeAuth(listener)
}
export function observeSlot(slot: ShellSlot, listener: (state: AuthState) => void) {
  return observeShell((state) => {
    wx.setNavigationBarTitle({ title: state.phase === 'ready' ? TAB_LABELS[shellKind(state.auth?.user.role)][SLOT_INDEX[slot]] : '九辰保研' })
    listener(state)
  })
}

export function initializeNavigation() {
  subscribeAuth((state) => {
    if (state.phase === 'loading') return
    const labels = TAB_LABELS[shellKind(state.phase === 'ready' ? state.auth?.user.role : undefined)]
    const icons = TAB_ICONS[shellKind(state.phase === 'ready' ? state.auth?.user.role : undefined)]
    labels.forEach((text, index) => wx.setTabBarItem({ index, text, iconPath: `assets/icons/${icons[index]}-normal.png`, selectedIconPath: `assets/icons/${icons[index]}-active.png`, fail: () => {} }))
  })
  void refreshAuthResult()
}

function navigationFailure() { wx.showToast({ title: '页面未打开，请再试一次', icon: 'none' }) }
export function openSlot(slot: ShellSlot) { wx.switchTab({ url: `/${SHELL_PATHS[SLOT_INDEX[slot]]}`, fail: navigationFailure }) }
export function openPage(url: string) { wx.navigateTo({ url, fail: navigationFailure }) }
export function safeBack() {
  if (getCurrentPages().length > 1) wx.navigateBack({ fail: () => openSlot('mine') })
  else openSlot('mine')
}

const STUDENT_ROLES: UserRole[] = ['user', 'student']
export function routeAllowed(route: string, role: UserRole | undefined, options: Record<string, string | undefined> = {}) {
  if (route === 'pages/admin/admin') return role === 'admin'
  if (route === 'pages/teacher-students/teacher-students') return role === 'teacher' || role === 'staff' || role === 'admin'
  if (route === 'pages/plan-editor/plan-editor') return options.studentId ? role === 'teacher' || role === 'staff' || role === 'admin' : role === 'student'
  if (route === 'pages/schedule-import/schedule-import') return role === 'student'
  if (route === 'pages/assessment-form/assessment-form') return Boolean(role && STUDENT_ROLES.includes(role))
  // Historical reports belong to the account even after an internal identity change.
  if (route === 'pages/assessment-history/assessment-history' || route === 'pages/assessment-result/assessment-result') return Boolean(role)
  if (route === 'pages/profile-edit/profile-edit' || route === 'pages/growth-profile/growth-profile') return Boolean(role)
  return true
}

// The intent contains no operation, token, arbitrary URL or high-privilege identifier.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const STAGE = /^(freshman|sophomore|junior|senior)-(fall|winter|spring|summer)$/
export function validateIntent(route: string, params: Record<string, string | undefined>) {
  const allowed: Record<string, Record<string, (v: string) => boolean>> = {
    'pages/profile-edit/profile-edit': {}, 'pages/growth-profile/growth-profile': {},
    'pages/position/position': {}, 'pages/assessment-history/assessment-history': {},
    'pages/assessment-form/assessment-form': { id: (v) => UUID.test(v), section: (v) => ['english', 'research', 'competition'].includes(v) },
    'pages/assessment-result/assessment-result': { id: (v) => UUID.test(v) },
    'pages/teacher-students/teacher-students': {},
    'pages/plan-editor/plan-editor': { stage: (v) => STAGE.test(v), type: (v) => ['gpa', 'english', 'competition', 'research', 'internship'].includes(v), studentId: (v) => UUID.test(v), studentName: (v) => v.length <= 80 && !/[\x00-\x1f]/.test(v) },
    'pages/admin/admin': { section: (v) => ['admin-users', 'admin-assignments', 'admin-news','admin-analytics','admin-readonly'].includes(v) },
    'pages/schedule-import/schedule-import': { view: (v) => ['current', 'manage', 'all'].includes(v) },
    'pages/product-detail/product-detail': { documentKey: (v) => v.length > 0 && v.length <= 160 && !/[/?#\x00-\x1f]/.test(v) },
    'pages/news-detail/news-detail': { id: (v) => UUID.test(v) },
  }
  if (SHELL_PATHS.some((path) => path === route)) return { route, params: {} as Record<string, string> }
  if (!Object.prototype.hasOwnProperty.call(allowed, route)) return null
  const validated: Record<string, string> = {}
  for (const [key, raw] of Object.entries(params)) {
    if (!Object.prototype.hasOwnProperty.call(allowed[route], key)) continue
    let value = raw || ''
    try { value = decodeURIComponent(value) } catch { return null }
    if (!allowed[route][key](value)) return null
    validated[key] = value
  }
  return { route, params: validated }
}
type Intent = NonNullable<ReturnType<typeof validateIntent>> & { owner: string | null; until: number; retained: boolean }
let loginIntent: Intent | null = null
export function loginFor(route: string, params: Record<string, string | undefined> = {}, retained = false, owner?: string | null) {
  const intent = validateIntent(route, params)
  loginIntent = intent ? { ...intent, owner: owner ?? getSavedAuthResult()?.user.id ?? null, until: Date.now() + 10 * 60 * 1000, retained } : null
  const options = { url: '/pages/login/login', fail: navigationFailure }
  if (retained) wx.navigateTo(options)
  else wx.redirectTo(options)
}
export function clearLoginIntent() { loginIntent = null }
export function finishLoginNavigation(auth: BootstrapResult) {
  const intent = loginIntent
  loginIntent = null
  if (!intent || intent.until < Date.now() || (intent.owner && intent.owner !== auth.user.id) || !routeAllowed(intent.route, auth.user.role, intent.params)) {
    wx.reLaunch({ url: '/pages/profile/profile', fail: navigationFailure })
    return
  }
  const pages = getCurrentPages()
  const previous = pages[pages.length - 2]
  if (intent.retained && intent.owner === auth.user.id && previous?.route === intent.route) {
    wx.navigateBack({ fail: () => openSlot('mine') })
    return
  }
  const query = Object.entries(intent.params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
  wx.reLaunch({ url: `/${intent.route}${query ? '?' + query : ''}`, fail: navigationFailure })
}

/** Run an existing page initializer once, only after server validation. Retry retains the page instance. */
const pageGuardStops = new WeakMap<object, () => void>()
export function stopPageAuthorization(page: object) { pageGuardStops.get(page)?.(); pageGuardStops.delete(page) }
export function authorizePage(route: string, options: Record<string, string | undefined>, initialize: () => void) {
  const page = getCurrentPages().slice(-1)[0]
  if (page) stopPageAuthorization(page)
  let initialized = false
  let stop: (() => void) | undefined
  stop = observeShell((state) => {
    if (initialized || state.phase !== 'ready' || !state.auth || !routeAllowed(route, state.auth.user.role, options) || !validateIntent(route, options)) return
    initialized = true
    initialize()
    stop?.()
  })
  if (initialized) stop()
  if (page) pageGuardStops.set(page, stop)
  return stop
}
