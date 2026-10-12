import test from 'node:test'
import assert from 'node:assert/strict'
import { planNewsWindow, shouldCreateRetirementEvent, type DisplayCandidate, type DisplayState } from './news-lifecycle.js'

const now = new Date('2026-10-12T00:00:00Z')
const rows = (n: number): DisplayCandidate[] => Array.from({ length:n },(_,i)=>({id:'post-'+String(i).padStart(2,'0'),sortTime:new Date(now.getTime()-i*1000).toISOString(),approved:true,hidden:false}))
const states = (n:number): DisplayState[] => rows(n).map(r=>({postId:r.id,phase:'normal',bufferedAt:null,retireAt:null}))

test('new 1, 3 or 20 posts replace exactly that many of 20; one batch reminder',()=>{
  for(const count of [1,3,20]){
    const incoming=rows(count).map((r,i)=>({...r,id:'new-'+i,sortTime:new Date(now.getTime()+count-i).toISOString()}))
    const plan=planNewsWindow([...rows(20),...incoming],states(20),now,true)
    assert.equal(plan.normalIds.length,20)
    assert.equal(plan.entered.length,count)
    assert.equal(plan.leaving.length,count)
    assert.equal(plan.leaving.every(r=>r.retireAt==='2026-10-15T00:00:00.000Z'),true)
    assert.equal(shouldCreateRetirementEvent(plan),true)
    const repeat=planNewsWindow([...rows(20),...incoming],[...states(20).filter(r=>!plan.changes.some(c=>c.postId===r.postId)),...plan.changes],new Date(now.getTime()+1000),true)
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
  const extra=rows(20).map((r,i)=>({...r,sortTime:new Date(now.getTime()+20-i).toISOString()}))
  assert.equal(planNewsWindow([...extra,{id:'old',sortTime:now.toISOString(),approved:true,hidden:false}],[old],new Date('2026-10-14T00:00:00Z'),true).changes.find(r=>r.postId==='old'),undefined)
  const due=planNewsWindow([...extra,{id:'old',sortTime:now.toISOString(),approved:true,hidden:false}],[old],new Date('2026-10-15T00:00:00Z'),true)
  assert.equal(due.changes.find(r=>r.postId==='old')?.phase,'retired')
  const returned=planNewsWindow([{id:'old',sortTime:'2026-10-16T00:00:00Z',approved:true,hidden:false},...extra],[{...old,phase:'retired'}],new Date('2026-10-16T00:00:00Z'),true)
  assert.equal(returned.changes.find(r=>r.postId==='old')?.phase,'normal')
})

test('bootstrap overflow does not fabricate a retirement buffer or event',()=>{
 const plan=planNewsWindow(rows(40),[],now,true)
 assert.equal(plan.normalIds.length,20)
 assert.equal(plan.changes.filter(row=>row.phase==='retired').length,20)
 assert.equal(plan.leaving.length,0)
 assert.equal(shouldCreateRetirementEvent(plan),false)
})
