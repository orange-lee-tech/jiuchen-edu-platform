import { getSavedAuthResult } from '../../../utils/auth'
import {
  getReadOnlyStudent, getReadOnlyTeacher, friendlyRequestError,
  type ReadOnlyStudentResponse, type ReadOnlyTeacherResponse,
} from '../../../utils/request'

type Section='profile'|'classroom'|'schedule'|'growth'|'assessment'|'history'
type Report = {id:string;status:string;date:string;summary:string;actions:string[];risks:string[]}
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
      summary:string(out.profileSummary,1500),
      actions:row(out.recommendedActions),risks:row(out.risks)}
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
    stageIndex:0,selectedStage:'',
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
    this.setData({kind,id,viewerRole:auth.user.role})
    void this.loadData()
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
        courses:scheduleCourses(student.latestSchedule?.parsedJson),
        reports:reportViews(student.assessments),
      })
    }catch(error){
      if(serial!==this.generation)return
      this.setData({loading:false,student:null,teacher:null,
        error:friendlyRequestError(error,'身份查看失败，请检查查看权限或服务器版本')})
    }
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
