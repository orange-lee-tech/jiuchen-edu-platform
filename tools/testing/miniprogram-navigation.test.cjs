// Navigation/session regressions using the real TS modules and a bounded wx double.
// Fixtures are synthetic. No network, production account, model or payment is used.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('../../apps/miniprogram/node_modules/typescript')
const root = path.resolve(__dirname, '../../apps/miniprogram/miniprogram')
const id = '00000000-0000-4000-8000-000000000001'
const secondId = '00000000-0000-4000-8000-000000000002'
const authFixture = (role = 'student', userId = id, token = 'test-session') => ({
  ok: true, user: { id: userId, role, displayName: '测试账号' }, businessIdentity: null,
  agreement: { type: 'user_terms', version: 'test', accepted: true },
  session: { token, expiresAt: '2099-01-01T00:00:00.000Z' },
})
const settle = () => new Promise((resolve) => setImmediate(resolve))

function harness() {
  const storage = new Map(), requests = [], navigations = [], tabs = [], modals = [], sheets = []
  const cache = new Map()
  const runtimeConfig = { apiTransport: 'http', apiBaseUrl: 'https://test.invalid', cloudEnvId: 'test-env' }
  let pages = [], pageDefinition, componentDefinition, appDefinition
  let cloudInitialized = false
  const wx = {
    getStorageSync: (key) => storage.get(key), setStorageSync: (key, value) => storage.set(key, value), removeStorageSync: (key) => storage.delete(key),
    request: (options) => requests.push(options),
    cloud: { init() { cloudInitialized = true }, callContainer(options) { assert.ok(cloudInitialized, 'CloudBase must initialize before its first request'); requests.push(options) } },
    setTabBarItem: (options) => tabs.push(options), setNavigationBarTitle() {}, showToast() {},
    showModal(options) { modals.push(options) }, showActionSheet(options) { sheets.push(options) }, setClipboardData() {},
    switchTab: (options) => navigations.push({ api: 'switchTab', ...options }),
    navigateTo: (options) => navigations.push({ api: 'navigateTo', ...options }),
    redirectTo: (options) => navigations.push({ api: 'redirectTo', ...options }),
    reLaunch: (options) => navigations.push({ api: 'reLaunch', ...options }),
    navigateBack: (options) => navigations.push({ api: 'navigateBack', ...options }),
  }
  function load(relative) {
    const filename = path.resolve(root, relative.endsWith('.ts') ? relative : relative + '.ts')
    if (cache.has(filename)) return cache.get(filename).exports
    const module = { exports: {} }; cache.set(filename, module)
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText
    const requireLocal = (target) => target.includes('config/runtime') ? { runtimeConfig } : load(path.relative(root, path.resolve(path.dirname(filename), target)))
    vm.runInNewContext(source, { module, exports: module.exports, require: requireLocal, wx, getCurrentPages: () => pages, App: (definition) => { appDefinition = definition }, Page: (definition) => { pageDefinition = definition }, Component: (definition) => { componentDefinition = definition }, console, setTimeout, clearTimeout, Date, Promise, Set, Map, WeakMap }, { filename })
    return module.exports
  }
  function instantiate(definition, extras = {}) {
    const instance = { ...definition, ...definition.methods, ...extras, data: JSON.parse(JSON.stringify(definition.data)), setData(value) { Object.assign(this.data, value) }, triggerEvent() {} }
    return instance
  }
  return { wx, storage, requests, navigations, tabs, modals, sheets, load, runtimeConfig,
    auth: load('utils/auth'), nav: load('utils/navigation'),
    setPages(value) { pages = value },
    page(route, options = {}) { load(route); const page = instantiate(pageDefinition, { route, options }); pages = [page]; return page },
    component(name, props = {}) { load('components/' + name + '/' + name); return instantiate(componentDefinition, { properties: props }) },
    app() { load('app'); return appDefinition },
    respond(index, data, statusCode = 200) { requests[index].success({ statusCode, data }) },
  }
}

test('four native paths; all 21 registered legacy pages remain', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
  assert.equal(config.pages.length, 21)
  assert.deepEqual(config.tabBar.list.map((item) => item.pagePath), ['pages/index/index', 'pages/classroom/classroom', 'pages/news/news', 'pages/profile/profile'])
  assert.ok(config.pages.includes('pages/position/position'))
  const h = harness()
  for (const slot of ['home', 'plan', 'opportunity', 'mine']) h.nav.openSlot(slot)
  assert.ok(h.navigations.every((item) => item.api === 'switchTab' && !item.url.includes('?') && !item.url.includes('/position/')))
})

test('shared week filter covers ranges, odd/even weeks, date boundaries and sorted sections', () => {
  const { weeklyScheduleView, weekMatches, currentWeekFromStart } = harness().load('utils/schedule-view')
  assert.equal(currentWeekFromStart('2026-09-07', new Date('2026-09-13T15:59:59Z')), 1)
  assert.equal(currentWeekFromStart('2026-09-07', new Date('2026-09-13T16:00:00Z')), 2)
  assert.equal(currentWeekFromStart('2026-09-07', new Date('2026-09-01')), 0)
  assert.equal(weekMatches('1-4,6,8-10周(单)', 9), true)
  assert.equal(weekMatches('1-4,6,8-10周(单)', 8), false)
  assert.equal(weekMatches('1-4,6,8-10周', 7), false)
  assert.equal(weekMatches('2至8周(双)', 4), true)
  const today = new Date('2026-09-14T04:00:00Z')
  assert.equal(weeklyScheduleView(null, today).state, 'missing')
  assert.equal(weeklyScheduleView({ courses: [] }, today).state, 'date')
  assert.equal(weeklyScheduleView({ termStartDate: '2026-09-07', courses: [] }, today).state, 'empty')
  const view = weeklyScheduleView({ termStartDate: '2026-09-07', courses: [{ name: 'later', dayIndex: 2, startSection: 1, weeks: null }, { name: 'last', dayIndex: 1, startSection: 5, weeks: '1-8' }, { name: 'first', dayIndex: 1, startSection: 1, weeks: '双' }] }, today)
  assert.equal(view.state, 'ready'); assert.equal(view.visibleCourses.map(c => c.name).join(','), 'first,last,later')
})

test('current week switches the right-hand view without any navigation and failures are retryable', async () => {
  const h = harness(); h.auth.saveAuthResult(authFixture())
  const p = h.page('pages/classroom/classroom')
  p.onCurrentWeekSchedule()
  assert.equal(p.data.selectedView, 'week'); assert.equal(h.navigations.length, 0)
  h.respond(0, { error: 'failure' }, 500); await settle()
  assert.ok(p.data.weekError); assert.equal(p.data.weekLoading, false)
  p.loadCurrentWeek(); h.respond(1, { ok: true, import: null }); await settle()
  assert.equal(p.data.weekState, 'missing'); assert.equal(p.data.weekError, '')
  p.onStageChange({ currentTarget: { dataset: { index: 1 } } })
  assert.equal(p.data.selectedView, 'stage'); assert.equal(p.data.currentStageCode, 'freshman-winter')
  assert.equal(h.navigations.length, 0)
  h.respond(2, { error: 'failure' }, 500); await settle()
})

test('internal ID search, four Chinese states and actions follow real status and binding', () => {
  const { filterInternalIds, internalIdView } = harness().load('utils/admin-id-view')
  const rows = [
    { id: 'a', businessId: 'JCS-123456', type: 'student', status: 'available', userId: null, claimedAt: null },
    { id: 'b', businessId: 'JCT-222222', type: 'teacher', status: 'claimed', userId: id },
    { id: 'c', businessId: 'JCT-333333', type: 'teacher', status: 'disabled', userId: secondId, claimedAt: '2026-01-01' },
    { id: 'd', businessId: 'JCA-444444', type: 'admin', status: 'disabled', userId: null, claimedAt: '2026-01-01' },
  ]
  assert.equal(filterInternalIds(rows, 'jcs 123', 0)[0].id, 'a')
  assert.equal(filterInternalIds(rows, '', 3)[0].id, 'c')
  assert.equal(rows.map(r => internalIdView(r).statusLabel).join(','), '可认领,已绑定,已暂停,已撤销')
  assert.equal(internalIdView(rows[1], id).actions.length, 0)
  assert.equal(internalIdView(rows[2]).actions.join(','), '恢复编号,撤销授权')
  assert.equal(internalIdView(rows[0]).actions.join(','), '绑定账号,删除编号')
})

test('ID sensitive actions cancel safely, prevent duplicates and do not simulate failed writes', async () => {
  const h = harness(); h.auth.saveAuthResult(authFixture('admin'))
  const p = h.page('pages/admin/admin'); p.data.internalIds = [{ id: 'a', businessId: 'JCS-123456', type: 'student', status: 'claimed', userId: secondId }]
  const event = { currentTarget: { dataset: { id: 'a' } } }; let writes = 0
  const write = async () => { writes++; throw Error('rejected') }
  p.confirmIdAction(event, '撤销授权', write, '解除绑定', true)
  assert.ok(h.modals[0].content.includes('JCS-123456'))
  p.confirmIdAction(event, '撤销授权', write, '解除绑定', true)
  assert.equal(h.modals.length, 1)
  await h.modals[0].success({ confirm: false }); assert.equal(writes, 0)
  p.confirmIdAction(event, '撤销授权', write, '解除绑定', true)
  await h.modals[1].success({ confirm: true }); assert.equal(writes, 1)
  assert.equal(p.data.internalIds[0].status, 'claimed'); assert.equal(p.data.actionLoading, false)
})

test('article reader removes duplicate fixed layout and hidden spacers but preserves normal content', () => {
  const { articleReaderNodes } = harness().load('utils/article-reader')
  const nodes = articleReaderNodes('<section style="padding:42px 24px;height:1200px"><p>正文第一段</p><p style="display:none;height:800px">hidden</p><img src="https://example.invalid/photo.jpg" style="width:530px;height:707px" style="max-width:100%;height:auto" /><p><strong>第二段</strong></p><table><tr><td>课程</td></tr></table></section>')
  const serialized = JSON.stringify(nodes)
  assert.ok(serialized.includes('正文第一段')); assert.ok(serialized.includes('第二段')); assert.ok(serialized.includes('photo.jpg')); assert.ok(serialized.includes('table'))
  assert.ok(!/707px|1200px|hidden/.test(serialized)); assert.ok(serialized.includes('height:auto'))
})

test('article reader never retains script, events, executable URLs or unsafe styles', () => {
  const { articleReaderNodes } = harness().load('utils/article-reader')
  const serialized = JSON.stringify(articleReaderNodes('<script>alert(1)</script><iframe src="https://evil.invalid">bad</iframe><p onclick="steal()" style="background:url(javascript:evil);position:fixed;top:0">安全正文</p><img src="javascript:evil" /><img data-src="https://example.invalid/real.png" onerror="evil()" />'))
  assert.ok(serialized.includes('安全正文')); assert.ok(serialized.includes('real.png'))
  assert.ok(!/script|iframe|onclick|onerror|alert|steal|javascript|position|evil/.test(serialized))
})

test('native role icons exist, remain small, and admin Mine has no duplicate operations', async () => {
  const h = harness(); h.nav.initializeNavigation(); h.auth.saveAuthResult(authFixture('admin'))
  for (const tab of h.tabs.slice(-4)) for (const key of ['iconPath','selectedIconPath']) {
    const data = fs.readFileSync(path.join(root, tab[key])); assert.ok(data.length < 10000); assert.equal(data.readUInt32BE(16), 64)
  }
  const p = h.page('pages/profile/profile'); p.onShow()
  h.respond(0, { ok: true, user: authFixture('admin').user, businessIdentity: null }); await settle()
  assert.ok(p.data.menus.every(m => !m.key.startsWith('admin-')))
  p.onHide()
  const c = h.component('role-shell', { kind:'admin', viewSlot:'home', phase:'ready' })
  c.observers['viewSlot, kind'].call(c,'home','admin'); assert.equal(c.data.actions.length, 1)
})

test('server role replaces cached role; concurrent refresh is one read; staff is not admin', async () => {
  const h = harness(); h.auth.saveAuthResult(authFixture('admin'))
  h.nav.initializeNavigation()
  const first = h.auth.refreshAuthResult(), second = h.auth.refreshAuthResult()
  assert.equal(first, second)
  assert.equal(h.requests.length, 1)
  h.respond(0, { ok: true, user: authFixture('staff').user, businessIdentity: null })
  await first
  assert.equal(h.auth.getSavedAuthResult().user.role, 'staff')
  assert.equal(h.tabs.slice(-4).map((item) => item.text).join('|'), '工作台|学员|辅导|我的')
  assert.equal(h.nav.routeAllowed('pages/admin/admin', 'staff'), false)
  assert.equal(h.nav.routeAllowed('pages/teacher-students/teacher-students', 'staff'), true)
})

test('401 invalidates auth and resets tabs; an older session 401 cannot clear a new account', async () => {
  const h = harness(); h.nav.initializeNavigation(); h.auth.saveAuthResult(authFixture('admin'))
  const oldRequest = h.load('utils/request').request('/me/profile').catch(() => {})
  h.auth.saveAuthResult(authFixture('teacher', secondId, 'new-test-session'))
  h.respond(0, { error: 'unauthorized' }, 401); await oldRequest
  assert.equal(h.auth.getSavedAuthResult().user.id, secondId)
  const freshRequest = h.load('utils/request').request('/me/profile').catch(() => {})
  h.respond(1, { error: 'unauthorized' }, 401); await freshRequest
  assert.equal(h.auth.getSavedAuthResult(), null)
  assert.equal(h.tabs.slice(-4).map((item) => item.text).join('|'), '首页|规划|机会|我的')
})

test('claim while validation is in flight is not overwritten by the old response', async () => {
  const h = harness(); h.auth.saveAuthResult(authFixture('user'))
  const pending = h.auth.refreshAuthResult()
  h.auth.updateSavedIdentity('admin', { businessId: 'TEST-ONLY', type: 'admin', status: 'claimed' })
  h.respond(0, { ok: true, user: authFixture('user').user, businessIdentity: null }); await pending
  assert.equal(h.auth.getSavedAuthResult().user.role, 'admin')
  assert.equal(h.requests.length, 1) // No second WeChat bootstrap after claim.
})

test('unverified role never mounts a workbench and errors can be retried', async () => {
  const h = harness(); h.auth.saveAuthResult(authFixture('admin'))
  const home = h.page('pages/index/index'); home.onShow()
  assert.equal(home.data.shellPhase, 'loading')
  assert.equal(home.data.shellKind, 'student')
  h.respond(0, { error: 'service_unavailable' }, 503); await settle()
  assert.equal(home.data.shellPhase, 'error')
  const retry = h.auth.refreshAuthResult()
  h.respond(1, { ok: true, user: authFixture('teacher').user, businessIdentity: null }); await retry
  assert.equal(home.data.shellKind, 'teacher')
  home.onHide()
})

test('all six role presentations select the expected stable native labels', async () => {
  for (const role of [null, 'user', 'student', 'teacher', 'staff', 'admin']) {
   for (const slot of ['index', 'classroom', 'news', 'profile']) {
    const h = harness(); h.nav.initializeNavigation()
    if (role) h.auth.saveAuthResult(authFixture(role))
    const home = h.page(`pages/${slot}/${slot}`); home.onShow()
    if (role) { h.respond(0, { ok: true, user: authFixture(role).user, businessIdentity: null }); await settle() }
    const expected = role === 'admin' ? '工作台|用户|业务|我的' : role === 'teacher' || role === 'staff' ? '工作台|学员|辅导|我的' : '首页|规划|机会|我的'
    assert.equal(h.tabs.slice(-4).map((item) => item.text).join('|'), expected)
    assert.equal(home.data.shellPhase, 'ready')
    home.onHide()
   }
  }
})

test('late successful private response is discarded after an account switch', async () => {
  const h = harness(); h.auth.saveAuthResult(authFixture())
  const pending = h.load('utils/request').request('/me/profile')
  h.auth.saveAuthResult(authFixture('student', secondId, 'second-session'))
  h.respond(0, { profile: { university: '旧账号的测试值' } })
  await assert.rejects(pending, (error) => error.code === 'session_changed')
  assert.equal(h.auth.getSavedAuthResult().user.id, secondId)
})

test('CloudBase initialization remains before debug transport auth validation', async () => {
  const h = harness(); h.runtimeConfig.apiTransport = 'cloudrun'
  h.auth.saveAuthResult(authFixture())
  h.app().onLaunch()
  assert.equal(h.requests[0].path, '/auth/me')
  h.respond(0, { ok: true, user: authFixture().user, businessIdentity: null }); await settle()
  assert.equal(h.auth.getSavedAuthResult().user.role, 'student')
})

test('professional slots expose existing matching actions and no staff admin destination', () => {
  for (const kind of ['teacher', 'admin']) {
    for (const slot of ['home', 'plan', 'opportunity']) {
      const h = harness(), component = h.component('role-shell', { phase: 'ready', kind, viewSlot: slot })
      component.observers['viewSlot, kind'].call(component, slot, kind)
      assert.ok(component.data.actions.length > 0)
      for (const action of component.data.actions) {
        assert.ok(kind === 'admin' ? action.url.startsWith('/pages/admin/admin?section=admin-') : action.url === '/pages/teacher-students/teacher-students')
      }
      component.onAction({ currentTarget: { dataset: { key: component.data.actions[0].key } } })
      assert.equal(h.navigations[0].url, component.data.actions[0].url)
    }
  }
})

test('validated deep-link parameters survive login, never restore operations or across accounts', () => {
  const h = harness()
  h.nav.loginFor('pages/assessment-form/assessment-form', { id, section: 'research', run: 'true', token: 'secret' })
  h.nav.finishLoginNavigation(authFixture())
  assert.equal(h.navigations.at(-1).url, '/pages/assessment-form/assessment-form?id=' + id + '&section=research')
  h.auth.saveAuthResult(authFixture())
  h.nav.loginFor('pages/assessment-result/assessment-result', { id }, true)
  h.nav.finishLoginNavigation(authFixture('student', secondId, 'other-token'))
  assert.equal(h.navigations.at(-1).url, '/pages/profile/profile')
  assert.equal(h.nav.validateIntent('https://evil.invalid', {}), null)
  assert.equal(h.nav.validateIntent('constructor', {}), null)
  assert.equal(h.nav.validateIntent('__proto__', {}), null)
  assert.equal(h.nav.validateIntent('pages/assessment-form/assessment-form', { id: '../admin' }), null)
  assert.equal(h.nav.validateIntent('pages/assessment-form/assessment-form', { section: '%FF' }), null)
})

test('same-account reauthentication retains an editor instance and typed values', () => {
  const h = harness(), editor = { route: 'pages/assessment-form/assessment-form', options: { id }, typed: '未保存的输入' }
  h.setPages([editor, { route: 'pages/login/login' }])
  h.nav.loginFor(editor.route, editor.options, true, id)
  h.nav.finishLoginNavigation(authFixture())
  assert.equal(h.navigations.at(-1).api, 'navigateBack')
  assert.equal(editor.typed, '未保存的输入')
})

test('restricted cold launch waits for server validation and safe fallback works without a stack', async () => {
  const h = harness(); h.auth.saveAuthResult(authFixture('admin')); h.setPages([{ route: 'pages/admin/admin' }])
  let initialized = 0
  h.nav.authorizePage('pages/admin/admin', { section: 'admin-news' }, () => { initialized++ })
  assert.equal(initialized, 0)
  h.respond(0, { ok: true, user: authFixture('staff').user, businessIdentity: null }); await settle()
  assert.equal(initialized, 0)
  h.nav.safeBack()
  assert.equal(h.navigations.at(-1).url, '/pages/profile/profile')
})

test('identity changes preserve account-owned result reads without enabling a new assessment', () => {
  const h = harness()
  for (const role of ['teacher', 'staff', 'admin']) {
    assert.equal(h.nav.routeAllowed('pages/assessment-result/assessment-result', role), true)
    assert.equal(h.nav.routeAllowed('pages/assessment-history/assessment-history', role), true)
    assert.equal(h.nav.routeAllowed('pages/assessment-form/assessment-form', role), false)
  }
})

test('editor auth gate hides revoked-role data, retains form and rejects an account switch', async () => {
  const h = harness(); h.auth.saveAuthResult(authFixture('student'))
  h.setPages([{ route: 'pages/plan-editor/plan-editor', options: { stage: 'junior-fall', type: 'gpa' } }])
  const gate = h.component('auth-gate'); gate.lifetimes.attached.call(gate)
  h.respond(0, { ok: true, user: authFixture('student').user, businessIdentity: null }); await settle()
  assert.equal(gate.data.visible, false)
  h.load('utils/session').clearApiSessionToken()
  assert.equal(gate.data.visible, true)
  assert.equal(gate.data.needsLogin, true)
  gate.onLogin()
  h.nav.finishLoginNavigation(authFixture('student', secondId, 'new-account'))
  assert.equal(h.navigations.at(-1).url, '/pages/profile/profile')
  gate.lifetimes.detached.call(gate)
})

test('hidden classroom cannot apply a late response from a previous identity', async () => {
  const h = harness(); h.auth.saveAuthResult(authFixture('student'))
  const page = h.page('pages/classroom/classroom'); page.onShow()
  h.respond(0, { ok: true, user: authFixture('student').user, businessIdentity: null }); await settle()
  page.onHide()
  const classroomRequest = h.requests.findIndex((item) => item.url.endsWith('/me/classroom'))
  const stagesRequest = h.requests.findIndex((item) => item.url.endsWith('/classroom/stages'))
  const scheduleRequest = h.requests.findIndex((item) => item.url.includes('/schedule-imports/latest'))
  h.respond(stagesRequest, { stages: [{ code: 'junior-fall', label: '大三上', planTypes: [] }] })
  h.respond(classroomRequest, { student: { name: '旧账号测试数据' }, stage: { code: 'junior-fall' }, plans: [], mentors: [], records: [] })
  // Schedule fetch is now stage-scoped and deferred until the first requests
  // settle. A hidden page must not even issue it, nor apply stale results.
  if (scheduleRequest >= 0) h.respond(scheduleRequest, { scheduleImport: null })
  await settle()
  assert.equal(page.data.studentName, '')
})

test('WXML is balanced and changed surfaces use real registered handlers', () => {
  const pages = ['index', 'classroom', 'news', 'profile', 'position', 'admin', 'news-detail']
  for (const name of pages) {
    const h = harness(), page = h.page(`pages/${name}/${name}`)
    const source = fs.readFileSync(path.join(root, `pages/${name}/${name}.wxml`), 'utf8')
    const stack = []
    for (const match of source.matchAll(/<(?:[^"'>]|"[^"]*"|'[^']*')+>/g)) {
      const tag = match[0]; if (tag.startsWith('<!--')) continue
      const name = tag.match(/^<\/?([\w-]+)/)?.[1]; if (!name) continue
      if (tag.startsWith('</')) assert.equal(stack.pop(), name)
      else if (!tag.endsWith('/>')) stack.push(name)
    }
    assert.equal(stack.length, 0)
    for (const match of source.matchAll(/(?:bindtap|binderror)="(\w+)"/g)) assert.equal(typeof page[match[1]], 'function', `${name}: ${match[1]}`)
  }
})


test('role-shell uses an ordinary view-slot property instead of reserved WXML slot and shows distinct role tabs', () => {
  const component = fs.readFileSync(path.join(root, 'components/role-shell/role-shell.ts'), 'utf8')
  const template = fs.readFileSync(path.join(root, 'components/role-shell/role-shell.wxml'), 'utf8')
  const expected = {
    index: 'home',
    classroom: 'plan',
    news: 'opportunity',
    profile: 'mine',
  }
  assert.match(component, /viewSlot:\s*\{\s*type:\s*String/)
  assert.match(component, /'viewSlot, kind'/)
  assert.doesNotMatch(template, /\bslot\s*!==\s*'mine'/)
  for (const [page, slot] of Object.entries(expected)) {
    const html = fs.readFileSync(path.join(root, `pages/${page}/${page}.wxml`), 'utf8')
    assert.ok(html.includes(`<role-shell view-slot="${slot}"`), `${page} binds the explicit view-slot value`)
    assert.ok(!html.includes('<role-shell slot='), `${page} must not use native slot attribute`)
  }
  for (const kind of ['admin', 'teacher']) {
    const h = harness(), cmp = h.component('role-shell', { phase:'ready', kind, viewSlot:'mine' })
    cmp.observers['viewSlot, kind'].call(cmp, 'mine', kind)
    assert.equal(cmp.data.actions.length, 0, 'Mine must never duplicate Workbench actions')
    const home = h.component('role-shell', { phase:'ready', kind, viewSlot:'home' })
    home.observers['viewSlot, kind'].call(home, 'home', kind)
    assert.ok(home.data.actions.length > 0)
  }
})

test('current-week plan badge follows the selected view', () => {
  const html = fs.readFileSync(path.join(root, 'pages/classroom/classroom.wxml'), 'utf8')
  assert.match(html, /selectedView === 'week' \? '本周课表' : currentStageLabel/)
})

test('new user and each claimed business role receive a separate, dismissible 4-step guide', () => {
  const h = harness()
  const first = h.component('first-use-guide')
  first.lifetimes.attached.call(first)
  h.auth.saveAuthResult(authFixture('user'))
  assert.equal(first.data.active, true)
  assert.equal(first.data.count, 4)
  assert.match(first.data.title, /欢迎/)
  first.onNext()
  assert.equal(first.data.current, 1)
  first.onSkip()
  assert.equal(first.data.active, false)

  h.auth.saveAuthResult(authFixture('student'))
  assert.equal(first.data.active, true, 'new claimed role gets fresh guide')
  assert.match(first.data.title, /学员/)
  first.onSkip()

  h.auth.saveAuthResult(authFixture('admin'))
  assert.equal(first.data.active, true)
  assert.match(first.data.title, /管理员/)
  first.onSkip()

  h.auth.saveAuthResult(authFixture('admin'))
  assert.equal(first.data.active, false, 'same account/role not repeatedly shown')
  first.lifetimes.detached.call(first)
  for (const page of ['index', 'classroom', 'news', 'profile']) {
    const wxml = fs.readFileSync(path.join(root, `pages/${page}/${page}.wxml`), 'utf8')
    assert.match(wxml, /<first-use-guide \/>/)
  }
})
