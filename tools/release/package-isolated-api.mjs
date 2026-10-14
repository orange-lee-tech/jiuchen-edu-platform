import {execFileSync} from 'node:child_process'
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {createHash} from 'node:crypto'
import {gunzipSync} from 'node:zlib'
const [rootArg,sha,outArg]=process.argv.slice(2)
const production='8cc4bb85ffdf3e86e7a13a89d119f1b110491e48'
if(!rootArg||!outArg||!sha||!/^[a-f0-9]{40}$/.test(sha))throw new Error('usage: node package-isolated-api.mjs CANDIDATE_ROOT EXACT_SHA OUTPUT_DIRECTORY')
const root=resolve(rootArg),out=resolve(outArg)
const git=(...args)=>execFileSync('git',['-C',root,...args],{maxBuffer:16*1024*1024})
git('merge-base','--is-ancestor',production,sha)
if(git('rev-parse',sha+'^{commit}').toString().trim()!==sha)throw new Error('candidate_sha_mismatch')
if(git('status','--porcelain','--untracked-files=normal').toString().trim())throw new Error('candidate_not_clean')
const paths=['services/api','tools/testing/generate-school-directory.cjs','apps/miniprogram/miniprogram/packages/schools/data.ts']
const rows=git('ls-tree','-rz',sha,'--',...paths).toString().split('\0').filter(Boolean)
const files=rows.map(row=>{
 const match=row.match(/^(\d+) blob ([0-9a-f]+)\t(.+)$/s)
 if(!match||!['100644','100755'].includes(match[1]))throw new Error('non_regular_tree_entry')
 const name=match[3]
 if(name.startsWith('/')||/^[A-Za-z]:|\\/.test(name)||name.split('/').includes('..'))throw new Error('unsafe_path')
 if(/(^|\/)(node_modules|dist|data-source|\.git)(\/|$)/.test(name)||/(^|\/)\.env(?!\.example$)|\.(pem|key|p12|pfx|crt|cer)$/i.test(name))throw new Error('private_or_generated_path')
 return {path:name,blob:match[2],mode:match[1]}
})
mkdirSync(out,{recursive:true})
const archive=join(out,'jiuchen-api-'+sha+'.tar.gz')
git('archive','--format=tar.gz','--output='+archive,sha,'--',...paths)
const compressed=readFileSync(archive),tar=gunzipSync(compressed,{maxOutputLength:64*1024*1024})
const expected=new Set(files.map(file=>file.path)),found=new Set()
for(let offset=0;offset+512<=tar.length;){
 const header=tar.subarray(offset,offset+512);if(header.every(value=>value===0))break
 const str=(a,b)=>header.subarray(a,b).toString().replace(/\0.*$/s,'')
 const name=[str(345,500),str(0,100)].filter(Boolean).join('/'),kind=str(156,157)
 const size=parseInt(str(124,136).trim()||'0',8)
 if(!Number.isSafeInteger(size)||size<0||offset+512+size>tar.length)throw new Error('invalid_tar_size')
 if(name.startsWith('/')||/^[A-Za-z]:|\\/.test(name)||name.split('/').includes('..'))throw new Error('unsafe_tar_path')
 if(kind==='0'||kind===''){
  if(!expected.has(name)||found.has(name))throw new Error('unexpected_or_duplicate_archive_file')
  found.add(name)
 }else if(!['5','g'].includes(kind))throw new Error('links_or_special_archive_entry')
 offset+=512+Math.ceil(size/512)*512
}
if(found.size!==expected.size)throw new Error('archive_manifest_incomplete')
const manifest={candidateSha:sha,sourceProductionSha:production,archive:archive.split(/[\\/]/).at(-1),sha256:createHash('sha256').update(compressed).digest('hex'),archiveBytes:compressed.length,
 runtimePaths:['services/api'],testOnlyPaths:paths.slice(1),privateEnvironmentIncluded:false,privateCasesIncluded:false,nodeModulesIncluded:false,distIncluded:false,
 changeFiles:git('diff','--name-only',production,sha).toString().trim().split('\n'),files,
 status:'REVIEW_ARTIFACT_ONLY_NOT_PRODUCTION_APPROVED'}
writeFileSync(join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n')
console.log(JSON.stringify({candidateSha:sha,sha256:manifest.sha256,archiveBytes:compressed.length,files:files.length,status:manifest.status}))
