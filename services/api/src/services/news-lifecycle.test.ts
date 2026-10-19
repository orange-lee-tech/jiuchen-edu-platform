import test from 'node:test'
import assert from 'node:assert/strict'
import { planNewsWindow, shouldCreateRetirementEvent, type DisplayCandidate, type DisplayState } from './news-lifecycle.js'

const now = new Date('2026-10-12T00:00:00Z')
const rows = (n: number): DisplayCandidate[] => Array.from({ length:n },(_,i)=>({id:'post-'+String(i).padStart(2,'0'),sortTime:new Date(now.getTime()-i*1000).toISOString(),approved:true,hidden:false}))
const states = (n:number): DisplayState[] => rows(n).map(r=>({postId:r.id,phase:'normal',bufferedAt:null,retireAt:null}))

test('new 1, 3 or 30 posts replace exactly that many of 30; one batch reminder',()=>{
  for(const count of [1,3,30]){
    const incoming=rows(count).map((r,i)=>({...r,id:'new-'+i,sortTime:new Date(now.getTime()+count-i).toISOString()}))
    const plan=planNewsWindow([...rows(30),...incoming],states(30),now,true)
    assert.equal(plan.normalIds.length,30)
    assert.equal(plan.entered.length,count)
    assert.equal(plan.leaving.length,count)
    assert.equal(plan.leaving.every(r=>r.retireAt==='2026-10-15T00:00:00.000Z'),true)
    assert.equal(shouldCreateRetirementEvent(plan),true)
    const repeat=planNewsWindow([...rows(30),...incoming],[...states(30).filter(r=>!plan.changes.some(c=>c.postId===r.postId)),...plan.changes],new Date(now.getTime()+1000),true)
    assert.equal(repeat.leaving.length,0);assert.equal(shouldCreateRetirementEvent(repeat),false)
  }
})

test('incomplete source and unapproved posts cannot cause mass retirement',()=>{
  assert.equal(planNewsWindow(rows(0),states(20),now,false).changes.length,0)
  const plan=planNewsWindow([...rows(20),{id:'new',approved:false,hidden:false,sortTime:now.toISOString()}],states(20),now,true)
  assert.equal(plan.leaving.length,0)
})

test('buffer expiry survives retries and reentry restores normal state',()=>{
  const old:DisplayState={postId:'old',phase:'buffering',bufferedAt:now.toISOString(),retireAt:'2026-10-15T00:00:00.000Z'}
  const extra=rows(30).map((r,i)=>({...r,sortTime:new Date(now.getTime()+30-i).toISOString()}))
  assert.equal(planNewsWindow([...extra,{id:'old',sortTime:now.toISOString(),approved:true,hidden:false}],[old],new Date('2026-10-14T00:00:00Z'),true).changes.find(r=>r.postId==='old'),undefined)
  const due=planNewsWindow([...extra,{id:'old',sortTime:now.toISOString(),approved:true,hidden:false}],[old],new Date('2026-10-15T00:00:00Z'),true)
  assert.equal(due.changes.find(r=>r.postId==='old')?.phase,'retired')
  const returned=planNewsWindow([{id:'old',sortTime:'2026-10-16T00:00:00Z',approved:true,hidden:false},...extra],[{...old,phase:'retired'}],new Date('2026-10-16T00:00:00Z'),true)
  assert.equal(returned.changes.find(r=>r.postId==='old')?.phase,'normal')
})

test('bootstrap overflow does not fabricate a retirement buffer or event',()=>{
 const plan=planNewsWindow(rows(40),[],now,true)
 assert.equal(plan.normalIds.length,30)
 assert.equal(plan.changes.filter(row=>row.phase==='retired').length,10)
 assert.equal(plan.leaving.length,0)
 assert.equal(shouldCreateRetirementEvent(plan),false)
})

test('hidden or untagged posts retire immediately without a false new-post reminder',()=>{
  for(const change of [{hidden:true,approved:true},{hidden:false,approved:false}]){
    const old=states(20)
    const candidates=rows(20).map((row,index)=>index===0?{...row,...change}:row)
    const result=planNewsWindow(candidates,old,now,true)
    assert.equal(result.changes.find(row=>row.postId==='post-00')?.phase,'retired')
    assert.equal(result.leaving.length,0)
    assert.equal(shouldCreateRetirementEvent(result),false)
    assert.ok(!result.normalIds.includes('post-00'))
  }
})

test('a partial scan never retires or expires an existing buffer even after deadline',()=>{
  const buffered:DisplayState={postId:'old',phase:'buffering',bufferedAt:now.toISOString(),retireAt:'2026-10-15T00:00:00.000Z'}
  const result=planNewsWindow([], [buffered], new Date('2026-11-01T00:00:00Z'), false)
  assert.deepEqual(result.changes,[])
  assert.deepEqual(result.leaving,[])
  assert.equal(shouldCreateRetirementEvent(result),false)
})

test('the 72-hour buffer is stable across repeated reconciliation and expires on its deadline',()=>{
  const incoming={id:'new-01',sortTime:new Date(now.getTime()+60000).toISOString(),approved:true,hidden:false}
  const first=planNewsWindow([...rows(30),incoming],states(30),now,true)
  const old=first.leaving[0]
  assert.ok(old)
  assert.equal(old.phase,'buffering')
  const persisted=[...states(30).filter(r=>r.postId!==old.postId),...first.changes]
  const mid=planNewsWindow([...rows(30),incoming],persisted,new Date('2026-10-14T23:59:59Z'),true)
  assert.equal(mid.leaving.length,0)
  assert.equal(mid.changes.find(r=>r.postId===old.postId),undefined)
  const due=planNewsWindow([...rows(30),incoming],persisted,new Date('2026-10-15T00:00:00Z'),true)
  assert.equal(due.changes.find(r=>r.postId===old.postId)?.phase,'retired')
  assert.equal(due.leaving.length,0)
})

test('29/30/31 approved article boundaries preserve exactly a 30 article normal window',()=>{
 for(const count of [29,30,31]){
  const result=planNewsWindow(rows(count),[],now,true)
  assert.equal(result.normalIds.length,Math.min(30,count))
  assert.equal(result.changes.filter(row=>row.phase==='retired').length,Math.max(0,count-30))
 }
})
