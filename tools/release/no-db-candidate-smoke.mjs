import {spawnSync} from 'node:child_process'
import {existsSync} from 'node:fs'
import {resolve} from 'node:path'
const root=resolve(process.argv[2]||''),cwd=resolve(root,'services/api')
if(!process.argv[2]||!existsSync(resolve(cwd,'dist/app.js'))||existsSync(resolve(cwd,'.env')))throw new Error('built_candidate_without_env_required')
const program=`
import {buildApp} from './dist/app.js';import {loadEnv} from './dist/config/env.js';
const app=buildApp(loadEnv({NODE_ENV:'production'}));const samples=[];
try{
 const config=(await app.inject('/health/config')).json();
 for(const key of ['databaseUrlConfigured','splitDatabaseConfigComplete','assessmentBackgroundExecution','assessmentAiConfigured','scheduleAiConfigured','customerAiConfigured'])if(config.config[key])throw new Error('unsafe_config_'+key);
 const address=await app.listen({host:'127.0.0.1',port:0});
 for(let i=0;i<30;i++){const response=await fetch(address+'/health');const data=await response.json();if(response.status!==200||data.dependencies.database!=='not_configured')throw new Error('unsafe_health');samples.push(process.memoryUsage().rss)}
 console.log('CANDIDATE_SMOKE='+JSON.stringify({status:'NO_DB_SMOKE_PASS',isolatedLoopback:true,requests:30,heapLimitMiB:160,peakSampledRssBytes:Math.max(...samples),maxRssKiB:process.resourceUsage().maxRSS,resourceObservation:Math.max(...samples)>=256*1024*1024?'OVER_PRODUCTION_LIMIT_ON_THIS_HOST':'BELOW_LIMIT_ON_THIS_HOST_NOT_ECS_ACCEPTANCE',databaseConfigured:false,backgroundExecution:false,cgroup256MiBVerified:false}));
}finally{await app.close()}`
const cleanEnv={}
for(const key of ['PATH','SystemRoot','WINDIR','TEMP','TMP'])if(process.env[key])cleanEnv[key]=process.env[key]
const result=spawnSync(process.execPath,['--max-old-space-size=160','--input-type=module','-e',program],{cwd,env:cleanEnv,encoding:'utf8',timeout:30000,maxBuffer:1024*1024})
const receipt=result.stdout?.split('\n').find(line=>line.startsWith('CANDIDATE_SMOKE='))
if(result.status!==0||!receipt){console.error('NO_DB_SMOKE_FAILED: '+(result.error?.code||result.signal||result.status));process.exitCode=1}
else console.log(receipt.slice('CANDIDATE_SMOKE='.length))
