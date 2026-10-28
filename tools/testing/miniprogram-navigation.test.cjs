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
    getStorage:o=>storage.has(o.key)?o.success({data:storage.get(o.key)}):o.fail?.(),
    setStorage:o=>{storage.set(o.key,o.data);o.complete?.()},
    removeStorage:o=>{storage.delete(o.key);o.complete?.()},
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

function virtualPaymentPage() {
  const h = harness()
  h.auth.saveAuthResult(authFixture())
  const p = h.page('pages/assessment-form/assessment-form')
  p.data.checkoutEnabled = true
  p.loadCredits = async () => {}
  h.wx.login = ({ success }) => success({ code: 'synthetic-wechat-code' })
  return { h, p }
}

const syntheticVirtualOrder = {
  ok: true,
  order: { id: secondId, status: 'pending', amountFen: 10, creditAmount: 2 },
  payment: { mode: 'short_series_goods', signData: 'fixture', paySig: 'fixture', signature: 'fixture' },
}

test('virtual payment distinguishes order creation failure before invoking WeChat', async () => {
  const { h, p } = virtualPaymentPage()
  let invoked = 0
  h.wx.requestVirtualPayment = () => { invoked++ }
  const purchase = p.beginCreditPurchase('JC000')
  await settle()
  h.respond(0, { error: 'wechat_virtual_payment_not_ready' }, 503)
  await purchase
  assert.equal(invoked, 0)
  assert.equal(p.data.pendingPaymentOrderId, '')
  assert.equal(h.modals.at(-1).title, '创建订单失败')
})

test('cancelled or failed virtual payment retains the pending order and exposes only safe platform details', async () => {
  for (const failure of [
    { errCode: -2, errMsg: 'requestVirtualPayment:fail cancel' },
    { errCode: -15010, errMsg: 'requestVirtualPayment:fail 商品未发布' },
    { errCode: -15013, errMsg: 'requestVirtualPayment:fail goodsPrice错误' },
    { errCode: -15006, errMsg: 'requestVirtualPayment:fail paySig=private-value' },
  ]) {
    const { h, p } = virtualPaymentPage()
    h.wx.requestVirtualPayment = ({ fail }) => fail(failure)
    const purchase = p.beginCreditPurchase('JC000')
    await settle()
    h.respond(0, syntheticVirtualOrder)
    await purchase
    assert.equal(p.data.pendingPaymentOrderId, secondId)
    assert.match(h.modals.at(-1).content, new RegExp(String(failure.errCode)))
    if(failure.errCode===-15013) {
      assert.equal(p.data.canEndPendingOrder,true)
      assert.match(h.modals.at(-1).content,/微信道具价格与当前购买金额不一致/)
    }
    assert.doesNotMatch(h.modals.at(-1).content, /private-value|paySig/)
    assert.equal(h.requests.length, 1, 'a failed client callback never settles credits')
    p.setData({ pendingPaymentOrderId: '' })
    p.onShow()
    assert.equal(p.data.pendingPaymentOrderId, secondId, 'an app revisit restores the unresolved order')
    await p.beginCreditPurchase('JC000')
    assert.equal(h.requests.length, 1, 'unverified order blocks a second charge')
    assert.equal(h.modals.at(-1).title, '请先核实上一笔订单')
  }
})

test('a confirmed pre-checkout rejection can end only the owned unresolved order and unlock all goods', async () => {
  const {h,p}=virtualPaymentPage()
  h.wx.requestVirtualPayment=({fail})=>fail({errCode:-15013,errMsg:'requestVirtualPayment:fail goodsPrice错误'})
  const first=p.beginCreditPurchase('JC000')
  await settle()
  h.respond(0,syntheticVirtualOrder)
  await first
  assert.equal(p.data.canEndPendingOrder,true)
  const before=p.endUnpaidPayment()
  await settle()
  assert.match(h.requests[1].url,/\/virtual-payment-orders\/.*\/end-unpaid$/)
  assert.equal(h.requests[1].data.prePaymentErrorCode,undefined,'client error code is diagnostic only')
  assert.equal(h.requests[1].data.confirmUnpaid,true)
  h.respond(1,{ok:false,error:'virtual_order_checkout_window_open'},409)
  await before
  assert.equal(p.data.pendingPaymentOrderId,secondId,'the open checkout window keeps the order locked')
  const retry=p.endUnpaidPayment()
  await settle()
  h.respond(2,{ok:true,state:'closed',credited:false})
  await retry
  assert.equal(p.data.pendingPaymentOrderId,'')
  assert.equal(p.data.canEndPendingOrder,false)
  assert.equal(h.storage.has('jiuchen:virtual-order:'+id),false)
  assert.equal(h.storage.has('jiuchen:virtual-order-failure:'+id),false)
  const next=p.beginCreditPurchase('JC003')
  await settle()
  assert.equal(h.requests.length,4,'a different SKU can create a new order only after trusted closure')
  h.respond(3,{error:'wechat_virtual_payment_not_ready'},503)
  await next
})

test('WeChat callback success with failed official query remains unresolved until a trusted terminal response', async () => {
  const { h, p } = virtualPaymentPage()
  h.wx.requestVirtualPayment = ({ success }) => success()
  const purchase = p.beginCreditPurchase('JC000')
  await settle()
  h.respond(0, syntheticVirtualOrder)
  await settle()
  assert.match(h.requests[1].url, /\/virtual-payment-orders\/.*\/reconcile$/)
  h.respond(1, { error: 'virtual_payment_query_unavailable' }, 503)
  await purchase
  assert.equal(h.modals.at(-1).title, '官方查单未完成')
  assert.equal(p.data.pendingPaymentOrderId, secondId)
  await p.beginCreditPurchase('JC000')
  assert.equal(h.requests.length, 2, 'unknown state cannot open a new order')

  p.onVerifyCreditPayment()
  p.onVerifyCreditPayment()
  assert.equal(h.requests.length, 3, 'only one manual query runs at a time')
  h.respond(2, { ok: true, state: 'closed', credited: false })
  await settle()
  assert.equal(p.data.pendingPaymentOrderId, '')
  assert.equal(p.data.verifyingPayment, false)
  assert.equal(h.storage.has('jiuchen:virtual-order:' + id), false, 'only the resolved local order marker is removed')
  assert.equal(h.modals.at(-1).title, '购买订单已结束')
  assert.doesNotMatch(h.modals.at(-1).content, /微信确认订单已关闭/, 'manual local closure is not called an official WeChat closure')
  const retry = p.beginCreditPurchase('JC000')
  await settle()
  assert.equal(h.requests.length, 4, 'trusted closed state unlocks creation of a fresh order')
  h.respond(3, { error: 'wechat_virtual_payment_not_ready' }, 503)
  await retry
  assert.equal(p.data.pendingPaymentOrderId, '')
})

test('shared week and today/tomorrow filters cover China dates, odd/even weeks and sorted sections', () => {
  const { weeklyScheduleView, dailyScheduleView, weekMatches, currentWeekFromStart } = harness().load('utils/schedule-view')
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
  const schedule = { termStartDate:'2026-09-07', courses:[
    {name:'Monday late',dayIndex:1,startSection:5,weeks:'1-8'},
    {name:'Monday early',dayIndex:1,startSection:1,weeks:'单'},
    {name:'Tuesday',dayIndex:2,startSection:1,weeks:'双'},
  ] }
  const sunday = new Date('2026-09-06T15:59:00Z') // Sunday 23:59 in China
  assert.equal(dailyScheduleView(schedule, 0, sunday).state, 'before')
  assert.deepEqual(Array.from(dailyScheduleView(schedule, 1, sunday).courses, c => c.name), ['Monday early','Monday late'])
  const monday = new Date('2026-09-13T16:00:00Z') // Next Monday 00:00 in China
  assert.equal(dailyScheduleView(schedule, 0, monday).week, 2)
  assert.deepEqual(Array.from(dailyScheduleView(schedule, 0, monday).courses, c => c.name), ['Monday late'])
  assert.deepEqual(Array.from(dailyScheduleView(schedule, 1, monday).courses, c => c.name), ['Tuesday'])
  assert.equal(dailyScheduleView(null, 0, monday).state, 'missing')
  assert.equal(dailyScheduleView({ courses: [] }, 0, monday).state, 'date')
  assert.equal(dailyScheduleView({ termStartDate:'2026-09-07',courses:[] }, 0, monday).state, 'empty')
})

test('today workbench shows the saved classroom plan state', async () => {
  const h = harness(); h.auth.saveAuthResult(authFixture('student'))
  const page = h.page('pages/index/index'); page.onShow()
  h.respond(0, { ok:true, user:authFixture('student').user, businessIdentity:null }); await settle()
  const classroom = h.requests.findIndex(item => item.url.endsWith('/me/classroom'))
  const profile = h.requests.findIndex(item => item.url.endsWith('/me/profile'))
  assert.ok(classroom >= 0 && profile >= 0)
  assert.equal(h.requests.some(item => item.url.includes('/schedule-imports/latest')), false,
    'schedule query waits for the actual classroom stage')
  h.respond(classroom, {ok:true, student:{currentStage:'junior-fall'}, stage:{code:'junior-fall'},
    plans:[{type:'gpa',title:'课程成绩计划',id:'saved-plan',revisionStatus:'approved',items:[]}], mentors:[],records:[]})
  await settle()
  const schedule = h.requests.findIndex(item => item.url.includes('/schedule-imports/latest'))
  assert.ok(schedule >= 0)
  assert.match(h.requests[schedule].url, /stageCode=junior-fall/)
  h.respond(schedule, {ok:true,import:null})
  h.respond(profile, {ok:true,profile:{university:'测试大学',major:'测试专业',currentGrade:'大三'}})
  await settle()
  assert.equal(page.data.planStageLabel,'大三上')
  assert.equal(page.data.planPreview[0].status,'已保存')
  assert.equal(page.data.scheduleState,'missing')
  page.onHide()
  assert.equal(page.data.planPreview.length,0,'private preview is cleared when the tab hides')
})

test('today workbench never displays a schedule from another semester or a holiday', async () => {
  const h = harness(); h.auth.saveAuthResult(authFixture('student'))
  const page = h.page('pages/index/index'); page.onShow()
  h.respond(0, { ok:true, user:authFixture('student').user, businessIdentity:null }); await settle()
  const classroom = h.requests.findIndex(item => item.url.endsWith('/me/classroom'))
  const profile = h.requests.findIndex(item => item.url.endsWith('/me/profile'))
  h.respond(classroom, {ok:true, student:{currentStage:'junior-winter'}, stage:{code:'junior-winter'},
    plans:[], mentors:[],records:[]})
  h.respond(profile, {ok:true,profile:{university:'测试大学',major:'测试专业',currentGrade:'大三'}})
  await settle()
  assert.equal(page.data.scheduleState, 'holiday')
  assert.equal(h.requests.some(item => item.url.includes('/schedule-imports/latest')), false)
  page.onScheduleDay({currentTarget:{dataset:{day:1}}})
  assert.equal(page.data.scheduleState, 'holiday')
  page.onHide()

  const other = harness(); other.auth.saveAuthResult(authFixture('student'))
  const termPage = other.page('pages/index/index'); termPage.onShow()
  other.respond(0, { ok:true, user:authFixture('student').user, businessIdentity:null }); await settle()
  const termClassroom = other.requests.findIndex(item => item.url.endsWith('/me/classroom'))
  other.respond(termClassroom, {ok:true, student:{currentStage:'junior-fall'}, stage:{code:'junior-fall'},
    plans:[], mentors:[], records:[]})
  await settle()
  const schedule = other.requests.findIndex(item => item.url.includes('/schedule-imports/latest'))
  assert.ok(schedule >= 0)
  other.respond(schedule, {ok:true, import:{schedule:{stageCode:'sophomore-spring',
    termStartDate:'2026-09-07',courses:[{name:'不得展示的课程',dayIndex:1,startSection:1}]}}})
  await settle()
  assert.equal(termPage.data.scheduleCourses.length, 0)
  assert.match(termPage.data.scheduleError, /阶段与档案不一致/)
  termPage.onHide()
})

test('plan save requires a direct-save response and rejects an old pending-review API', async () => {
  const h = harness(); h.auth.saveAuthResult(authFixture('student'))
  const api = h.load('utils/request')
  const payload = { title: '英语规划', items: [{ name: '练习', status: 'pending' }] }
  const stale = api.saveMyClassroomPlan('junior-fall', 'english', payload)
  h.respond(0, { ok: true, revision: { id: 'old-revision', status: 'pending' } })
  await assert.rejects(stale, /plan_direct_save_unavailable/)
  const saved = api.saveMyClassroomPlan('junior-fall', 'english', payload)
  h.respond(1, { ok: true, plan: { id: 'saved-plan', status: 'saved' } })
  assert.equal((await saved).id, 'saved-plan')
})

test('current week switches the right-hand view without any navigation and failures are retryable', async () => {
  const h = harness(); h.auth.saveAuthResult(authFixture())
  const p = h.page('pages/classroom/classroom')
  p.setData({ actualStageCode: 'junior-fall' })
  p.onCurrentWeekSchedule()
  assert.equal(p.data.selectedView, 'week'); assert.equal(h.navigations.length, 0)
  assert.match(h.requests[0].url, /stageCode=junior-fall/)
  h.respond(0, { error: 'failure' }, 500); await settle()
  assert.ok(p.data.weekError); assert.equal(p.data.weekLoading, false)
  p.loadCurrentWeek(); h.respond(1, { ok: true, import: null }); await settle()
  assert.equal(p.data.weekState, 'missing'); assert.equal(p.data.weekError, '')
  p.onStageChange({ currentTarget: { dataset: { index: 1 } } })
  assert.equal(p.data.selectedView, 'stage'); assert.equal(p.data.currentStageCode, 'freshman-winter')
  assert.equal(h.navigations.length, 0)
  h.respond(2, { error: 'failure' }, 500); await settle()
})

test('plan editor imports courses only from the selected semester and blocks saves after a failed read', async () => {
  const h = harness(); h.auth.saveAuthResult(authFixture('student'))
  const page = h.page('pages/plan-editor/plan-editor')
  page.onLoad({stage:'junior-fall',type:'gpa'})
  h.respond(0, {ok:true,user:authFixture('student').user,businessIdentity:null}); await settle()
  const classroom = h.requests.findIndex(item => item.url.includes('/me/classroom?stage=junior-fall'))
  assert.ok(classroom >= 0)
  h.respond(classroom, {ok:true,student:{name:'测试学员'},stage:{code:'junior-fall'},
    plans:[{type:'gpa',title:'课程成绩计划',id:null,revisionStatus:'none',items:[]}],mentors:[],records:[]})
  await settle()
  const schedule = h.requests.findIndex(item => item.url.includes('/schedule-imports/latest'))
  assert.ok(schedule >= 0)
  assert.match(h.requests[schedule].url,/stageCode=junior-fall/)
  h.respond(schedule,{ok:true,import:null}); await settle()
  const versions = h.requests.findIndex(item => item.url.includes('/versions'))
  if (versions >= 0) { h.respond(versions,{ok:true,revisions:[]}); await settle() }
  assert.equal(page.data.loadError,'')

  const failed = harness(); failed.auth.saveAuthResult(authFixture('student'))
  const editor = failed.page('pages/plan-editor/plan-editor')
  editor.onLoad({stage:'junior-fall',type:'gpa'})
  failed.respond(0,{ok:true,user:authFixture('student').user,businessIdentity:null}); await settle()
  const failedRead = failed.requests.findIndex(item => item.url.includes('/me/classroom?stage=junior-fall'))
  failed.respond(failedRead,{ok:false,error:'network_unavailable'},503); await settle()
  assert.ok(editor.data.loadError)
  const beforeSave = failed.requests.length
  await editor.onSave()
  assert.equal(failed.requests.length,beforeSave,'failed read must not submit a stale plan')
})

test('opportunity and mine clear account-owned lists when hidden', () => {
  const h = harness()
  const news = h.page('pages/news/news')
  news.setData({ favorites:[{postId:'old-article'}], retiring:[{id:'old-article'}],
    articles:[{id:'old-article'}], allArticles:[{id:'old-article'}] })
  news.onHide()
  assert.equal(news.data.favorites.length, 0)
  assert.equal(news.data.articles.length, 0)
  const profile = h.page('pages/profile/profile')
  profile.setData({ identities:[{id:'old-identity'}], favorites:[{postId:'old-article'}],
    favoritesVisible:true, identityInput:'old-code' })
  profile.onHide()
  assert.equal(profile.data.identities.length, 0)
  assert.equal(profile.data.favorites.length, 0)
  assert.equal(profile.data.identityInput, '')
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
  assert.equal(rows.map(r => internalIdView(r).statusLabel).join(','), '未认领,已认领,已暂停,已撤销')
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
  assert.equal(h.tabs.slice(-4).map((item) => item.text).join('|'), '今天|规划|机会|我的')
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
    const expected = role === 'admin' ? '工作台|查阅|运营|我的' : role === 'teacher' || role === 'staff' ? '工作台|学员|辅导|我的' : '今天|规划|机会|我的'
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

test('admin switching to student refreshes role presentation and invalidates the old profile cache',async()=>{
 const h=harness();h.auth.saveAuthResult(authFixture('admin'))
 const profile=h.page('pages/profile/profile')
 profile.onShow()
 const identities=[{id:'admin-id',businessId:'JCA-TEST',type:'admin',status:'claimed'},
  {id:'student-id',businessId:'JCS-TEST',type:'student',status:'claimed'}]
 h.respond(0,{ok:true,user:authFixture('admin').user,businessIdentity:null})
 h.respond(1,{ok:true,activeRole:'admin',identities});await settle()
 const cacheKey='jiuchen-academic-profile:'+id
 h.storage.set(cacheKey,{privateAcademicRecord:true})
 const flow=profile.onSwitchIdentity({currentTarget:{dataset:{role:'student'}}})
 await settle();const switched=h.requests.findIndex(r=>/\/me\/identities\/switch$/.test(r.url))
 assert.ok(switched>=0)
 h.respond(switched,{ok:true});await settle()
 const auth=h.requests.findIndex((r,i)=>i>switched&&/\/auth\/me$/.test(r.url))
 assert.ok(auth>=0)
 h.respond(auth,{ok:true,user:authFixture('student').user,businessIdentity:{businessId:'JCS-TEST',type:'student',status:'claimed'}})
 await settle();const loaded=h.requests.findIndex((r,i)=>i>auth&&/\/me\/identities$/.test(r.url))
 assert.ok(loaded>=0)
 h.respond(loaded,{ok:true,activeRole:'student',identities});await flow
 assert.equal(h.auth.getSavedAuthResult().user.role,'student')
 assert.equal(profile.data.role,'student')
 assert.ok(profile.data.menus.some(item=>item.key==='assessment'))
 assert.equal(h.storage.has(cacheKey),false)
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
    assert.ok(wxml.includes('<first-use-guide'))
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
  assert.equal(page.data.currentWeek > 0, true)
})

test('returning to schedule page rereads latest saved term and does not replace an active edit', async()=>{
 const h=harness();h.auth.saveAuthResult(authFixture('student'))
 const page=h.page('pages/schedule-import/schedule-import')
 page.setData({importId:'old',schedule:{stageCode:'junior-fall',termStartDate:null,courses:[],warnings:[]}})
 page.onShow()
 assert.equal(h.requests.length,1)
 h.respond(0,{ok:true,import:{id:'new',fileName:'课表.xlsx',schedule:{stageCode:'junior-spring',termStartDate:'2026-09-07',courses:[],warnings:[]}}})
 await settle()
 assert.equal(page.data.importId,'new')
 assert.equal(page.data.stageChoiceLabel,'大三下')
 assert.equal(page.data.termStartDate,'2026-09-07')
 page.setData({editing:true})
 page.onShow()
 assert.equal(h.requests.length,1)
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
test('compact planning selector keeps all academic years, holiday stages and week entry',()=>{
 const wxml=fs.readFileSync(path.join(root,'pages/classroom/classroom.wxml'),'utf8')
 const css=fs.readFileSync(path.join(root,'pages/classroom/classroom.wxss'),'utf8')
 assert.match(wxml,/class="stage-picker surface"/)
 assert.match(wxml,/wx:for="\{\{stageGroups\}\}"/)
 assert.match(wxml,/档案当前阶段：\{\{actualStageLabel\}\}/)
 assert.match(wxml,/查看本周完整课表/)
 assert.match(css,/\.stage-options\{[^}]*flex-wrap:wrap/)
 const page=harness().page('pages/classroom/classroom')
 assert.equal(page.data.stageGroups.length,4)
 assert.equal(page.data.stageGroups.flatMap(group=>group.stages).length,page.data.stages.length)
 page.onToggleStagePicker();assert.equal(page.data.stagePickerOpen,true)
 page.onStageChange({currentTarget:{dataset:{code:'junior-winter'}}})
 assert.equal(page.data.currentStageCode,'junior-winter')
 assert.equal(page.data.stagePickerOpen,false)
})
test('account settings stay reachable without exposing destructive actions on the main Mine surface',()=>{
 const h=harness(),page=h.page('pages/profile/profile')
 const wxml=fs.readFileSync(path.join(root,'pages/profile/profile.wxml'),'utf8')
 assert.match(wxml,/wx:if="\{\{accountSettingsOpen\}\}" class="account-actions"/)
 assert.equal(page.data.accountSettingsOpen,false)
 page.onToggleAccountSettings();assert.equal(page.data.accountSettingsOpen,true)
 page.onToggleAccountSettings();assert.equal(page.data.accountSettingsOpen,false)
 assert.match(wxml,/bindtap="onLogout"/)
 assert.match(wxml,/bindtap="onDeleteAccount"/)
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

test('teacher read-only entry opens the existing native student tabs without changing login',async()=>{
  const h=harness(),uuid='10000000-0000-4000-8000-000000000001'
  h.auth.saveAuthResult(authFixture('teacher'))
  const page=h.page('packages/read-only/view/view')
  page.onLoad({kind:'student',id:uuid})
  assert.equal(h.requests.length,1)
  assert.equal(h.requests[0].method,'GET')
  assert.ok(h.requests[0].url.includes('/me/read-only/context?kind=student&id='+uuid))
  const fake={ok:true,operatorUserId:id,readToken:'ro.synthetic',expiresAt:'2099-01-01',subject:{id:uuid,kind:'student',role:'student',name:'合成学员',businessId:'JCS-SYNTHETIC'}}
  h.respond(0,fake)
  await settle()
  assert.equal(h.navigations[0].api,'switchTab');assert.equal(h.navigations[0].url,'/pages/index/index')
  assert.equal(h.load('utils/read-only-context').getReadOnlyContext().role,'student')
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
test('administrator teacher view uses teacher four-tab labels while retaining the original session',async()=>{
  const h=harness();h.auth.saveAuthResult(authFixture('admin'))
  const page=h.page('packages/read-only/view/view')
  const id='10000000-0000-4000-8000-000000000002'
  page.onLoad({kind:'teacher',id})
  assert.equal(h.requests.length,1)
  h.respond(0,{ok:true,operatorUserId:authFixture('admin').user.id,readToken:'ro.synthetic',expiresAt:'2099-01-01',subject:{id,kind:'teacher',role:'teacher',name:'合成老师',businessId:'JCT-SYNTHETIC'}})
  await settle()
  assert.equal(h.navigations[0].url,'/pages/index/index')
  let role
  h.nav.observeShell(state=>role=state.auth?.user.role)
  h.respond(1,{ok:true,user:authFixture('admin').user,businessIdentity:null});await settle()
  assert.equal(role,'teacher')
  assert.deepEqual(Array.from(h.nav.TAB_LABELS.teacher),['工作台','学员','辅导','我的'])
  assert.ok(h.requests.every(x=>x.method==='GET'))
  assert.equal(h.auth.getSavedAuthResult().user.role,'admin')
})

test('read-only native reads use target header; writes never leave client; exit discards late target reads',async()=>{
  const h=harness(),sid='10000000-0000-4000-8000-000000000001'
  h.auth.saveAuthResult(authFixture('teacher'))
  const view=h.load('utils/read-only-context')
  view.setReadOnlyContext({kind:'student',id:sid,role:'student',name:'合成',businessId:'JCS-SYNTHETIC',operatorUserId:id,readToken:'ro.synthetic',expiresAt:'2099-01-01'})
  const api=h.load('utils/request')
  await assert.rejects(api.request('/me/classroom/plans','PUT',{}),/read_only_write_forbidden/)
  assert.equal(h.requests.length,0)
  const read=api.request('/me/classroom?stage=junior-spring')
  assert.equal(h.requests.length,1)
  assert.equal(h.requests[0].header['X-Jiuchen-Read-Only-Target'],'student:'+sid)
  assert.equal(h.requests[0].header.Authorization,'Bearer ro.synthetic')
  assert.equal(h.requests[0].method,'GET')
  view.clearReadOnlyContext();h.respond(0,{ok:true})
  await assert.rejects(read,/session_changed/)
  assert.equal(h.auth.getSavedAuthResult().user.role,'teacher')
})

test('read-only views are in a lazy package and do not expose editing or AI action buttons',()=>{
 const app=JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8'))
 const pack=app.subpackages.find(p=>p.root==='packages/read-only')
 assert.deepEqual(Array.from(pack.pages),['view/view'])
 const view=fs.readFileSync(path.join(root,'packages/read-only/view/view.wxml'),'utf8')
 const source=fs.readFileSync(path.join(root,'packages/read-only/view/view.ts'),'utf8')
 const teacher=fs.readFileSync(path.join(root,'pages/teacher-students/teacher-students.ts'),'utf8')
 const admin=fs.readFileSync(path.join(root,'pages/admin/admin.wxml'),'utf8')
 assert.match(view,/确认目标身份的只读权限/)
 assert.doesNotMatch(view,/学员空间镜像|mirror-tabs|student-tabbar/)
 assert.match(source,/switchTab/)
 assert.match(teacher,/packages\/read-only\/view\/view/)
 assert.match(admin,/只读切换/)
 assert.doesNotMatch(view, /bindtap="on(?:Save|RunAssessment|Pay|Upload|Approve|Reject)/)
 assert.doesNotMatch(source,/saveAuthResult\(|setApiSessionToken\(|request\([^)]*,\s*'POST'/)
 // WXML must never contain double-nested braces; these break real preview uploads.
 assert.doesNotMatch(view,/\{\{(?:(?!\}\})[\s\S])*\{\{/)
})

test('expired read token returns to the original session and target data never enters the growth cache',async()=>{
 const h=harness();h.auth.saveAuthResult(authFixture('admin'))
 const view=h.load('utils/read-only-context'),target='10000000-0000-4000-8000-000000000001'
 view.setReadOnlyContext({kind:'student',id:target,role:'student',name:'合成学员',businessId:'JCS-SYNTHETIC',operatorUserId:id,readToken:'ro.synthetic',expiresAt:'2099-01-01'})
 let writes=0;h.wx.setStorage=()=>writes++
 const cache=h.load('utils/growth-profile-cache')
 assert.equal(await cache.getCachedGrowthProfileBootstrap(),null)
 await cache.saveGrowthProfileBootstrap({privateTarget:'must-not-cache'});assert.equal(writes,0)
 const read=h.load('utils/request').request('/me/profile')
 h.respond(0,{ok:false,error:'unauthorized'},401)
 await assert.rejects(read,/unauthorized/)
 assert.equal(view.isReadOnly(),false);assert.equal(h.auth.getSavedAuthResult().session.token,'test-session')
 const profile=h.page('pages/profile/profile')
 view.setReadOnlyContext({kind:'student',id:target,role:'student',name:'合成学员',businessId:'JCS-SYNTHETIC',operatorUserId:id,readToken:'ro.second',expiresAt:'2099-01-01'})
 profile.onExitReadOnly();assert.equal(view.isReadOnly(),false);assert.equal(h.navigations.at(-1).url,'/pages/index/index')
 assert.equal(h.auth.getSavedAuthResult().user.role,'admin')
})

test('admin identity roster uses protected canonical projection without unrelated news/analytics APIs',async()=>{
 const h=harness()
 h.auth.saveAuthResult(authFixture('admin'))
 const admin=h.page('pages/admin/admin')
 admin.initializeAdmin({section:'admin-readonly'})
 assert.equal(h.requests.length,1)
 assert.ok(h.requests[0].url.includes('/me/admin/read-only-directory'))
 h.respond(0,{ok:true,students:[{id:'unclaimed',name:'未认领学员',canView:false}],teachers:[],isolatedUnclaimedSeedCount:21})
 await new Promise(resolve=>setImmediate(resolve))
 admin.onReadOnlyStudent({currentTarget:{dataset:{id:'unclaimed'}}})
 assert.equal(h.navigations.length,0)
 assert.ok(h.requests.every(r=>!r.url.includes('/me/admin/news')))
})
test('student homepage preserves action routes and shows real daily states',()=>{
 const home=fs.readFileSync(path.join(root,'pages/index/index.wxml'),'utf8')
 const ts=fs.readFileSync(path.join(root,'pages/index/index.ts'),'utf8')
 assert.match(home,/进入我的规划/)
 for(const name of ['我的规划','保研资讯','AI 评估','联系顾问','院校库'])assert.ok(home.includes(name))
 assert.match(ts,/onPrimary\(\) \{[\s\S]*?openSlot\('plan'\)/)
 assert.match(home,/本周完整课表/)
 assert.match(home,/当天没有匹配课程/)
 assert.match(ts,/plan\.id \? '已保存'/)
 assert.match(ts,/getLatestScheduleImport\(stageCode\)/)
 assert.match(ts,/dailyScheduleView\(this\.homeSchedule, this\.data\.scheduleDay\)/)
 assert.match(ts,/getMyClassroom\(\)/)
 const css=fs.readFileSync(path.join(root,'pages/index/index.wxss'),'utf8')
 assert.match(css,/\.action-row,\.service-link\{[^}]*width:49%/)
 assert.match(css,/\.home-card\{[^}]*background:#fffdf9/)
})
test('unbound school consultation copies the correct school and identifies missing binding',async()=>{
 const h=harness();h.auth.saveAuthResult(authFixture('admin'))
 h.runtimeConfig.wechatCustomerService={corpId:'test-corp',url:'https://test.invalid/kefu'}
 let copied='',opened=null
 h.wx.setClipboardData=opts=>{copied=opts.data;opts.success?.()}
 h.wx.openCustomerServiceChat=opts=>{opened=opts}
 const p=h.page('packages/schools/detail/detail');p.onLoad({id:'s015'})
 const flow=p.onConsultSchool()
 h.respond(0,{ok:true,user:authFixture('admin').user,businessIdentity:null})
 await settle()
 assert.match(copied,/学校：复旦大学/)
 assert.match(copied,/学生：未认领/)
 assert.equal(opened,null)
 assert.equal(p.data.consultBusy,true)
 h.modals[0].success({confirm:true});await flow
 assert.equal(opened.showMessageCard,true)
 assert.equal(opened.sendMessagePath,'/pages/index/index')
 assert.equal(p.data.consultBusy,false)
})
test('school inquiry stops when identity validation fails',async()=>{
 const h=harness();h.auth.saveAuthResult(authFixture('teacher'))
 let opened=false,copied=false;h.wx.openCustomerServiceChat=()=>{opened=true};h.wx.setClipboardData=()=>{copied=true}
 const p=h.page('packages/schools/detail/detail');p.onLoad({id:'s015'})
 const flow=p.onConsultSchool();h.respond(0,{error:'unauthorized'},401);await flow
 assert.equal(opened,false);assert.equal(copied,false)
})
test('student school consultation copies the requested stage and major after authenticating without a classroom fetch',async()=>{
 const h=harness();h.auth.saveAuthResult(authFixture('student'))
 h.runtimeConfig.wechatCustomerService={corpId:'test-corp',url:'https://test.invalid/kefu'}
 let copied='',opened=null;h.wx.setClipboardData=opts=>{copied=opts.data;opts.success?.()};h.wx.openCustomerServiceChat=opts=>{opened=opts}
 const p=h.page('packages/schools/detail/detail');p.onLoad({id:'s009'})
 const flow=p.onConsultSchool()
 assert.equal(h.requests.length,1);assert.match(h.requests[0].url,/auth\/me/)
 h.respond(0,{ok:true,user:authFixture('student').user,businessIdentity:{businessId:'JCS-TEST-0001',status:'claimed',type:'student'}})
 await settle();assert.equal(h.requests.length,2);assert.match(h.requests[1].url,/me\/profile/)
 h.respond(1,{ok:true,profile:{university:'测试大学',major:'测试专业',currentGrade:'大四',enrollmentYear:2022}})
 await settle()
 for(const text of ['学校：南开大学','学校阶段：大四','专业：测试专业','用户ID：JCS-TEST-0001','咨询问题：请填写'])assert.ok(copied.includes(text),text)
 assert.ok(!copied.includes('入学年份：2022'))
 assert.doesNotMatch(copied,/test-session|undefined|null/)
 h.modals[0].success({confirm:true});await flow;assert.ok(opened)
})
test('school consultation never copies a profile response after switching account',async()=>{
 const h=harness();h.auth.saveAuthResult(authFixture('student'))
 let copied=false;h.wx.setClipboardData=()=>{copied=true}
 const p=h.page('packages/schools/detail/detail');p.onLoad({id:'s009'})
 const flow=p.onConsultSchool();h.respond(0,{ok:true,user:authFixture().user,businessIdentity:{businessId:'JCS-TEST',status:'claimed',type:'student'}})
 await settle();h.auth.saveAuthResult(authFixture('student',secondId,'second-session'))
 h.respond(1,{ok:true,profile:{university:'旧账号大学'}});await flow;assert.equal(copied,false)
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
 assert.equal(h.requests.length,1)
 assert.ok(h.requests.every(x=>x.method==='GET'))
 h.respond(0,{ok:true,students:[{id, name:'学生甲',university:'中南大学',major:'能动',canView:true}],teachers:[{id:secondId,name:'老师乙',title:'顾问',status:'active',canView:true}],isolatedUnclaimedSeedCount:21})
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
 assert.match(source,/wx:if="\{\{!assessmentReady && !readOnly\}\}".*bindtap="onCompleteProfile"/)
 assert.match(source,/只读查看 · 不能编辑资料或运行 AI 评估/)
 assert.match(fs.readFileSync(path.join(root,'pages/classroom/classroom.wxml'),'utf8'),/地点：\{\{item.location \|\| '暂无'\}\}/)
 assert.match(page,/onCompleteProfile\(\)/)
})
test('PKU media/map are real sourced assets and consultation uses the shared chat entry',()=>{
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
 assert.match(service,/openCustomerServiceChat/)
 assert.match(service,/showMessageCard:true/)
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
 assert.equal(opened,null,'chat opens on the second explicit user click')
 h.modals[1].success({confirm:true})
 assert.equal(opened.showMessageCard,true)
 assert.equal(opened.sendMessagePath,'/pages/index/index')
 assert.match(opened.sendMessageTitle,/测试管理员/)
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
})

test('customer service keeps mine mounted and sends a card targeting a public page',async()=>{
 const h=harness();h.auth.saveAuthResult(authFixture('admin'))
 h.runtimeConfig.wechatCustomerService={corpId:'test-corp',url:'https://test.invalid/kefu'}
 h.wx.setClipboardData=o=>o.success()
 let opened;h.wx.openCustomerServiceChat=o=>{opened=o}
 const p=h.page('pages/profile/profile');p.onShow()
 h.respond(0,{ok:true,user:authFixture('admin').user,businessIdentity:null})
 await settle()
 assert.equal(p.data.shellPhase,'ready')
 p.setData({favoritesVisible:true,favorites:[{postId:'saved'}]})
 p.onCustomerServiceTap()
 assert.equal(p.data.shellPhase,'ready')
 assert.equal(p.data.favoritesVisible,true)
 h.respond(h.requests.length-1,{ok:true,user:authFixture('admin').user,businessIdentity:null})
 await settle()
 assert.equal(p.data.shellPhase,'ready')
 h.modals[0].success({confirm:true})
 assert.equal(opened,undefined)
 h.modals[1].success({confirm:true})
 assert.equal(opened.showMessageCard,true)
 assert.equal(opened.sendMessagePath,'/pages/index/index')
 h.wx.getAccountInfoSync=()=>({miniProgram:{envVersion:'release'}})
 h.load('utils/customer-service').openWechatCustomerService({title:'已发布入口',path:'/pages/index/index'})
 assert.equal(opened.showMessageCard,true)
 assert.equal(opened.sendMessagePath,'/pages/index/index')
})

test('news stays native while saved originals open at WeChat and retain a native reader action',()=>{
 const h=harness(),favorite={postId:id,articleUrl:'https://mp.weixin.qq.com/s/bad',title:'测试'}
 const news=h.page('pages/news/news');news.setData({favorites:[favorite]})
 news.onFavoriteTap({currentTarget:{dataset:{id}}})
 assert.equal(h.navigations.at(-1).url,`/pages/news-detail/news-detail?id=${id}`)
 const mine=h.page('pages/profile/profile');mine.setData({favorites:[favorite]})
 let original='';h.wx.openOfficialAccountArticle=o=>{original=o.url}
 mine.onFavoriteOpen({currentTarget:{dataset:{id}}})
 assert.equal(original,favorite.articleUrl)
 mine.onFavoriteReader({currentTarget:{dataset:{id}}})
 assert.equal(h.navigations.at(-1).url,`/pages/news-detail/news-detail?id=${id}`)
})

test('cancel favorite reports the server error and succeeds on a subsequent attempt',async()=>{
 const h=harness();h.auth.saveAuthResult(authFixture())
 const p=h.page('pages/news-detail/news-detail')
 p.setData({post:{id,favoritesEnabled:true},favoritesReady:true,favorited:true})
 const failed=p.onToggleFavorite()
 assert.equal(h.requests[0].method,'POST')
 assert.match(h.requests[0].url,/\/remove$/)
 h.respond(0,{error:'service_unavailable'},503);await failed
 assert.match(p.data.favoriteError,/503\/service_unavailable/)
 assert.equal(p.data.favorited,true)
 const retried=p.onToggleFavorite();h.respond(1,{ok:true});await retried
 assert.equal(p.data.favorited,false)
 assert.equal(p.data.favoriteError,'')
})

test('administrator can preview unclassified news from the management list',()=>{
 const h=harness();h.auth.saveAuthResult(authFixture('admin'))
 const page=h.page('pages/admin/admin');page.setData({posts:[{id}]})
 page.onPreviewNews({currentTarget:{dataset:{id}}})
 assert.equal(h.navigations.at(-1).url,`/pages/news-detail/news-detail?id=${id}`)
 const wxml=fs.readFileSync(path.join(root,'pages/admin/admin.wxml'),'utf8')
 assert.match(wxml,/bindtap="onPreviewNews">预览正文/)
})

test('administrator news tab opens the reading list after server role validation',async()=>{
 const h=harness();h.auth.saveAuthResult(authFixture('admin'))
 const page=h.page('pages/news/news');page.onShow()
 h.respond(0,{ok:true,user:authFixture('admin').user,businessIdentity:null})
 await settle()
 assert.equal(page.data.shellKind,'admin')
 assert.equal(page.data.showReferenceNews,true)
 assert.match(h.requests[1].url,/\/news$/)
})

test('customer-service failure shows the platform error and one click retry',()=>{
 const h=harness();h.runtimeConfig.wechatCustomerService={corpId:'corp',url:'https://test.invalid/kefu'}
 const attempts=[];h.wx.openCustomerServiceChat=o=>attempts.push(o)
 h.load('utils/customer-service').openWechatCustomerService()
 attempts[0].fail({errMsg:'openCustomerServiceChat:fail -1001'})
 assert.match(h.modals[0].content,/-1001/)
 h.modals[0].success({confirm:true})
 assert.equal(attempts.length,2)
 attempts[1].fail({errMsg:'network unavailable'})
 assert.equal(h.modals[1].showCancel,false)
})

test('saved official link opens in a runtime without URL and falls back to copy when unavailable',()=>{
 const h=harness();let opened, copied, toast
 h.wx.showToast=o=>{toast=o.title}
 h.wx.openOfficialAccountArticle=o=>{opened=o.url}
 h.wx.setClipboardData=o=>{copied=o.data;o.success()}
 const {openOfficialArticle}=h.load('utils/official-article')
 const url='https://mp.weixin.qq.com/s/ul2gk6Xo1TKi_PXvgRpqBA'
 openOfficialArticle(url)
 assert.equal(opened,url)
 delete h.wx.openOfficialAccountArticle
 openOfficialArticle(url)
 assert.equal(copied,url)
 assert.match(h.modals[0].content,/粘贴链接/)
 openOfficialArticle('https://example.invalid/s/a')
 assert.match(toast,/不是可验证/)
})

test('product list and detail use the same verified customer-service entry',async()=>{
 for(const route of ['pages/products/products','pages/product-detail/product-detail']){
  const h=harness();h.auth.saveAuthResult(authFixture('student'))
  const p=h.page(route)
  p.onCustomerServiceTap()
  assert.equal(h.requests.length,1)
  assert.match(h.requests[0].url,/\/auth\/me/)
  h.respond(0,{ok:true,user:authFixture('student').user,businessIdentity:null})
  await settle()
  assert.match(h.requests[1].url,/\/me\/profile$/)
  h.respond(1,{ok:true,profile:{university:'中南大学',major:'计算机',currentGrade:'大二',enrollmentYear:2024,gpaText:null,rankText:null}})
  await settle()
  assert.match(h.modals[0].content,/服务方案咨询/)
 }
})

test('student consultation reviews the server name and academic fields before sending a short card',async()=>{
 const h=harness();h.auth.saveAuthResult(authFixture('student'))
 h.runtimeConfig.wechatCustomerService={corpId:'corp',url:'https://test.invalid/kefu'}
 let copied='',opened;h.wx.setClipboardData=o=>{copied=o.data;o.success()};h.wx.openCustomerServiceChat=o=>{opened=o}
 h.page('pages/profile/profile').onCustomerServiceTap()
 h.respond(0,{ok:true,user:{...authFixture('student').user,displayName:'李同学'},businessIdentity:{businessId:'JCS-ABCD-1234',status:'claimed',type:'student'}})
 await settle()
 assert.match(h.requests[1].url,/\/me\/profile$/)
 h.respond(1,{ok:true,profile:{university:'中南大学',major:'人工智能',currentGrade:'大二',enrollmentYear:2024,gpaText:'3.8',rankText:'10/100'}})
 await settle()
 assert.match(h.modals[0].content,/联系人：李同学/)
 assert.match(h.modals[0].content,/本科院校：中南大学/)
 assert.match(h.modals[0].content,/绩点\/均分：3.8/)
 h.modals[0].success({confirm:true})
 assert.match(copied,/专业方向：人工智能/)
 assert.equal(opened,undefined)
 h.modals[1].success({confirm:true})
 assert.equal(opened.showMessageCard,true)
 assert.equal(opened.sendMessagePath,'/pages/index/index')
 assert.match(opened.sendMessageTitle,/李同学/)
})

test('the student can save their own name and refresh server identity',async()=>{
 const h=harness();h.auth.saveAuthResult(authFixture('student'))
 const page=h.page('pages/profile-edit/profile-edit')
 page.setData({nameInput:'李同学'})
 const flow=page.onSaveName()
 assert.equal(h.requests[0].method,'PUT')
 assert.match(h.requests[0].url,/\/me\/display-name$/)
 h.respond(0,{ok:true,displayName:'李同学'})
 await settle()
 assert.match(h.requests[1].url,/\/auth\/me$/)
 h.respond(1,{ok:true,user:{...authFixture('student').user,displayName:'李同学'},businessIdentity:null})
 await flow
 assert.equal(h.auth.getSavedAuthResult().user.displayName,'李同学')
})
