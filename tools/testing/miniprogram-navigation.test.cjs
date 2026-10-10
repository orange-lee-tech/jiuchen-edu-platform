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
  c.observers['viewSlot, kind'].call(c,'home','admin'); assert.equal(c.data.actions.length, 4)
  assert.equal(c.data.actions[0].key,'mirror')
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
    const expected = role === 'admin' ? '工作台|查阅|运营|我的' : role === 'teacher' || role === 'staff' ? '工作台|学员|辅导|我的' : '首页|规划|机会|我的'
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
      assert.equal(h.navigations[0].url,
        kind === 'admin' && component.data.actions[0].key === 'mirror'
          ? '/pages/classroom/classroom' : component.data.actions[0].url)
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

test('schedule picker accepts Monday only and keeps last saved date on a failed PUT', async () => {
  const h=harness();h.auth.saveAuthResult(authFixture('student'))
  const page=h.page('pages/schedule-import/schedule-import')
  const course={name:'分布式能源',day:'周一',dayIndex:1,slot:'第1-2节',
    startSection:1,endSection:2,time:null,location:null,teacher:null,
    weeks:'1-16周',raw:'分布式能源'}
  page.setData({importId:'schedule-1',stageChoice:'senior-fall',
    schedule:{sourceType:'image',stageCode:'senior-fall',courses:[course],warnings:[],
      termStartDate:null,editedAt:null},termStartDate:''})
  page.onTermStartChange({detail:{value:'2026-09-06'}})
  assert.equal(h.requests.length,0)
  assert.equal(page.data.termStartDate,'')
  assert.match(h.modals.at(-1).content,/不是星期一/)

  page.onTermStartChange({detail:{value:'2026-09-07'}})
  assert.equal(h.requests.length,1)
  assert.equal(h.requests[0].method,'PUT')
  assert.ok(h.requests[0].url.endsWith('/term-start-date'))
  assert.equal(h.requests[0].data.termStartDate,'2026-09-07')
  assert.deepEqual(Object.keys(h.requests[0].data),['termStartDate'])
  assert.equal(page.data.termStartDate,'')
  h.respond(0,{ok:false,error:'invalid_schedule_edit_payload'},400)
  await settle()
  assert.equal(page.data.termStartDate,'')
  assert.equal(page.data.schedule.courses.length,1)
  assert.match(page.data.saveError,/HTTP 400/)
  assert.match(h.modals.at(-1).content,/错误码/)
})

test('schedule start-date edit sends only metadata and commits after server acknowledgement', async()=>{
  const h=harness();h.auth.saveAuthResult(authFixture('student'))
  const page=h.page('pages/schedule-import/schedule-import')
  page.setData({importId:'schedule-1',schedule:{sourceType:'image',stageCode:'senior-fall',
    courses:[],warnings:[],termStartDate:null},termStartDate:''})
  page.onTermStartChange({detail:{value:'2026-09-07'}})
  assert.equal(h.requests.length,1)
  assert.equal(h.requests[0].data.termStartDate,'2026-09-07')
  assert.deepEqual(Object.keys(h.requests[0].data),['termStartDate'])
  assert.equal(page.data.termStartDate,'')
  h.respond(0,{ok:true,termStartDate:'2026-09-07'})
  await settle()
  assert.equal(page.data.termStartDate,'2026-09-07')
  assert.equal(page.data.schedule.termStartDate,'2026-09-07')
})

test('old backend missing date-only route NEVER resubmits the entire timetable', async()=>{
 const h=harness();h.auth.saveAuthResult(authFixture('student'))
 const page=h.page('pages/schedule-import/schedule-import')
 const course={name:'物理',day:'周一',dayIndex:1,slot:'第1-2节',startSection:1,
  endSection:2,time:null,location:null,teacher:null,weeks:null,raw:'物理'}
 page.setData({importId:'schedule-1',schedule:{sourceType:'image',stageCode:'senior-fall',
  courses:[course],warnings:[],termStartDate:null},termStartDate:''})
 page.onTermStartChange({detail:{value:'2026-09-07'}})
 assert.equal(h.requests.length,1)
 h.respond(0,{statusCode:404,error:'Not Found',
   message:'Route PUT:/me/classroom/schedule-imports/schedule-1/term-start-date not found'},404)
 await settle()
 assert.equal(h.requests.length,1,'no unsafe legacy PUT fallback')
 assert.equal(page.data.termStartDate,'')
 assert.equal(page.data.schedule.courses.length,1)
 assert.match(page.data.saveError,/服务端尚未部署/)
})
test('vertical planning navigation scrolls the stage rail instead of clipping a horizontal strip',()=>{
 const wxml=fs.readFileSync(path.join(root,'pages/classroom/classroom.wxml'),'utf8')
 const css=fs.readFileSync(path.join(root,'pages/classroom/classroom.wxss'),'utf8')
 assert.match(wxml,/class="stage-sidebar" scroll-y/)
 assert.match(css,/\.stage-strip\{[^}]*flex-direction:column/)
 assert.match(css,/\.timeline\{[^}]*flex-direction:column/)
})
test('Monday-only selector exposes exactly the Mondays of a selected month', () => {
  const h=harness()
  const page=h.page('pages/schedule-import/schedule-import')
  page.setData({schedule:{sourceType:'image',stageCode:'senior-fall',courses:[],warnings:[]},termStartDate:'2026-09-07'})
  page.onOpenMondayPicker()
  assert.equal(page.data.mondayPickerOpen,true)
  assert.deepEqual(Array.from(page.data.mondayOptions,o=>o.date),['2026-09-07','2026-09-14','2026-09-21','2026-09-28'])
  assert.equal(page.data.mondayOptions.some(o=>o.date==='2026-09-06'),false)
  page.onChangeMondayMonth({currentTarget:{dataset:{delta:1}}})
  assert.equal(page.data.mondayMonth,'2026年10月')
  assert.equal(page.data.mondayOptions.length,4)
})

test('school filter drawer supports staged compound selection and cancellation', () => {
  const h=harness(),p=h.page('packages/schools/directory/directory')
  assert.equal(p.data.resultCount,172)
  p.onOpenFilter()
  p.onFilterRegion({currentTarget:{dataset:{region:'北京'}}})
  p.onFilterLevel({currentTarget:{dataset:{level:'doubleFirst'}}})
  p.onFilterGroup({currentTarget:{dataset:{group:'defense7'}}})
  p.onFilterAffiliation({currentTarget:{dataset:{affiliation:'miit'}}})
  assert.equal(p.data.previewCount,2)
  assert.equal(p.data.resultCount,172,'drawer must not mutate list until apply')
  p.onCloseFilter()
  assert.equal(p.data.resultCount,172,'cancel restores committed filters')
  p.onOpenFilter()
  p.onFilterRegion({currentTarget:{dataset:{region:'北京'}}})
  p.onFilterLevel({currentTarget:{dataset:{level:'doubleFirst'}}})
  p.onFilterGroup({currentTarget:{dataset:{group:'defense7'}}})
  p.onFilterAffiliation({currentTarget:{dataset:{affiliation:'miit'}}})
  p.onFilterApply()
  assert.equal(p.data.schools.length,2)
  assert.equal(p.data.schools[0].name,'北京航空航天大学')
  assert.equal(p.data.schools[1].name,'北京理工大学')
  p.onOpenFilter()
  p.onFilterSchool({currentTarget:{dataset:{name:'北京理工大学'}}})
  assert.equal(p.data.previewCount,1)
  p.onFilterApply()
  assert.equal(p.data.schools.length,1)
  p.onOpenFilter()
  p.onFilterReset()
  assert.equal(p.data.previewCount,172)
  p.onFilterApply()
  p.onGroup({currentTarget:{dataset:{group:'defense7'}}})
  assert.equal(p.data.schools.length,7,'quick circle should show its complete membership')
})

test('school directory lazily renders cards without truncating the full result count',()=>{
 const h=harness(),p=h.page('packages/schools/directory/directory')
 assert.equal(p.data.resultCount,172)
 assert.equal(p.data.schools.length,36)
 p.onReachBottom()
 assert.equal(p.data.schools.length,72)
 p.onLoadMore()
 assert.equal(p.data.schools.length,108)
 for(let i=0;i<10;i++)p.onReachBottom()
 assert.equal(p.data.schools.length,172)
 p.onLoadMore()
 assert.equal(p.data.schools.length,172)
})

test('teacher scoped mirror opens for an assigned student without changing login or sending any mutation',async()=>{
  const h=harness(),uuid='10000000-0000-4000-8000-000000000001'
  h.auth.saveAuthResult(authFixture('teacher'))
  const page=h.page('packages/read-only/view/view')
  page.onLoad({kind:'student',id:uuid})
  assert.equal(h.requests.length,1)
  assert.equal(h.requests[0].method,'GET')
  assert.ok(h.requests[0].url.includes('/me/read-only/students/'+uuid))
  const fake={ok:true,readOnly:true,targetType:'student',
    student:{id:uuid,name:'示例学员',university:'某大学',major:'自动化',currentStage:'junior-fall'},
    profile:{university:'某大学',major:'自动化',currentGrade:'大三',enrollmentYear:2024,gpaText:'3.6',rankText:null},
    stages:[{code:'junior-fall',label:'大三上',mode:'term',planTypes:['gpa']}],
    classroom:{ok:true,student:{id:uuid,name:'示例学员'},stage:{code:'junior-fall',label:'大三上'},
      plans:[{type:'gpa',title:'课程',items:[{id:'task',name:'高数',status:'done'}],revisionStatus:'approved'}],
      mentors:[],records:[],showGuidance:true,guidanceRecordsReady:true},
    latestSchedule:null,revisions:[],growth:[],assessments:[]}
  h.respond(0,fake)
  await settle()
  assert.equal(page.data.student.student.name,'示例学员')
  assert.equal(page.data.student.classroom.plans[0].items.length,1)
  page.onTab({currentTarget:{dataset:{tab:'assessment'}}})
  assert.equal(page.data.section,'assessment')
  assert.equal(h.auth.getSavedAuthResult().user.role,'teacher')
  assert.ok(h.requests.every(x=>x.method==='GET'))
})
test('teacher cannot enter a teacher mirror, ordinary student cannot enter either mirror',()=>{
  const t=harness();t.auth.saveAuthResult(authFixture('teacher'))
  const teacherPage=t.page('packages/read-only/view/view')
  teacherPage.onLoad({kind:'teacher',id:'10000000-0000-4000-8000-000000000002'})
  assert.match(teacherPage.data.error,/无权/)
  assert.equal(t.requests.length,0)
  const u=harness();u.auth.saveAuthResult(authFixture('student'))
  const studentPage=u.page('packages/read-only/view/view')
  studentPage.onLoad({kind:'student',id:'10000000-0000-4000-8000-000000000001'})
  assert.match(studentPage.data.error,/无权/)
  assert.equal(u.requests.length,0)
})
test('administrator can open teacher read projection and only follow assigned students',async()=>{
  const h=harness();h.auth.saveAuthResult(authFixture('admin'))
  const page=h.page('packages/read-only/view/view')
  const id='10000000-0000-4000-8000-000000000002'
  const sid='10000000-0000-4000-8000-000000000001'
  page.onLoad({kind:'teacher',id})
  assert.equal(h.requests.length,1)
  h.respond(0,{ok:true,readOnly:true,targetType:'teacher',
    teacher:{id,name:'示例老师',title:'讲师',status:'active',bio:''},
    assigned:[{studentId:sid,studentName:'示例学员',university:null,major:null,stageCode:null,relationship:'primary'}],
    pending:[]})
  await settle()
  page.onViewAssigned({currentTarget:{dataset:{id:'not-an-assignment'}}})
  assert.equal(h.navigations.length,0)
  page.onViewAssigned({currentTarget:{dataset:{id:sid}}})
  assert.ok(h.navigations[0].url.includes(encodeURIComponent(sid)))
  assert.ok(h.requests.every(x=>x.method==='GET'))
  assert.equal(h.auth.getSavedAuthResult().user.role,'admin')
})

test('read-only stage navigation never retransmits private history or uses POST',async()=>{
  const h=harness(),sid='10000000-0000-4000-8000-000000000001'
  h.auth.saveAuthResult(authFixture('teacher'))
  const page=h.page('packages/read-only/view/view')
  const stage={code:'junior-fall',label:'大三上',mode:'term',planTypes:['gpa']}
  const next={...stage,code:'junior-spring',label:'大三下'}
  page.setData({kind:'student',id:sid,viewerRole:'teacher',operatorId:id,
    student:{ok:true,readOnly:true,targetType:'student',
      student:{id:sid,name:'示例'},stages:[stage,next],classroom:{stage}},
    section:'classroom',stageIndex:0})
  page.onStage({detail:{value:'1'}})
  assert.equal(h.requests.length,1)
  assert.ok(h.requests[0].url.includes('only=classroom'))
  assert.equal(h.requests[0].method,'GET')
  h.respond(0,{ok:true,readOnly:true,classroom:{stage:next,plans:[],mentors:[],records:[]}})
  await settle()
  assert.equal(page.data.stageIndex,1)
  assert.equal(page.data.student.classroom.stage.code,'junior-spring')
})

test('read-only views are in a lazy package and do not expose editing or AI action buttons',()=>{
 const app=JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8'))
 const pack=app.subpackages.find(p=>p.root==='packages/read-only')
 assert.deepEqual(Array.from(pack.pages),['view/view'])
 const view=fs.readFileSync(path.join(root,'packages/read-only/view/view.wxml'),'utf8')
 const source=fs.readFileSync(path.join(root,'packages/read-only/view/view.ts'),'utf8')
 const teacher=fs.readFileSync(path.join(root,'pages/teacher-students/teacher-students.ts'),'utf8')
 const admin=fs.readFileSync(path.join(root,'pages/admin/admin.wxml'),'utf8')
 assert.match(view,/READ ONLY/)
 assert.match(view,/我的规划/)
 assert.match(view,/AI评估历史/)
 assert.match(teacher,/packages\/read-only\/view\/view/)
 assert.match(admin,/只读切换/)
 assert.doesNotMatch(view, /bindtap="on(?:Save|RunAssessment|Pay|Upload|Approve|Reject)/)
 assert.doesNotMatch(source,/saveAuthResult\(|setApiSessionToken\(|request\([^)]*,\s*'POST'/)
 // WXML must never contain double-nested braces; these break real preview uploads.
 assert.doesNotMatch(view,/\{\{(?:(?!\}\})[\s\S])*\{\{/)
})

test('admin identity mirror is promoted without requiring unrelated news/analytics APIs',async()=>{
 const h=harness()
 h.auth.saveAuthResult(authFixture('admin'))
 const admin=h.page('pages/admin/admin')
 admin.initializeAdmin({section:'admin-readonly'})
 assert.equal(h.requests.length,2)
 assert.ok(h.requests.some(r=>r.url.includes('/me/admin/students')))
 assert.ok(h.requests.some(r=>r.url.includes('/me/admin/teachers')))
 assert.ok(h.requests.every(r=>!r.url.includes('/me/admin/news')))
})
test('student homepage prioritizes plan and renders a four-card action grid',()=>{
 const home=fs.readFileSync(path.join(root,'pages/index/index.wxml'),'utf8')
 const ts=fs.readFileSync(path.join(root,'pages/index/index.ts'),'utf8')
 assert.match(home,/进入我的规划/)
 for(const name of ['我的规划','保研资讯','AI 评估','联系顾问'])assert.ok(home.includes(name))
 assert.match(ts,/onPrimary\(\) \{[\s\S]*?openSlot\('plan'\)/)
 const css=fs.readFileSync(path.join(root,'pages/index/index.wxss'),'utf8')
 assert.match(css,/\.action-row\{[^}]*width:49%/)
 assert.match(css,/\.service-link\{[^}]*width:49%/)
})
test('school consultation sends server-verified role + school in one consent modal',async()=>{
 const h=harness();h.auth.saveAuthResult(authFixture('admin'))
 h.runtimeConfig.wechatCustomerService={corpId:'test-corp',url:'https://test.invalid/kefu'}
 let copied='',opened=null
 h.wx.setClipboardData=opts=>{copied=opts.data;opts.success?.()}
 h.wx.openCustomerServiceChat=opts=>{opened=opts}
 const p=h.page('packages/schools/detail/detail');p.onLoad({id:'s015'})
 assert.equal(p.data.school.name,'复旦大学')
 const flow=p.onConsultSchool()
 assert.equal(h.requests.length,1)
 assert.match(h.requests[0].url,/\/auth\/me/)
 h.respond(0,{ok:true,user:authFixture('admin').user,
   businessIdentity:{businessId:'JCA-TEST-0001',type:'admin',status:'claimed'}})
 await flow
 assert.equal(h.modals.length,1)
 assert.match(h.modals[0].content,/当前身份：管理员/)
 assert.match(h.modals[0].content,/目标学校：复旦大学/)
 assert.equal(opened,null)
 h.modals[0].success({confirm:true})
 assert.match(copied,/当前身份：管理员/)
 assert.match(copied,/目标学校：复旦大学/)
 assert.match(opened.sendMessageTitle,/管理员/)
 assert.match(opened.sendMessagePath,/packages\/schools\/detail\/detail\?id=s015/)
 assert.equal(h.sheets.length,0)
})
test('school inquiry never trusts stale role when revalidation fails',async()=>{
 const h=harness();h.auth.saveAuthResult(authFixture('teacher'))
 h.runtimeConfig.wechatCustomerService={corpId:'test-corp',url:'https://test.invalid/kefu'}
 let opened=false;h.wx.openCustomerServiceChat=()=>{opened=true}
 const p=h.page('packages/schools/detail/detail');p.onLoad({id:'s015'})
 const flow=p.onConsultSchool()
 h.respond(0,{error:'unauthorized'},401)
 await flow
 assert.equal(opened,false)
 assert.equal(h.modals.length,1)
 assert.match(h.modals[0].content,/本地缓存/)
})
test('student school consultation includes server-confirmed student role and known academic context',async()=>{
 const h=harness();h.auth.saveAuthResult(authFixture('student'))
 h.runtimeConfig.wechatCustomerService={corpId:'test-corp',url:'https://test.invalid/kefu'}
 let copied='',opened=null
 h.wx.setClipboardData=opts=>{copied=opts.data;opts.success?.()}
 h.wx.openCustomerServiceChat=opts=>{opened=opts}
 const p=h.page('packages/schools/detail/detail');p.onLoad({id:'s009'})
 const flow=p.onConsultSchool()
 assert.equal(h.requests.length,2,'student context comes from read-only profile and classroom requests')
 h.respond(0,{ok:true,profile:{university:'中南大学',major:'能源与动力工程',
   currentGrade:'大四',enrollmentYear:2023,gpaText:null,rankText:null}})
 h.respond(1,{ok:true,student:{id,name:'学员甲',major:'能源与动力工程'},
   stage:{code:'senior-fall',label:'大四上'},plans:[],mentors:[],records:[]})
 await settle()
 assert.equal(h.requests.length,3,'recheck actual server identity after reading profile context')
 h.respond(2,{ok:true,user:{...authFixture('student').user,displayName:'学员甲'},
   businessIdentity:{businessId:'JCS-0001',status:'claimed',type:'student'}})
 await flow
 assert.equal(h.modals.length,1)
 assert.match(h.modals[0].content,/当前身份：学员/)
 assert.match(h.modals[0].content,/目标学校：南开大学/)
 h.modals[0].success({confirm:true})
 assert.match(copied,/就读年级：大四/)
 assert.match(copied,/就读专业：能源与动力工程/)
 assert.match(opened.sendMessageTitle,/学员/)
})

test('school map updates preview and navigation while honoring primary campus',()=>{
 const h=harness(),p=h.page('packages/schools/detail/detail')
 p.onLoad({id:'s015'})
 assert.match(p.data.activeCampus.campus,/邯郸/)
 const old=p.data.activeCampus.longitude
 const z=p.data.campusOptions.findIndex(x=>x.campus==='张江校区')
 assert.ok(z>=0)
 p.onSelectCampus({currentTarget:{dataset:{index:z}}})
 assert.equal(p.data.activeCampus.campus,'张江校区')
 assert.notEqual(p.data.activeCampus.longitude,old)
 assert.equal(p.data.mapMarkers[0].longitude,p.data.activeCampus.longitude)
 let location=null;h.wx.openLocation=o=>{location=o}
 p.onOpenMap()
 assert.equal(location.longitude,p.data.activeCampus.longitude)
 p.onLoad({id:'s009'})
 assert.match(p.data.activeCampus.campus,/八里台/)
})

test('administrator browse bottom tab queries roster immediately without nested management page',async()=>{
 const h=harness(),c=h.component('role-shell',{kind:'admin',viewSlot:'plan',phase:'ready'})
 c.observers['viewSlot, kind, phase'].call(c,'plan','admin','ready')
 assert.equal(h.requests.length,2)
 assert.ok(h.requests.every(x=>x.method==='GET'))
 h.respond(0,{ok:true,students:[{id, name:'学生甲',university:'中南大学',major:'能动'}]})
 h.respond(1,{ok:true,teachers:[{id:secondId,name:'老师乙',title:'顾问',status:'active'}]})
 await settle()
 assert.equal(c.data.displayedStudents.length,1)
 assert.equal(c.data.displayedTeachers.length,1)
 c.onBrowseStudent({currentTarget:{dataset:{id}}})
 assert.match(h.navigations[0].url,/packages\/read-only\/view\/view\?kind=student/)
 c.onBrowseTeacher({currentTarget:{dataset:{id:secondId}}})
 assert.match(h.navigations[1].url,/kind=teacher/)
})

test('home keeps profile completion accessible without displacing the plan CTA',()=>{
 const source=fs.readFileSync(path.join(root,'pages/index/index.wxml'),'utf8')
 const page=fs.readFileSync(path.join(root,'pages/index/index.ts'),'utf8')
 assert.match(source,/wx:if="\{\{!assessmentReady\}\}".*bindtap="onCompleteProfile"/)
 assert.match(page,/onCompleteProfile\(\)/)
})
test('PKU media/map are real sourced assets and customer-service card points to school',()=>{
 const data=fs.readFileSync(path.join(root,'packages/schools/data.ts'),'utf8')
 const wxml=fs.readFileSync(path.join(root,'packages/schools/detail/detail.wxml'),'utf8')
 const service=fs.readFileSync(path.join(root,'utils/customer-service.ts'),'utf8')
 assert.match(data,/"北京大学": \{/)
 assert.match(data,/Weiming_Lake_of_Peking_University_in_spring_03\.jpg/)
 assert.match(data,/39\.99307/)
 assert.match(data,/116\.315282/)
 assert.match(data,/CC BY-SA 4\.0/)
 assert.match(wxml,/onPreviewPhoto/)
 assert.match(wxml,/mapMarkers/)
 assert.match(service,/sendMessagePath:card\.path/)
})

test('customer service identifies the actual server-verified role without auto-sending',async()=>{
 const h=harness()
 h.auth.saveAuthResult(authFixture('admin'))
 h.runtimeConfig.wechatCustomerService={corpId:'test-corp',url:'https://test.invalid/kefu'}
 let opened=null, copied=null
 h.wx.openCustomerServiceChat=options=>{opened=options}
 h.wx.setClipboardData=options=>{copied=options.data;options.success?.()}
 const page=h.page('pages/profile/profile')
 page.onCustomerServiceTap()
 assert.equal(h.requests.length,1)
 assert.match(h.requests[0].url,/\/auth\/me/)
 assert.equal(opened,null)
 h.respond(0,{ok:true,user:{...authFixture('admin').user,displayName:'测试管理员'},
   businessIdentity:{businessId:'JCA-ABCD-1234',type:'admin',status:'claimed'}})
 await settle()
 assert.equal(h.modals.length,1)
 assert.match(h.modals[0].content,/管理员/)
 assert.match(h.modals[0].content,/JCA-ABCD-1234/)
 assert.equal(opened,null,'no customer-service card may be sent before user consent')
 h.modals[0].success({confirm:true})
 assert.match(copied,/当前身份：管理员/)
 assert.match(copied,/联系人：测试管理员/)
 assert.match(copied,/九辰内部编号：JCA-ABCD-1234/)
 assert.equal(opened.showMessageCard,true)
 assert.match(opened.sendMessageTitle,/管理员/)
 assert.equal(opened.sendMessagePath,'/pages/profile/profile')
})
test('customer-service identity never claims server verification when revalidation fails',async()=>{
 const h=harness()
 h.auth.saveAuthResult(authFixture('teacher'))
 h.runtimeConfig.wechatCustomerService={corpId:'test-corp',url:'https://test.invalid/kefu'}
 let opened=false;h.wx.openCustomerServiceChat=()=>{opened=true}
 const page=h.page('pages/profile/profile');page.onCustomerServiceTap()
 h.respond(0,{error:'unauthorized'},401)
 await settle()
 assert.equal(opened,false)
 assert.match(h.modals[0].content,/本地缓存/)
})
test('administrator mine keeps two equally sized actions, and workbench uses full-width view rows',()=>{
 const p=fs.readFileSync(path.join(root,'pages/profile/profile.wxml'),'utf8')
 const w=fs.readFileSync(path.join(root,'components/role-shell/role-shell.wxml'),'utf8')
 const css=fs.readFileSync(path.join(root,'components/role-shell/role-shell.wxss'),'utf8')
 assert.match(p,/class="identity-buttons"/)
 assert.match(p,/class="identity-control identity-copy"/)
 assert.match(p,/class="identity-control identity-primary"/)
 assert.doesNotMatch(p,/class="copy-code"/)
 assert.match(w,/class="admin-action.*" data-key/)
 assert.match(css,/\.admin-action\{[^}]*width:100%/)
 assert.match(css,/\.admin-action-main\{[^}]*flex:1 1 0/)
})

test('guest consultation stays available but cannot claim an authenticated staff role',()=>{
 const h=harness();h.runtimeConfig.wechatCustomerService={corpId:'test-corp',url:'https://test.invalid/kefu'}
 let opened=null;h.wx.openCustomerServiceChat=options=>{opened=options}
 const p=h.page('pages/profile/profile')
 p.onCustomerServiceTap()
 assert.equal(h.requests.length,0)
 assert.match(h.modals[0].content,/未登录游客/)
 assert.equal(opened,null)
 h.modals[0].success({confirm:true})
 assert.equal(opened.showMessageCard,true)
 assert.match(opened.sendMessageTitle,/未登录游客/)
 assert.doesNotMatch(opened.sendMessageTitle,/管理员|老师|学员/)
})
