/** Bounded, server-owned context. Never accept plan/history text from the client. */
import { and, desc, eq, inArray, ne } from 'drizzle-orm'
import type { DatabaseContext } from '../db/client.js'
import { assessments, planItems, planRevisions, scheduleImports, studentPlans, students } from '../db/schema.js'
import { assessmentOutputSchema, type AssessmentEvidenceItem } from '../domain/assessment.js'

type JsonObject = Record<string, unknown>
type Plan = { id: string; stageCode: string; type: string; title: string }
type Revision = { stageCode: string; type: string; title: string; itemsJson: unknown }
type Item = { planId: string; name: string; target: string | null; status: string }
type Schedule = { parsedJson: unknown }
type Report = { completedAt: Date | null; outputJson: unknown }
const object = (value: unknown): JsonObject | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null
const clean = (value: unknown, max = 100) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0,max) : ''
const unique = (items: string[], max: number) => {
  const seen = new Set<string>()
  return items.filter(item => {
    const key = item.replace(/\s+/g,'').toLowerCase()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0,max)
}

export function summarizePlanning(data: { plans: Plan[]; pending: Revision[]; items: Item[]; schedules: Schedule[] }) {
  const chosen = new Map<string,{stage:string;type:string;title:string;state:string;items:unknown[]}>()
  for (const plan of data.plans) chosen.set(plan.stageCode + ':' + plan.type, {
    stage:plan.stageCode,type:plan.type,title:plan.title,state:'老师认可版',
    items:data.items.filter(item => item.planId === plan.id),
  })
  // Pending is newest-first. Apply oldest first so the latest visible revision wins.
  for (const rev of [...data.pending].reverse()) chosen.set(rev.stageCode + ':' + rev.type,{
    stage:rev.stageCode,type:rev.type,title:rev.title,state:'学员待审核版（尚未被老师批准）',
    items:Array.isArray(rev.itemsJson) ? rev.itemsJson.slice(0,50) : [],
  })
  const statuses: Record<string,string> = {done:'完成',in_progress:'进行中',pending:'未开始'}
  const entries: string[] = []
  for (const plan of [...chosen.values()].slice(0,32)) {
    const details = unique(plan.items.map(raw => {
      const item = object(raw), name=clean(item?.name,80)
      if (!name) return ''
      const goal=clean(item?.target,80), status=statuses[String(item?.status)] || '状态未知'
      return name + (goal ? '→' + goal : '') + '（' + status + '）'
    }),10)
    if (details.length) entries.push(
      clean(plan.stage,40) + '/' + clean(plan.type,30) + '/' + clean(plan.title,80) +
      '[' + plan.state + ']：' + details.join('；'))
  }
  const stages = new Set<string>()
  for (const row of data.schedules.slice(0,8)) {
    const schedule = object(row.parsedJson), stage=clean(schedule?.stageCode,40)
    if (!stage || stages.has(stage) || !Array.isArray(schedule?.courses)) continue
    const courses = unique(schedule.courses.map((raw:unknown)=>{
      const item=object(raw), name=clean(item?.name,60), weeks=clean(item?.weeks,35)
      return name ? name + (weeks ? '（' + weeks + '）' : '') : ''
    }),12)
    if (!courses.length) continue
    stages.add(stage)
    entries.push(stage + '/课表：' + courses.join('、'))
  }
  return entries.join('\n').slice(0,1750)
}

export function summarizeHistory(rows: Report[]) {
  const seen = new Set<string>(), entries: string[] = []
  for (const row of rows.slice(0,3)) {
    const parsed = assessmentOutputSchema.safeParse(row.outputJson)
    if (!parsed.success) continue
    const value=parsed.data
    const pieces = [
      clean(value.profileSummary,180),
      ...value.strengths.slice(0,2).map(x=>'优势：'+clean(x.title,50)+' '+clean(x.detail,110)),
      ...value.risks.slice(0,2).map(x=>'风险：'+clean(x.title,50)+' '+clean(x.detail,110)),
      ...value.recommendedActions.slice(0,2).map(x=>'行动：'+clean(x.title,70)),
    ].filter(s=>{
      const key=s.replace(/\s+/g,'').toLowerCase()
      if (!key || seen.has(key)) return false
      seen.add(key);return true
    })
    if (!pieces.length) continue
    const date = row.completedAt instanceof Date && !Number.isNaN(row.completedAt.getTime())
      ? row.completedAt.toISOString().slice(0,10) : '日期未知'
    entries.push('历史评估' + (entries.length+1) + '（'+date+'，不代表当前成绩）：'+pieces.join('；'))
  }
  return entries.join('\n').slice(0,1450)
}

const asEvidence = (ref:string,title:string,excerpt:string):AssessmentEvidenceItem => ({
  ref,kind:'other',sourceType:'internal',sourceId:null,title,
  sourceLabel:'当前账号已保存数据；非院校官方材料',sourceUrl:null,excerpt,
})

export function createAssessmentAccountContextLoader(db: Extract<DatabaseContext,{configured:true}>) {
  return async (args:{
    userId:string; assessmentId:string; includePlanning:boolean; includeRecentAssessments:boolean
  }):Promise<AssessmentEvidenceItem[]> => {
    const result:AssessmentEvidenceItem[]=[]
    if (args.includePlanning) {
      const [student]=await db.db.select({id:students.id}).from(students)
        .where(eq(students.userId,args.userId)).limit(1)
      if (student) {
        const [plans,pending,schedules]=await Promise.all([
          db.db.select({id:studentPlans.id,stageCode:studentPlans.stageCode,type:studentPlans.type,title:studentPlans.title})
            .from(studentPlans).where(eq(studentPlans.studentId,student.id))
            .orderBy(desc(studentPlans.updatedAt)).limit(40),
          db.db.select({stageCode:planRevisions.stageCode,type:planRevisions.type,title:planRevisions.title,itemsJson:planRevisions.itemsJson})
            .from(planRevisions).where(and(eq(planRevisions.studentId,student.id),eq(planRevisions.status,'pending')))
            .orderBy(desc(planRevisions.createdAt)).limit(40),
          db.db.select({parsedJson:scheduleImports.parsedJson}).from(scheduleImports)
            .where(and(eq(scheduleImports.userId,args.userId),eq(scheduleImports.studentId,student.id),
              eq(scheduleImports.status,'parsed'))).orderBy(desc(scheduleImports.updatedAt)).limit(8),
        ])
        const items=plans.length?await db.db.select({
          planId:planItems.planId,name:planItems.name,target:planItems.target,status:planItems.status,
        }).from(planItems).where(inArray(planItems.planId,plans.map(p=>p.id)))
          .orderBy(planItems.sortOrder).limit(400):[]
        const excerpt=summarizePlanning({plans,pending,items,schedules})
        if(excerpt)result.push(asEvidence('account:planning','个人计划、课程进度和版本状态',excerpt))
      }
    }
    if (args.includeRecentAssessments) {
      const reports=await db.db.select({completedAt:assessments.completedAt,outputJson:assessments.outputJson})
        .from(assessments).where(and(eq(assessments.userId,args.userId),
          ne(assessments.id,args.assessmentId),eq(assessments.status,'succeeded')))
        .orderBy(desc(assessments.completedAt)).limit(3)
      const excerpt=summarizeHistory(reports)
      if(excerpt)result.push(asEvidence('account:history','最近最多三次本人成功评估的去重摘要',excerpt))
    }
    return result
  }
}
