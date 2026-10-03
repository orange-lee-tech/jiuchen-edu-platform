#!/usr/bin/env node
import { access, appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'

const DATA_ROOT = 'data-source/cases/ai/evaluation/v1.0.0'
const RUN_ROOT = 'data-source/cases/ai/evaluation/runs'
const DIMS = ['academic_strength','language_strength','research_strength','competition_strength','practice_strength']

function argsOf(argv) {
  const out = { _: [] }
  for (let i=0;i<argv.length;i++) {
    const t=argv[i]
    if (!t.startsWith('--')) { out._.push(t); continue }
    const j=t.indexOf('=')
    if (j>0) { out[t.slice(2,j)]=t.slice(j+1); continue }
    const k=t.slice(2), n=argv[i+1]
    if (n && !n.startsWith('--')) { out[k]=n; i++ } else out[k]=true
  }
  return out
}
const yes=(v,d=false)=>v===undefined?d:v===true||['1','true','yes','on'].includes(String(v).toLowerCase())
const int=(v,d)=>Number.isFinite(Number.parseInt(v,10))?Number.parseInt(v,10):d
const num=(v,d)=>Number.isFinite(Number(v))?Number(v):d
const exists=async p=>{try{await access(p);return true}catch{return false}}

async function jsonl(path) {
  const text=await readFile(path,'utf8')
  return text.split(/\r?\n/).filter(Boolean).map((line,i)=>{try{return JSON.parse(line)}catch(e){throw new Error(`invalid_jsonl:${path}:${i+1}:${e.message}`)}})
}
async function putJson(path,value){await writeFile(path,JSON.stringify(value,null,2)+'\n','utf8')}

function extractJson(text) {
  const s=String(text??'').trim(), a=s.indexOf('{'), b=s.lastIndexOf('}')
  if(a<0||b<=a) throw new Error('model_response_missing_json')
  return JSON.parse(s.slice(a,b+1))
}
function textOf(content) {
  if(typeof content==='string') return content
  if(!Array.isArray(content)) return ''
  return content.map(x=>x&&typeof x.text==='string'?x.text:'').filter(Boolean).join('\n')
}
function scoreValue(v) {
  if(v===null||v===undefined) return null
  if(['na','n/a','null','unknown','信息不足','无法判断'].includes(String(v).trim().toLowerCase())) return null
  const n=Number(v); return Number.isInteger(n)&&n>=1&&n<=5?n:null
}
function prediction(raw={}) {
  return {
    discipline: raw.discipline==null?null:String(raw.discipline).trim()||null,
    ...Object.fromEntries(DIMS.map(k=>[k,scoreValue(raw[k])])),
    overall_competitiveness: scoreValue(raw.overall_competitiveness),
    uncertainties:Array.isArray(raw.uncertainties)?raw.uncertainties.filter(x=>typeof x==='string').slice(0,8):[],
  }
}
const builtinPrompt=()=>[
  '你是九辰教育保研评估标签器。你的任务不是自由发挥，而是严格复现九辰 Expert Label V1 业务规则。',
  '通用：只根据当前学生资料；不使用或猜测最终保研去向；不输出录取概率；不输出推理过程；信息不足用null。',
  'discipline只能是工学、理学、医学、人文、社科、农学、艺术学或null。建筑学归工学，产品设计/视觉传达等归艺术学，英语/汉语言/历史/哲学/新闻传播类归人文，法学/经济/金融/管理/教育/心理/体育等归社科。',
  'academic_strength：优先推免综合/综合排名；<=3%=5，>3%且<=10%=4，>10%且<=20%=3，>20%且<=35%=2，>35%=1。只有GPA/平均分无可换算排名则null；“年级前十”但无总人数等无法换算百分比则null；评奖要求前X%不能当本人排名。',
  'language_strength：CET6>=580=5，530-579=4，480-529=3，425-479=2，<425或明确未通过=1；IELTS>=7或TOEFL>=100=5；其他未定义换算则null。',
  'research_strength：缺失=null，明确无科研=1；基础参与=2；完整项目且工作明确=3；核心成员/负责人或较好论文专利项目成果=4；突出成果且核心贡献明确=5。',
  'competition_strength：缺失=null，明确无竞赛=1；普通参与/校级=2；省级有效或校级高等级或全国奖级不清=3；国家级有效获奖或省级最高等级=4；国家/国际一等奖金奖冠军或多项全国高等级成果=5。',
  'practice_strength：当前V1评测输入没有稳定独立实践/实习字段，一律null。',
  'overall_competitiveness：当前V1未定义官方总体Ground Truth，一律null。',
  '必须只返回完整JSON，不要Markdown/前言/尾注。',
  '{"discipline":"工学|理学|医学|人文|社科|农学|艺术学"|null,"academic_strength":1|2|3|4|5|null,"language_strength":1|2|3|4|5|null,"research_strength":1|2|3|4|5|null,"competition_strength":1|2|3|4|5|null,"practice_strength":null,"overall_competitiveness":null,"uncertainties":string[]}'
].join('\n')

function provider(args){
  return {
    provider:String(args.provider??process.env.EVAL_AI_PROVIDER??'openai-compatible'),
    baseUrl:String(args['base-url']??process.env.EVAL_AI_BASE_URL??'').trim().replace(/\/+$/,''),
    apiKey:String(process.env.EVAL_AI_API_KEY??'').trim(),
    model:String(args.model??process.env.EVAL_AI_MODEL??'').trim(),
  }
}
function options(args){
  let extra={}
  if(process.env.EVAL_AI_EXTRA_BODY_JSON) extra=JSON.parse(process.env.EVAL_AI_EXTRA_BODY_JSON)
  return {
    concurrency:Math.max(1,int(args.concurrency??process.env.EVAL_CONCURRENCY,2)),
    timeoutMs:Math.max(1000,int(args['timeout-ms']??process.env.EVAL_TIMEOUT_MS,60000)),
    retries:Math.max(0,Math.min(5,int(args.retries??process.env.EVAL_RETRIES,2))),
    backoffMs:Math.max(100,int(args['retry-backoff-ms']??process.env.EVAL_RETRY_BACKOFF_MS,1000)),
    maxTokens:Math.max(128,int(args['max-tokens']??process.env.EVAL_MAX_TOKENS,900)),
    temperature:num(args.temperature??process.env.EVAL_TEMPERATURE,0),
    jsonMode:yes(args['json-mode']??process.env.EVAL_JSON_MODE,false), extra,
  }
}
function pricing(){
  const a=Number(process.env.EVAL_PRICE_INPUT_PER_MILLION), c=Number(process.env.EVAL_PRICE_CACHED_INPUT_PER_MILLION), b=Number(process.env.EVAL_PRICE_OUTPUT_PER_MILLION)
  return {input:Number.isFinite(a)?a:null,cachedInput:Number.isFinite(c)?c:null,output:Number.isFinite(b)?b:null,currency:process.env.EVAL_PRICE_CURRENCY||'CNY'}
}
function usageOf(u){
  u=u&&typeof u==='object'?u:{}
  const input=Number(u.prompt_tokens??u.input_tokens??0)||0,output=Number(u.completion_tokens??u.output_tokens??0)||0
  const cached=Number(u.prompt_tokens_details?.cached_tokens??u.input_tokens_details?.cached_tokens??u.cached_tokens??0)||0
  const reasoning=Number(u.completion_tokens_details?.reasoning_tokens??u.output_tokens_details?.reasoning_tokens??0)||0
  return{input,output,cached:Math.min(input,Math.max(0,cached)),reasoning:Math.max(0,reasoning),total:Number(u.total_tokens??input+output)||input+output}
}
function estimateCost(usage,price){
  if(!usage||price.input===null||price.output===null)return null
  const u=usageOf(usage),cachedPrice=price.cachedInput??price.input,uncached=Math.max(0,u.input-u.cached)
  return(uncached*price.input+u.cached*cachedPrice+u.output*price.output)/1e6
}
function retryAfterMs(value){
  if(!value)return 0
  const seconds=Number(value)
  if(Number.isFinite(seconds)&&seconds>=0)return seconds*1000
  const at=Date.parse(value)
  return Number.isFinite(at)?Math.max(0,at-Date.now()):0
}
function transientProviderError(e){
  const status=Number(e?.status),code=String(e?.cause?.code??e?.code??'')
  return e?.name==='AbortError'||[408,425,429].includes(status)||(status>=500&&status<=599)||e?.message==='provider_empty_response'||e?.message==='fetch failed'||['ECONNRESET','ETIMEDOUT','EAI_AGAIN','ENETUNREACH','ECONNREFUSED'].includes(code)
}
function latestByEvalId(rows){const byId=new Map();for(const row of rows)byId.set(row.eval_id,row);return[...byId.values()]}
function latencyStats(rows){
  const v=rows.map(x=>Number(x.latency_ms)).filter(Number.isFinite).sort((a,b)=>a-b)
  if(!v.length)return{n:0,mean_ms:null,p95_ms:null}
  return{n:v.length,mean_ms:Number((v.reduce((a,b)=>a+b,0)/v.length).toFixed(1)),p95_ms:v[Math.max(0,Math.ceil(v.length*.95)-1)]}
}
function aggregateRecords(rows){
  const successes=rows.filter(x=>!x.error&&x.prediction),failures=rows.filter(x=>x.error||!x.prediction)
  let input=0,output=0,cached=0,reasoning=0,cost=0,costRows=0,usageMissing=0
  for(const row of successes){
    if(row.usage){const u=usageOf(row.usage);input+=u.input;output+=u.output;cached+=u.cached;reasoning+=u.reasoning}else usageMissing++
    if(Number.isFinite(Number(row.estimated_cost))){cost+=Number(row.estimated_cost);costRows++}
  }
  const errorTypes={};for(const row of failures){const k=String(row.error??'unknown_error');errorTypes[k]=(errorTypes[k]??0)+1}
  return{
    completed:rows.length,succeeded:successes.length,errors:failures.length,error_types:errorTypes,
    usage:{input_tokens:input,output_tokens:output,cached_input_tokens:cached,reasoning_tokens:reasoning,usage_missing:usageMissing},
    estimated_cost_total:successes.length===costRows?Number(cost.toFixed(6)):null,
    estimated_cost_partial:Number(cost.toFixed(6)),
    cost_rows:costRows,
    latency:latencyStats(rows),
  }
}

async function ask(row,system,cfg,opt){
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),opt.timeoutMs)
  try{
    const body={...opt.extra,model:cfg.model,messages:[{role:'system',content:system},{role:'user',content:`评测样本ID：${row.eval_id}\n学生资料：\n${JSON.stringify(row.input_profile)}\n只输出标签JSON。`}],temperature:opt.temperature,max_tokens:opt.maxTokens,stream:false}
    if(opt.jsonMode&&body.response_format===undefined) body.response_format={type:'json_object'}
    const res=await fetch(`${cfg.baseUrl}/chat/completions`,{method:'POST',headers:{Authorization:`Bearer ${cfg.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal})
    const bodyText=await res.text()
    if(!res.ok){const e=new Error(`provider_http_${res.status}`);e.status=res.status;e.detail=bodyText.slice(0,500);e.retryAfterMs=retryAfterMs(res.headers.get('retry-after'));throw e}
    const payload=JSON.parse(bodyText), content=textOf(payload?.choices?.[0]?.message?.content)
    if(!content) throw new Error('provider_empty_response')
    let parsed
    try {
      parsed=extractJson(content)
    } catch (error) {
      if (error && typeof error==='object') {
        error.detail=content.slice(0,1200)
      }
      throw error
    }
    return {prediction:prediction(parsed),usage:payload.usage??null,requestId:res.headers.get('x-request-id')??res.headers.get('x-dashscope-request-id')??payload.id??null}
  }finally{clearTimeout(timer)}
}
async function askRetry(ctx){
  let last
  for(let i=0;i<=ctx.opt.retries;i++){
    try{return await ask(ctx.row,ctx.system,ctx.cfg,ctx.opt)}catch(e){last=e;const retry=transientProviderError(e);if(!retry||i===ctx.opt.retries)break;await new Promise(r=>setTimeout(r,Math.max(ctx.opt.backoffMs*2**i,Number(e?.retryAfterMs)||0)))}
  }
  throw last
}
async function parallel(items,n,worker){let cursor=0;await Promise.all(Array.from({length:n},async()=>{while(true){const i=cursor++;if(i>=items.length)return;await worker(items[i],i)}}))}

function select(rows,args){
  let out=rows
  const subset=String(args.subset??'all'); if(subset!=='all')out=out.filter(x=>x.subset===subset)
  if(args['case-id']){const ids=new Set(String(args['case-id']).split(',').map(x=>x.trim()).filter(Boolean));out=out.filter(x=>ids.has(x.eval_id))}
  if(args['exclude-case-id']){const ids=new Set(String(args['exclude-case-id']).split(',').map(x=>x.trim()).filter(Boolean));out=out.filter(x=>!ids.has(x.eval_id))}
  const offset=Math.max(0,int(args.offset,0)),limit=Math.max(0,int(args.limit,0));return out.slice(offset,limit?offset+limit:undefined)
}
function metric(){return{n:0,exact:0,within:0,unscored:0,abstain:0}}
function score(preds,expected){
  const byId=new Map(expected.map(x=>[x.eval_id,x])),groups={}
  const get=name=>groups[name]??=( {rows:0,errors:0,discipline:metric(),dims:Object.fromEntries(DIMS.map(k=>[k,metric()]))} )
  for(const p of preds){const e=byId.get(p.eval_id);if(!e)continue;for(const name of ['all',e.subset??p.subset??'unknown']){const g=get(name);g.rows++;if(p.error||!p.prediction){g.errors++;continue}const v=prediction(p.prediction),truth=e.expected_rule_labels??{},mask=e.label_mask??{};const dm=g.discipline;if(mask.discipline){dm.n++;if(v.discipline===truth.discipline)dm.exact++}else{dm.unscored++;if(v.discipline===null)dm.abstain++}for(const k of DIMS){const m=g.dims[k],pv=v[k],tv=scoreValue(truth[k]);if(mask[k]){m.n++;if(pv===tv)m.exact++;if(pv!==null&&tv!==null&&Math.abs(pv-tv)<=1)m.within++}else{m.unscored++;if(pv===null)m.abstain++}}}}
  const r=(a,b)=>b?Number((a/b).toFixed(4)):null
  return Object.fromEntries(Object.entries(groups).map(([name,g])=>[name,{rows:g.rows,error_rate:r(g.errors,g.rows),discipline:{n:g.discipline.n,exact:r(g.discipline.exact,g.discipline.n),cautious_abstention:r(g.discipline.abstain,g.discipline.unscored)},dimensions:Object.fromEntries(DIMS.map(k=>{const m=g.dims[k];return[k,{n:m.n,exact:r(m.exact,m.n),within_one:r(m.within,m.n),cautious_abstention:r(m.abstain,m.unscored)}]}))}]))
}
function report(summary,meta){
  const out=['# 九辰 Evaluation Report','',`- Run: \`${meta.run_id}\``,`- Provider: \`${meta.provider}\``,`- Model: \`${meta.model}\``,'','> Core 与专项扩展分开看，不合成单一总准确率。','']
  for(const [name,g] of Object.entries(summary)){out.push(`## ${name}`,'',`- 样本：${g.rows}`,`- 错误率：${g.error_rate??'NA'}`,`- 学科Exact：${g.discipline.exact??'NA'}（n=${g.discipline.n}）`,'','|维度|n|Exact|±1档|无参考时克制率|','|---|---:|---:|---:|---:|');for(const k of DIMS){const m=g.dimensions[k];out.push(`|${k}|${m.n}|${m.exact??'NA'}|${m.within_one??'NA'}|${m.cautious_abstention??'NA'}|`)}out.push('')}
  return out.join('\n')+'\n'
}

async function scoreRun(runDir,expectedPath){
  const preds=latestByEvalId(await jsonl(resolve(runDir,'predictions.jsonl'))),expected=await jsonl(expectedPath),summary=score(preds,expected)
  let meta={run_id:basename(runDir),provider:'unknown',model:'unknown'};const mp=resolve(runDir,'run_config.json');if(await exists(mp))meta={...meta,...JSON.parse(await readFile(mp,'utf8'))}
  await putJson(resolve(runDir,'score_summary.json'),summary);await writeFile(resolve(runDir,'report.md'),report(summary,meta),'utf8');return summary
}

async function inspect(args){
  const root=resolve(String(args['data-root']??DATA_ROOT)),inputs=await jsonl(resolve(String(args.input??`${root}/eval_inputs.jsonl`))),expected=await jsonl(resolve(String(args.expected??`${root}/eval_expected_rule_labels.jsonl`)))
  const ids=new Set(expected.map(x=>x.eval_id)),coverage={};for(const k of ['discipline',...DIMS,'overall_competitiveness'])coverage[k]=expected.filter(x=>x.label_mask?.[k]).length
  return{ok:inputs.every(x=>ids.has(x.eval_id)),rows:inputs.length,expected_rows:expected.length,subsets:Object.fromEntries([...new Set(inputs.map(x=>x.subset))].map(s=>[s,inputs.filter(x=>x.subset===s).length])),label_coverage:coverage}
}

async function run(args){
  const root=resolve(String(args['data-root']??DATA_ROOT)),inputPath=resolve(String(args.input??`${root}/eval_inputs.jsonl`)),expectedPath=resolve(String(args.expected??`${root}/eval_expected_rule_labels.jsonl`)),rows=select(await jsonl(inputPath),args),cfg=provider(args),opt=options(args),mock=yes(args.mock,false),dry=yes(args['dry-run'],false)
  if(!mock&&!dry&&(!cfg.baseUrl||!cfg.apiKey||!cfg.model))throw new Error('missing_provider_config:set EVAL_AI_BASE_URL/EVAL_AI_API_KEY/EVAL_AI_MODEL')
  const system=args['system-prompt']?(await readFile(resolve(String(args['system-prompt'])),'utf8')).trim():builtinPrompt(),runRoot=resolve(String(args['run-root']??RUN_ROOT)),runId=String(args['run-id']??`${new Date().toISOString().replace(/[:.]/g,'-')}_${(cfg.model||'mock').replace(/[^\w.-]+/g,'-')}`),runDir=resolve(String(args['run-dir']??`${runRoot}/${runId}`));await mkdir(runDir,{recursive:true})
  const meta={run_id:runId,created_at:new Date().toISOString(),provider:cfg.provider,base_url:cfg.baseUrl||null,model:cfg.model||(mock?'mock':null),api_key_present:Boolean(cfg.apiKey),data_root:root,requested_rows:rows.length,options:opt,mock,dry_run:dry};await putJson(resolve(runDir,'run_config.json'),meta)
  if(dry){const plan={ok:true,run_dir:runDir,rows:rows.length,model:cfg.model||null};await putJson(resolve(runDir,'dry_run_plan.json'),plan);return plan}
  const predPath=resolve(runDir,'predictions.jsonl'),errorPath=resolve(runDir,'errors.jsonl'),existing=(await exists(predPath))?await jsonl(predPath):[],done=new Set(latestByEvalId(existing).filter(x=>!x.error&&x.prediction).map(x=>x.eval_id)),pending=rows.filter(x=>!done.has(x.eval_id)),price=pricing();let chain=Promise.resolve(),inputTokens=0,outputTokens=0,cachedTokens=0,reasoningTokens=0,cost=0,costKnown=false,errors=0,usageMissing=0
  const append=(path,v)=>chain=chain.then(()=>appendFile(path,JSON.stringify(v)+'\n','utf8'))
  await parallel(pending,opt.concurrency,async row=>{const start=Date.now();try{const result=mock?{prediction:prediction({}),usage:null,requestId:'mock'}:await askRetry({row,system,cfg,opt}),u=usageOf(result.usage);if(result.usage){inputTokens+=u.input;outputTokens+=u.output;cachedTokens+=u.cached;reasoningTokens+=u.reasoning}else usageMissing++;const est=estimateCost(result.usage,price);if(est!==null){cost+=est;costKnown=true}await append(predPath,{eval_id:row.eval_id,subset:row.subset,provider:cfg.provider,model:cfg.model||(mock?'mock':null),prediction:result.prediction,usage:result.usage,estimated_cost:est,request_id:result.requestId,latency_ms:Date.now()-start})}catch(e){errors++;const rec={eval_id:row.eval_id,subset:row.subset,error:e?.message??String(e),status:e?.status??null,detail:e?.detail??null,latency_ms:Date.now()-start};await append(predPath,rec);await append(errorPath,rec)}});await chain
  const selectedIds=new Set(rows.map(x=>x.eval_id)),finalRecords=(await exists(predPath))?latestByEvalId(await jsonl(predPath)).filter(x=>selectedIds.has(x.eval_id)):[],totals=aggregateRecords(finalRecords)
  const scores=await scoreRun(runDir,expectedPath),summary={ok:true,run_id:runId,run_dir:runDir,requested_rows:rows.length,skipped_by_resume:rows.filter(x=>done.has(x.eval_id)).length,processed_now:pending.length,errors_now:errors,errors_total:totals.errors,error_types:totals.error_types,usage:{input_tokens_now:inputTokens,output_tokens_now:outputTokens,cached_input_tokens_now:cachedTokens,reasoning_tokens_now:reasoningTokens,usage_missing_now:usageMissing,estimated_cost_now:costKnown?Number(cost.toFixed(6)):null,input_tokens_total:totals.usage.input_tokens,output_tokens_total:totals.usage.output_tokens,cached_input_tokens_total:totals.usage.cached_input_tokens,reasoning_tokens_total:totals.usage.reasoning_tokens,usage_missing_total:totals.usage.usage_missing,estimated_cost_total:totals.estimated_cost_total,estimated_cost_partial:totals.estimated_cost_partial,cost_rows:totals.cost_rows,currency:price.currency},latency:totals.latency,score_groups:Object.keys(scores)};await putJson(resolve(runDir,'run_summary.json'),summary);return summary
}

function help(){console.log(`\nJiuchen Evaluation Runner\n\nnode tools/evaluation/runner.mjs inspect\nnode tools/evaluation/runner.mjs run --dry-run\nnode tools/evaluation/runner.mjs run --subset core_representative --limit 10\nnode tools/evaluation/runner.mjs run --model qwen3.8-flash --concurrency 2\nnode tools/evaluation/runner.mjs score --run-dir <run-dir>\n\nEnv: EVAL_AI_PROVIDER EVAL_AI_BASE_URL EVAL_AI_API_KEY EVAL_AI_MODEL\nOptional: EVAL_AI_EXTRA_BODY_JSON EVAL_PRICE_INPUT_PER_MILLION EVAL_PRICE_CACHED_INPUT_PER_MILLION EVAL_PRICE_OUTPUT_PER_MILLION\nFlags: --subset --limit --offset --case-id --exclude-case-id --concurrency --timeout-ms --retries --temperature --max-tokens --json-mode --system-prompt --run-id --run-dir --mock --dry-run\n`)}

const args=argsOf(process.argv.slice(2)),cmd=args._[0]??'help'
try{
  if(cmd==='inspect')console.log(JSON.stringify(await inspect(args),null,2))
  else if(cmd==='run')console.log(JSON.stringify(await run(args),null,2))
  else if(cmd==='score'){if(!args['run-dir'])throw new Error('--run-dir required');const root=resolve(String(args['data-root']??DATA_ROOT)),expected=resolve(String(args.expected??`${root}/eval_expected_rule_labels.jsonl`));console.log(JSON.stringify(await scoreRun(resolve(String(args['run-dir'])),expected),null,2))}
  else help()
}catch(e){console.error('[evaluation-runner]',e?.stack??e);process.exitCode=1}
