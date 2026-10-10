#!/usr/bin/env node
// The miniprogram catalog is authoritative. Create/check the compact API mirror
// at build/review time, never by extra runtime I/O or an always-on sync process.
const fs=require('node:fs')
const path=require('node:path')
const root=path.resolve(__dirname,'../..')
const input=fs.readFileSync(path.join(root,'apps/miniprogram/miniprogram/packages/schools/data.ts'),'utf8')
const tupleMatch=input.match(/const tuples:[^=]+=\s*(\[[\s\S]*?\])\s*\/\/ 77 non-985 211 entries/)
const otherMatch=input.match(/^const other211:[^\n]*= (\[\[.*\]\])$/m)
if(!tupleMatch||!otherMatch)throw new Error('school_catalog_source_format_changed')
const first=JSON.parse(tupleMatch[1]),second=JSON.parse(otherMatch[1])
if(first.length!==39||second.length!==77)throw new Error('school_roster_count_changed_review_before_regeneration')
const rows=[...first.map((r,i)=>({id:'s'+String(i+1).padStart(3,'0'),name:r[0],is985:true})),
  ...second.map((r,i)=>({id:'s'+String(i+40).padStart(3,'0'),name:r[0],is985:false}))]
if(new Set(rows.map(r=>r.name)).size!==rows.length)throw new Error('school_roster_duplicate_names')
const text='/** Generated from apps/miniprogram/miniprogram/packages/schools/data.ts.\n'+
' * Run node tools/testing/generate-school-directory.cjs; do not hand-edit.\n'+
' * Only historically listed membership facts; NOT year-specific admissions policy.\n'+
' */\nexport const MOE_PROJECT_ROSTER = '+JSON.stringify(rows,null,2)+' as const\n'
const out=path.join(root,'services/api/src/data/school-directory.generated.ts')
if(process.argv.includes('--check')){
  if(!fs.existsSync(out)||fs.readFileSync(out,'utf8')!==text)
    throw new Error('school_directory_api_mirror_out_of_sync_run_generator')
  process.stdout.write('school roster mirror verified: '+rows.length+' records\n')
}else{
  fs.writeFileSync(out,text)
  process.stdout.write('wrote '+out+' ('+rows.length+' records)\n')
}
