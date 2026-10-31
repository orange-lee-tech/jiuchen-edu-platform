import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { parseDeepseekPriceDraft } from './deepseek-price-parser.js'
const html=readFileSync(new URL('./fixtures/deepseek-pricing-20261030.html',import.meta.url),'utf8')
test('official token-table fixture parses both models and all cache/peak/offpeak prices as review-only drafts',()=>{
  const drafts=parseDeepseekPriceDraft(html)
  assert.deepEqual(drafts.map(row=>row.model),['deepseek-flash','deepseek-v4-pro'])
  assert.deepEqual([drafts[0].inputCacheHitPerMillion,drafts[0].inputCacheMissPerMillion,drafts[0].outputPerMillion,
    drafts[0].peakInputCacheHitPerMillion,drafts[0].peakInputCacheMissPerMillion,drafts[0].peakOutputPerMillion],
    [.003,.15,.6,.006,.3,1.2])
  assert.equal(drafts[1].peakInputCacheHitPerMillion,.044)
  assert.equal(drafts[1].outputPerMillion,1.98)
  assert.equal(drafts[1].currency,'USD');assert.equal(drafts[1].unit,'per_1000000_tokens')
})
test('changed currency, layout, peak rules and missing rates cannot silently become prices',()=>{
  for(const broken of [html.replace('$0.003','¥0.003'),html.replace('MODEL','RENAMED'),
    html.replace('01:00 - 04:00','02:00 - 05:00'),html.replace('$3.96','unavailable')])
    assert.throws(()=>parseDeepseekPriceDraft(broken))
})
