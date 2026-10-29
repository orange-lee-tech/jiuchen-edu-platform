// Disposable synthetic MySQL fixture only; never point this at production.
import assert from 'node:assert/strict'
import mysql from 'mysql2/promise'
import { readAiBalanceSnapshots, recordAiBalance } from '../services/ai-balance-ledger.js'

const url=process.env.DATABASE_URL
if (!url || new URL(url).hostname !== '127.0.0.1' || !new URL(url).pathname.endsWith('/closeout_test')) throw new Error('isolated_fixture_required')
const pool=mysql.createPool(url)
try {
  await pool.query('CREATE TABLE assessment_key_objects (id varchar(36) PRIMARY KEY, provider varchar(120) NOT NULL)')
  await pool.query(`CREATE TABLE assessment_ai_price_versions (id varchar(36) PRIMARY KEY, currency char(3),
    input_cache_hit_per_million decimal(16,6),input_cache_miss_per_million decimal(16,6),output_per_million decimal(16,6),
    peak_input_cache_miss_per_million decimal(16,6),peak_output_per_million decimal(16,6))`)
  await pool.query(`CREATE TABLE assessment_ai_calls (id varchar(36) PRIMARY KEY,object_id varchar(36),price_version varchar(36),provider varchar(120),model varchar(120),
    usage_state varchar(40),prompt_tokens bigint,completion_tokens bigint,cache_hit_tokens bigint,cache_miss_tokens bigint,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,completed_at timestamp NULL)`)
  await pool.query("INSERT INTO assessment_key_objects VALUES ('object-1','synthetic')")
  await pool.query("INSERT INTO assessment_ai_price_versions VALUES ('price-1','CNY',1,2,4,NULL,NULL)")
  const verifiedAt=new Date(Math.floor((Date.now()-86400000)/1000)*1000)
  const id=await recordAiBalance(pool,'admin-1',{objectId:'object-1',currency:'CNY',balance:'5.000000',
    warningThreshold:'1.000000',verifiedAt:verifiedAt.toISOString(),note:'synthetic'})
  assert.ok(id)
  await pool.query("INSERT INTO assessment_ai_calls VALUES ('call-1','object-1','price-1','synthetic','model-1','returned',100,50,10,90,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)")
  let result=await readAiBalanceSnapshots(pool,'object-1')
  assert.equal(Number(result.estimate?.estimatedSpend),0.00039)
  assert.equal(Number(result.estimate?.estimatedRemaining),4.99961)
  assert.equal(result.estimate?.unknownCalls,0)
  assert.equal(result.estimate?.models[0]?.model,'model-1')
  assert.equal(Number(result.estimate?.models[0]?.estimatedSpend),0.00039)
  await pool.query("INSERT INTO assessment_ai_calls VALUES ('call-2','object-1',NULL,'synthetic','model-1','unknown',NULL,NULL,NULL,NULL,CURRENT_TIMESTAMP,NULL)")
  result=await readAiBalanceSnapshots(pool,'object-1')
  assert.equal(result.estimate?.estimatedRemaining,null)
  assert.equal(result.estimate?.unknownCalls,1)
  await pool.query("INSERT INTO assessment_ai_calls VALUES ('call-3','object-1','price-1','synthetic','model-1','returned',100,50,10,90,?,?)",
    [new Date(verifiedAt.getTime()+30000),new Date(verifiedAt.getTime()+40000)])
  result=await readAiBalanceSnapshots(pool,'object-1')
  assert.equal(result.estimate?.unknownCalls,2)
  assert.equal(Number(result.estimate?.estimatedSpend),0.00039)
  console.info('CLOSEOUT_COST_ESTIMATE_MYSQL_PASS exact_decimal=true unknown_cost_not_zero=true')
} finally { await pool.end() }
