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

test('industry circles include all seven defense universities and all nine law institutions', () => {
  const groups = school.match(/\{ key: 'law',[^\n]+\}|\{ key: 'defense7',[^\n]+\}/g) || []
  assert.equal(groups.length,2)
  const law = groups.find(x=>x.includes("key: 'law'"))
  const defense = groups.find(x=>x.includes("key: 'defense7'"))
  for(const [text,count] of [[law,9],[defense,7]]) {
    const members = [...text.matchAll(/'([^']+)'/g)].map(match=>match[1]).slice(3)
    assert.equal(members.length,count)
  }
  const specials = ['华东政法大学','西南政法大学','西北政法大学']
  for(const university of specials) assert.ok(school.includes("['"+university+"'"))
  const directory = fs.readFileSync(path.join(mini,'packages/schools/directory/directory.ts'),'utf8')
  assert.match(directory,/group:value as SchoolGroupKey.*level:'all'/)
  assert.match(directory,/previewFilter\(/)
  assert.match(directory,/draftRegion:[\s\S]*?draftGroup/)

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

test('catalog preserves source evidence and excludes fabricated analytics', () => {
  assert.match(school, /www\.moe\.gov\.cn\/srcsite\/A22/)
  assert.match(school, /cge\.bit\.edu\.cn/)
  const detail = fs.readFileSync(path.join(mini,'packages/schools/detail/detail.wxml'),'utf8')
  assert.match(detail, /教育部 \{\{school.is985 \? '985' : '211'\}\} 工程原始名单/)
  assert.match(detail, /项目数量和关注数/)
  assert.match(detail, /教育部|已核验|学院/)
})

test('catalog starter data budget remains small for 1.8 GiB shared ECS', () => {
  const folder = path.join(mini,'packages/schools')
  let sum = 0
  for (const part of ['data.ts','directory/directory.ts','directory/directory.wxml','directory/directory.wxss','detail/detail.ts','detail/detail.wxml','detail/detail.wxss']) {
    sum += fs.statSync(path.join(folder,part)).size
  }
  assert.ok(sum < 256 * 1024, 'starter source exceeded 256KiB budget')
})

test('school WXML does not nest mustache expressions inside other expressions', () => {
  // WXML does not support {{...{{...}}...}} even when inner braces occur in
  // a quoted fallback string. TypeScript checks cannot detect this preview blocker.
  for (const page of ['directory/directory.wxml', 'detail/detail.wxml']) {
    const content = fs.readFileSync(path.join(mini, 'packages/schools', page), 'utf8')
    assert.doesNotMatch(content, /\{\{(?:(?!\}\})[\s\S])*\{\{/, page + ': nested WXML expression')
  }
  const detail = fs.readFileSync(path.join(mini, 'packages/schools/detail/detail.wxml'), 'utf8')
  assert.match(detail, /<text wx:if="\{\{hasIntro\}\}" class="intro-text">\{\{school\.intro\}\}<\/text>/)
  assert.match(detail,/bindtap="onConsultSchool"/)
  assert.match(detail,/<map class="campus-map"/)
  assert.match(detail,/heroPhoto\.url/)
  assert.match(detail, /<text wx:else class="intro-text">已收录/)
})

test('all seven defense universities have precise campus POI source metadata', () => {
  const names = ['北京航空航天大学','北京理工大学','哈尔滨工业大学',
    '哈尔滨工程大学','西北工业大学','南京航空航天大学','南京理工大学']
  const verified = school.split('const verifiedExtras: Record<string, Partial<School>> = {')[1] || ''
  for (const name of names) {
    const start = verified.indexOf('"' + name + '": {')
    assert.ok(start>=0, name + ' missing campus metadata')
    const next = verified.indexOf('\n  },',start)
    const snippet = verified.slice(start,next)
    assert.match(snippet,/"mapLocation"/,name)
    assert.match(snippet,/"sourceUrl": "https:\/\/[^"]+"/,name)
    assert.match(snippet,/"latitude": [-\d.]+, "longitude": [-\d.]+/,name)
  }
})

test('second-round Double First Class source is exactly 147, no duplicate original institution', () => {
 const m=school.match(/export const DOUBLE_FIRST_CLASS_2022 = `([^`]+)`\.split\('、'\)/)
 assert.ok(m,'missing audited 147-name official dataset')
 const official=m[1].split('、')
 assert.equal(official.length,147)
 assert.equal(new Set(official).size,147)
 const supplemented=school.match(/const newDoubleFirst: ReadonlyArray<readonly \[string,string,string\]> = (\[[\s\S]*?\])\n\/\*\* Selective/)
 assert.ok(supplemented,'missing non-211 double-first entries')
 const added=[...supplemented[1].matchAll(/\['([^']+)','([^']+)','([^']+)'\]/g)].map(x=>x[1])
 assert.equal(added.length,32)
 const historic=new Set([...rows,...extras].map(x=>x[0]))
 const display=new Set([...historic,...added].map(n=>n==='上海体育大学'?'上海体育学院':n))
 display.delete('华北电力大学（保定）')
 assert.deepEqual([...official].sort(),[...display].sort())
 assert.match(school,/doubleFirstSet\.has/)
})
test('all 15 sector group definitions are explicit and sourced when relevant', () => {
 const groupPart=school.split('export const SCHOOL_GROUPS:')[1].split('const groupMembership')[0]
 const keys=[...groupPart.matchAll(/\{ key: '([^']+)'/g)].map(x=>x[1])
 assert.equal(keys.length,15)
 assert.equal(new Set(keys).size,15)
 for(const key of ['architecture8','mechanical4','electric2','teachers6'])
   assert.ok(keys.includes(key),key)
})
test('drawer fixes stale scroll trap with explicit scroll height and staged AND controls',()=>{
 const wxml=fs.readFileSync(path.join(mini,'packages/schools/directory/directory.wxml'),'utf8')
 const wxss=fs.readFileSync(path.join(mini,'packages/schools/directory/directory.wxss'),'utf8')
 const ts=fs.readFileSync(path.join(mini,'packages/schools/directory/directory.ts'),'utf8')
 assert.match(wxss,/\.filter-scroll\{[^}]*height:55vh/)
 assert.match(wxss,/\.filter-panel\{[^}]*min-height:0/)
 assert.match(wxml,/scroll-y="\{\{true\}\}"/)
 assert.match(wxml,/bindtap="onFilterApply"/)
 for(const key of ['onFilterRegion','onFilterLevel','onFilterGroup','onFilterAffiliation','onFilterSchool','onFilterQuery'])
   assert.ok(wxml.includes('bindtap="'+key+'"')||wxml.includes('bindinput="'+key+'"'),key)
 assert.match(ts,/draftRegion:this\.data\.region/)
 assert.match(ts,/affiliation:this\.data\.draftAffiliation/)
})

test('audited Ministry of Education and ethnic-affairs university rosters stay complete',()=>{
 const moe=school.match(/\{key:'moe',label:'教育部',sourceUrl:'[^']+',\s*members:`([^`]+)`\.split\('、'\)/)
 assert.ok(moe)
 const ministry=moe[1].split('、')
 assert.equal(ministry.length,75)
 assert.equal(new Set(ministry).size,75)
 assert.match(school,/国家民委[^\n]+/)
 for(const u of ['中央民族大学','中南民族大学','西南民族大学','西北民族大学','北方民族大学','大连民族大学'])
   assert.ok(school.includes(u),u)
})
