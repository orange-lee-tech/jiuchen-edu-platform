const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const mini = path.join(root, 'apps/miniprogram/miniprogram')
const school = fs.readFileSync(path.join(mini, 'packages/schools/data.ts'), 'utf8')
const app = JSON.parse(fs.readFileSync(path.join(mini, 'app.json'), 'utf8'))

const rowSource = school.match(/const tuples: ReadonlyArray<readonly \[string,string,string,string\]> = (\[[\s\S]*?\])\n\/\/ 77 non-985/)
const c9Source = school.match(/const c9Schools = new Set\((\[[\s\S]*?\])\)/)
assert.ok(rowSource, 'source data must be a compact literal list of Ministry-verified entries')
assert.ok(c9Source, 'C9 subset must have an explicit named source')
const rows = JSON.parse(rowSource[1])
const c9Names = JSON.parse(c9Source[1])
const extraSource = school.match(/const other211: ReadonlyArray<readonly \[string,string,string\]> = (\[[^;]+?\])\nconst historicalAliases/)
assert.ok(extraSource, 'missing complete 211 extra list')
const extras = JSON.parse(extraSource[1])

test('original 985 source has 39 unique schools, C9 exactly nine, extra 211 has 77', () => {
  assert.equal(rows.length, 39)
  const names = rows.map(row => row[0])
  assert.equal(new Set(names).size, 39)
  assert.equal(extras.length,77)
  assert.equal(new Set([...names,...extras.map(row=>row[0])]).size,116)
  assert.ok(extras.some(row=>row[0]==='华北电力大学（保定）'))
  assert.equal(c9Names.length, 9)
  assert.equal(new Set(c9Names).size, 9)
  for (const name of c9Names) assert.ok(names.includes(name), name)
  for (const row of rows) {
    assert.equal(row.length, 4)
    assert.ok(row.every(value => typeof value === 'string' && value.trim()))
  }
  assert.ok(names.includes('南京大学'))
  assert.ok(names.includes('中南大学'))
})

test('schools are isolated in a lazy mini-program subpackage and reachable through Opportunity', () => {
  const pkg = (app.subpackages || app.subPackages || []).find(pkg => pkg.root === 'packages/schools')
  assert.ok(pkg, 'school catalog may not bloat main app bundle')
  assert.deepEqual(pkg.pages, ['directory/directory', 'detail/detail'])
  for (const route of pkg.pages) {
    for (const ext of ['ts', 'wxml', 'wxss', 'json']) {
      assert.ok(fs.existsSync(path.join(mini,pkg.root,route+'.'+ext)), route+'.'+ext)
    }
  }
  const news = fs.readFileSync(path.join(mini,'pages/news/news.ts'),'utf8')
  assert.match(news, /packages\/schools\/directory\/directory/)
})

test('catalog preserves source evidence and does not pretend to have fake analytics, campus photography or map', () => {
  assert.match(school, /www\.moe\.gov\.cn\/srcsite\/A22/)
  assert.match(school, /cge\.bit\.edu\.cn/)
  const detail = fs.readFileSync(path.join(mini,'packages/schools/detail/detail.wxml'),'utf8')
  assert.match(detail, /教育部 \{\{school.is985 \? '985' : '211'\}\} 工程原始名单/)
  assert.match(detail, /项目数、关注数/)
  assert.doesNotMatch(detail, /<image\b/)
})

test('catalog starter data budget remains small for 1.8 GiB shared ECS', () => {
  const folder = path.join(mini,'packages/schools')
  let sum = 0
  for (const part of ['data.ts','directory/directory.ts','directory/directory.wxml','directory/directory.wxss','detail/detail.ts','detail/detail.wxml','detail/detail.wxss']) {
    sum += fs.statSync(path.join(folder,part)).size
  }
  assert.ok(sum < 256 * 1024, 'starter source exceeded 256KiB budget')
})
