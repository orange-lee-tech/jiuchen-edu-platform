import { getSavedAuthResult } from '../../../utils/auth'
import {
  getReadOnlyStudent, getReadOnlyTeacher, friendlyRequestError,
  type ReadOnlyStudentResponse, type ReadOnlyTeacherResponse,
} from '../../../utils/request'

type Section='profile'|'classroom'|'schedule'|'growth'|'assessment'|'history'
type Report = {id:string;status:string;date:string;summary:string;
  strengths:string[];targets:string[];actions:string[];risks:string[];uncertainties:string[]}
type Course = {name:string;day:string;slot:string;weeks:string;location:string}

function object(raw:unknown):Record<string,unknown> {
  return raw && typeof raw==='object' && !Array.isArray(raw) ? raw as Record<string,unknown> : {}
}
function string(value:unknown,max=180):string {
  return typeof value==='string'?value.slice(0,max):''
}
function reportViews(items:ReadOnlyStudentResponse['assessments']):Report[] {
  return items.map(item=>{
    const out=object(item.outputJson)
    const row=(value:unknown)=>Array.isArray(value)
      ? value.map(raw=>{const o=object(raw);return string(o.title||o.detail||raw)}).filter(Boolean)
      : []
    return {id:item.id,status:item.status,
      date:string(item.completedAt||item.createdAt,10),
      summary:string(out.profileSummary,3000),
      strengths:row(out.strengths),targets:Array.isArray(out.targetAssessments)
        ? out.targetAssessments.map(value=>{
            const t=object(value);return [
              string(t.schoolName,80),string(t.programName,80),
              string(t.tier,40),string(t.rationale,900),
            ].filter(Boolean).join(' · ')
          }).filter(Boolean):[],
      actions:row(out.recommendedActions),risks:row(out.risks),
      uncertainties:row(out.uncertainties)}
  })
}
function scheduleCourses(raw:unknown):Course[] {
  const schedule=object(raw)
  return (Array.isArray(schedule.courses)?schedule.courses:[]).map(entry=>{
    const c=object(entry)
    return {name:string(c.name,100),day:string(c.day,20),slot:string(c.slot,30),
      weeks:string(c.weeks,50),location:string(c.location,100)}
  }).filter(course=>course.name)
}
Page({
  data:{
    kind:'student' as 'student'|'teacher',id:'',
    loading:true,error:'',section:'profile' as Section,viewerRole:'',
    readOnly:true,
    student:null as ReadOnlyStudentResponse | null,
    teacher:null as ReadOnlyTeacherResponse | null,
    reports:[] as Report[],courses:[] as Course[],
    expandedReportId:'',selectedScheduleId:'',
    revisionsView:[] as Array<{id:string;title:string;stageCode:string;type:string;
      status:string;items:Array<{name:string;status:string;target:string}>}>,
    stageIndex:0,selectedStage:'',
    operatorId:'',
    tabs:[{key:'profile',label:'我的资料'},{key:'classroom',label:'我的规划'},
      {key:'schedule',label:'我的课表'},{key:'growth',label:'成长记录'},
      {key:'assessment',label:'AI评估'},{key:'history',label:'计划历史'}],
  },
  generation:0,
  onLoad(options:Record<string,string>){
    const auth=getSavedAuthResult()
    const kind=options.kind==='teacher'?'teacher':'student'
    if(!auth || (auth.user.role!=='admin' && auth.user.role!=='teacher') ||
      (kind==='teacher' && auth.user.role!=='admin')){
      this.setData({loading:false,error:'当前账号无权进入此只读视图'})
      return
    }
    const id=String(options.id||'')
    if(!/^[0-9a-f-]{36}$/i.test(id)){
      this.setData({loading:false,error:'查看对象参数无效'})
      return
    }
    this.setData({kind,id,viewerRole:auth.user.role,operatorId:auth.user.id})
    void this.loadData()
  },
  onShow(){
    if(!this.data.operatorId)return
    const auth=getSavedAuthResult()
    if(!auth || auth.user.id!==this.data.operatorId ||
      auth.user.role!==this.data.viewerRole){
      this.generation++
      this.setData({loading:false,error:'账号已切换，请退出只读视图并重新获得授权',
        student:null,teacher:null,reports:[],courses:[]})
    }
  },
  onUnload(){this.generation+=1},
  async loadData(stage?:string){
    const serial=++this.generation
    try{
      this.setData({loading:true,error:''})
      if(this.data.kind==='teacher'){
        const teacher=await getReadOnlyTeacher(this.data.id)
        if(serial!==this.generation)return
        this.setData({teacher,student:null,loading:false})
        return
      }
      const student=await getReadOnlyStudent(this.data.id,stage)
      if(serial!==this.generation)return
      const index=student.stages.findIndex(item=>item.code===student.classroom.stage.code)
      this.setData({student,teacher:null,loading:false,
        selectedStage:student.classroom.stage.code,stageIndex:Math.max(index,0),
        selectedScheduleId:student.latestSchedule?.id||'',
        courses:scheduleCourses(student.latestSchedule?.parsedJson),
        reports:reportViews(student.assessments),
        revisionsView:student.revisions.map(item=>({
          id:item.id,title:item.title,stageCode:item.stageCode,
          type:item.type,status:item.status,
          items:Array.isArray(item.itemsJson)?item.itemsJson.map(x=>{
            const row=object(x)
            return {name:string(row.name,160),status:string(row.status,30),
              target:string(row.target,240)}
          }).filter(x=>x.name):[],
        })),
      })
    }catch(error){
      if(serial!==this.generation)return
      this.setData({loading:false,student:null,teacher:null,
        error:friendlyRequestError(error,'身份查看失败，请检查查看权限或服务器版本')})
    }
  },
  onScheduleSelect(event:WechatMiniprogram.BaseEvent){
    const id=String(event.currentTarget.dataset.id||'')
    const schedule=this.data.student?.schedules.find(item=>item.id===id)
    if(!schedule)return
    this.setData({selectedScheduleId:id,courses:scheduleCourses(schedule.parsedJson)})
  },
  onReportToggle(event:WechatMiniprogram.BaseEvent){
    const id=String(event.currentTarget.dataset.id||'')
    if(!this.data.reports.some(item=>item.id===id))return
    this.setData({expandedReportId:this.data.expandedReportId===id?'':id})
  },
  onTab(event:WechatMiniprogram.BaseEvent){
    const key=String(event.currentTarget.dataset.tab) as Section
    if(!this.data.tabs.some(item=>item.key===key))return
    this.setData({section:key})
  },
  onStage(event:WechatMiniprogram.CustomEvent<{value:string}>){
    const student=this.data.student,index=Number(event.detail.value)
    const stage=student?.stages[index]?.code
    if(!stage)return
    this.setData({stageIndex:index})
    void this.loadData(stage)
  },
  onViewAssigned(event:WechatMiniprogram.BaseEvent){
    if(this.data.viewerRole!=='admin')return
    const id=String(event.currentTarget.dataset.id||'')
    const assigned=this.data.teacher?.assigned||[]
    if(!assigned.some(item=>item.studentId===id))return
    wx.navigateTo({url:'/packages/read-only/view/view?kind=student&id='+encodeURIComponent(id)})
  },
  onExit(){wx.navigateBack({delta:1})},
})
