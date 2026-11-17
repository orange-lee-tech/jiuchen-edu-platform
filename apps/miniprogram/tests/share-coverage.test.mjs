import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import Module from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const root = path.resolve(import.meta.dirname, '../miniprogram')
const app = JSON.parse(readFileSync(path.join(root, 'app.json'), 'utf8'))
const routes = [...app.pages, ...app.subpackages.flatMap(pkg => pkg.pages.map(page => `${pkg.root}/${page}`))]

test('all 27 registered pages have one pair of share callbacks and lifecycle-safe native menu', () => {
  assert.equal(routes.length, 27)
  assert.ok(existsSync(path.join(root, 'assets/jiuchen-visual-v1/banners/today-campus-hero.png')))
  for (const route of routes) {
    const source = readFileSync(path.join(root, `${route}.ts`), 'utf8')
    for (const name of ['onShareAppMessage', 'onShareTimeline', 'onShow', 'onHide', 'onUnload']) {
      assert.equal((source.match(new RegExp(`\\b${name}\\(\\)`, 'g')) || []).length, 1, `${route}: ${name}`)
    }
    assert.match(source, /enableNativeShare\('/, route)
    assert.match(source, /disableNativeShare\(this\)/, route)
    if (!['pages/index/index', 'pages/brand/brand'].includes(route)) {
      assert.ok(source.includes(`friendShare('${route}', this)`), route)
      assert.ok(source.includes(`return timelineShare('${route}', this)`), route)
    }
  }
  for (const route of ['pages/index/index', 'pages/brand/brand']) {
    const source = readFileSync(path.join(root, `${route}.ts`), 'utf8')
    assert.match(source, /关于九辰教育|九辰保研｜让保研规划更清晰/)
    assert.match(source, /imageUrl: '\/assets\/jiuchen-visual-v1\/banners\/today-campus-hero.png'/)
  }
})

const filename = path.join(root, 'utils/native-share.ts')
const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const loaded = new Module(filename)
loaded.filename = filename
loaded.paths = Module._nodeModulePaths(path.dirname(filename))
loaded._compile(compiled, filename)
const { friendShare, timelineShare, enableNativeShare, disableNativeShare } = loaded.exports

test('share paths keep only validated public IDs and never leak private or unknown options', () => {
  const id = '11111111-1111-4111-8111-111111111111'
  assert.equal(friendShare('pages/news-detail/news-detail', { data: { post: { id, token: 'private' } } }).path,
    `/pages/news-detail/news-detail?id=${id}`)
  assert.equal(friendShare('pages/news-detail/news-detail', { data: { post: { id: 'secret' } } }).path, '/pages/index/index')
  assert.equal(friendShare('pages/product-detail/product-detail', { documentKey: 'public-key', data: { view: {} } }).path,
    '/pages/product-detail/product-detail?documentKey=public-key')
  assert.equal(friendShare('packages/schools/detail/detail', { data: { school: { id: 's001' } } }).path,
    '/packages/schools/detail/detail?id=s001')
  assert.equal(friendShare('pages/assessment-result/assessment-result', { data: { recordId: id } }).path,
    '/pages/assessment-history/assessment-history')
  assert.equal(friendShare('packages/read-only/view/view', { data: { id } }).path, '/pages/index/index')
  assert.equal(friendShare('pages/assessment-form/assessment-form', { data: { draftId: id } }).path,
    '/pages/assessment-form/assessment-form')
  assert.equal('path' in timelineShare('pages/index/index', {}), false)
  assert.equal(timelineShare('pages/news-detail/news-detail', { data: { post: { id } } }).query, `id=${id}`)
})

test('native copy listener uses safe query and is removed on leave', () => {
  let handler, removed = 0, menus
  globalThis.wx = {
    showShareMenu(options) { menus = options.menus },
    onCopyUrl(callback) { handler = callback },
    offCopyUrl() { removed += 1 },
  }
  const page = { data: { post: { id: '11111111-1111-4111-8111-111111111111', token: 'secret' } } }
  enableNativeShare('pages/news-detail/news-detail', page)
  assert.deepEqual(menus, ['shareAppMessage', 'shareTimeline'])
  assert.deepEqual(handler(), { query: 'id=11111111-1111-4111-8111-111111111111' })
  disableNativeShare(page)
  assert.equal(removed, 1)
  assert.equal(page.nativeCopyUrlHandler, undefined)
})
