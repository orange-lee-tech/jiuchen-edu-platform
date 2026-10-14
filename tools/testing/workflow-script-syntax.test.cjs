const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process')
for(const filename of ['news-v2-mysql-gate.yml','profile-mysql-gate.yml'])test(filename+' embedded migration/restore scripts parse without executing MySQL',()=>{
 const source=fs.readFileSync(path.resolve(__dirname,'../../.github/workflows',filename),'utf8').replace(/\r\n/g,'\n')
 const scripts=[...source.matchAll(/^ {10}node --input-type=module <<'JS'\n([\s\S]*?)^ {10}JS$/gm)]
 assert.ok(scripts.length>0,'missing inline Node script blocks')
 for(const match of scripts){
  const script=match[1].replace(/^ {10}/gm,'')
  const result=spawnSync(process.execPath,['--input-type=module','--check'],{input:script,encoding:'utf8'})
  assert.equal(result.status,0,result.stderr)
 }
 assert.match(source,/mysqldump.*--single-transaction/)
 assert.match(source,/DISPOSABLE_.*BACKUP_RESTORE_PASS/)
})
