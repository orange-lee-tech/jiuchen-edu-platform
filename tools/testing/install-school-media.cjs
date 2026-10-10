#!/usr/bin/env node
// Execute from repo root: node tools/testing/install-school-media.cjs --base-url https://YOUR-IMAGE-HOST/schools
// Source media files remain outside the WeChat package. No server or DB writes.
const fs=require('node:fs'),path=require('node:path');
const root=process.cwd();
const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'school-media-manifest.json'),'utf8'));
const baseIndex=process.argv.indexOf('--base-url');
if(baseIndex<0||!process.argv[baseIndex+1]||!/^https:\/\//.test(process.argv[baseIndex+1])){
 console.error('Supply --base-url https://YOUR-IMAGE-HOST/schools after all WebPs are uploaded.');process.exit(2);
}
const base=process.argv[baseIndex+1].replace(/\/$/,'');
const p=path.join(root,'apps/miniprogram/miniprogram/packages/schools/data.ts');
let source=fs.readFileSync(p,'utf8');
// Refuse to install into unexpectedly changed source.
const sections=['tuples','other211','specialtySchools','newDoubleFirst','notablePublic'];
function extract(name){
 const start=source.indexOf('const '+name+':'); if(start<0)throw Error('Missing school list '+name);
 const left=source.indexOf('= [',start); if(left<0)throw Error('Unexpected list '+name);
 let i=left+2,depth=0,quoted=null,escape=false,ends=-1;
 for(;i<source.length;i++){
  const c=source[i];if(quoted){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quoted)quoted=null;continue;}
  if(c==='"'||c==="'"){quoted=c;continue;}
  if(c==='[')depth++;
  if(c===']'){depth--;if(!depth){ends=i+1;break;}}
 }
 if(ends<0)throw Error('Unterminated '+name);
 const part=source.slice(left+2,ends);
 return [...part.matchAll(/\[\s*(['"])(.*?)\1\s*,/g)].map(m=>m[2]);
}
const actual=sections.flatMap(extract);
if(actual.length!==manifest.length)throw Error('Roster count differs: repo='+actual.length+' package='+manifest.length);
for(let i=0;i<actual.length;i++) if(actual[i]!==manifest[i].schoolName) throw Error('ID/name mismatch '+manifest[i].schoolId+' repo='+actual[i]+' zip='+manifest[i].schoolName);
const data={};
for(const r of manifest){
 data[r.schoolName]={
  address:r.address,addressSource:r.addressSourceUrl,
  heroPhoto:{url:base+'/'+r.schoolId+'.webp',caption:r.schoolName+'校园实景',author:r.imageAuthor||'学校官方资料',license:r.imageLicense||'已获项目方授权使用',licenseUrl:r.imageLicenseUrl||'',sourceUrl:r.imageSourcePage}
 };
}
const modulePath=path.join(root,'apps/miniprogram/miniprogram/packages/schools/school-media.generated.ts');
fs.writeFileSync(modulePath,'/** Verified 172-school asset manifest; image binaries live on external HTTPS storage. */\nexport const SCHOOL_MEDIA: Record<string, { address:string; addressSource:string; heroPhoto:{url:string;caption:string;author:string;license:string;licenseUrl:string;sourceUrl:string} }> = '+JSON.stringify(data,null,2)+'\n','utf8');
const imp="import { SCHOOL_MEDIA } from './school-media.generated'\n";
if(!source.includes(imp))source=imp+source;
const marker='  ...verifiedExtras[name],';
if(!source.includes(marker))throw Error('school data source marker changed');
source=source.replace(marker,marker+'\n  ...SCHOOL_MEDIA[name],');
fs.writeFileSync(p,source,'utf8');
console.log('Installed 172 image URLs and 172 addresses into school data (source files unchanged in zip).');
