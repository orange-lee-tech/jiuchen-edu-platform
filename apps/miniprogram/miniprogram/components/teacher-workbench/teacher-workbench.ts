import { isReadOnly } from '../../utils/read-only-context'
import { ApiRequestError, request, getTeacherStudents, getTeacherStudentClassroom, getTeacherStudentSummary,
  getTeacherTodos, saveTeacherTodo, deleteTeacherTodo, friendlyRequestError,
  type TeacherStudent, type TeacherStudentSummary, type ClassroomPlanType, type PlanEditorItem, type TeacherTodo } from '../../utils/request'
import { buildTeacherPlanPayload, presentTeacherApplyResults, remainingTeacherApplyTargets, type TeacherApplyResult } from '../../utils/teacher-plan-apply'

const STAGES = [
  ['freshman-fall','大一上'],['freshman-winter','大一寒假'],['freshman-spring','大一下'],['freshman-summer','大一暑假'],
  ['sophomore-fall','大二上'],['sophomore-winter','大二寒假'],['sophomore-spring','大二下'],['sophomore-summer','大二暑假'],
  ['junior-fall','大三上'],['junior-winter','大三寒假'],['junior-spring','大三下'],['junior-summer','大三暑假'],
  ['senior-fall','大四上'],['senior-winter','大四寒假'],['senior-spring','大四下'],
]
type Plan = { stageCode: string; type: ClassroomPlanType; title: string; items: PlanEditorItem[] }
type Template = { id: string; name: string; plan: Plan }
const PLAN_LABELS: Record<ClassroomPlanType, string> = { gpa:'课程成绩',english:'英语',competition:'竞赛',research:'科研',internship:'实习',custom:'自定义规划' }
const STATUSES = [{value:'pending',label:'未开始'},{value:'in_progress',label:'进行中'},{value:'done',label:'已完成'}] as const

Component({
  properties: { mode: { type: String, value: 'workbench' } },
  data: {
    loading:false,error:'',busy:false,students:[] as (TeacherStudent & { checked:boolean;stageLabel:string })[],studentIndex:0,
    selectedIds:[] as string[],stageLabels:STAGES.map(s=>s[1]),stageIndex:0,actualStage:'',
    plans:[] as {type:ClassroomPlanType;title:string;items:PlanEditorItem[]}[],planLabels:[] as string[],planIndex:0,
    title:'',items:[] as PlanEditorItem[],templates:[] as Template[],templateLabels:[] as string[],templateIndex:-1,templateName:'',
    summary:null as TeacherStudentSummary|null,summaryError:'',planError:'',templateError:'',results:[] as (TeacherApplyResult & {name:string;message:string})[],resultSummary:'',applyError:'',completedStudentIds:[] as string[],
    statuses:STATUSES,todos:[] as TeacherTodo[],todoError:'',todoId:'',todoTitle:'',todoDescription:'',todoDate:'',
  },
  lifetimes: {
    attached() { void this.reload() },
    detached() { this.setData({students:[],selectedIds:[],summary:null,todos:[],templates:[],items:[]}) },
  },
  methods: {
    async reload() {
      this.setData({loading:true,error:'',summary:null,results:[]})
      try {
        const rows = await getTeacherStudents()
        const seen = new Set<string>()
        const students = rows.filter(s => !seen.has(s.studentId) && Boolean(seen.add(s.studentId))).map(s=>({...s,checked:false,stageLabel:STAGES.find(stage=>stage[0]===s.currentStage)?.[1] || '阶段未填写'}))
        this.setData({students,studentIndex:0,selectedIds:[]})
        await Promise.all([this.loadTemplates(),this.loadTodos()])
        if(students.length) await this.selectStudent(0)
      } catch(error) { this.setData({error:friendlyRequestError(error,'学员名单读取失败，请重试')}) }
      finally { this.setData({loading:false}) }
    },
    async selectStudent(index:number) {
      const student=this.data.students[index];if(!student)return
      const stageIndex=STAGES.findIndex(stage=>stage[0]===student.currentStage)
      this.setData({studentIndex:index,stageIndex:Math.max(0,stageIndex),actualStage:student.stageLabel,summary:null,summaryError:'',results:[],completedStudentIds:[],resultSummary:'',applyError:''})
      const selectedId=student.studentId
      await Promise.all([
        this.loadPlans(),
        getTeacherStudentSummary(selectedId).then(summary=>{if(this.data.students[this.data.studentIndex]?.studentId===selectedId)this.setData({summary})})
          .catch(error=>{if(this.data.students[this.data.studentIndex]?.studentId===selectedId)this.setData({summaryError:friendlyRequestError(error,'服务信息读取失败，请重试')})}),
      ])
    },
    async loadPlans() {
      const student=this.data.students[this.data.studentIndex],stage=STAGES[this.data.stageIndex]?.[0];if(!student||!stage)return
      this.setData({planError:'',plans:[],items:[],title:''})
      try {
        const view=await getTeacherStudentClassroom(student.studentId,stage)
        if(this.data.students[this.data.studentIndex]?.studentId!==student.studentId||STAGES[this.data.stageIndex]?.[0]!==stage)return
        this.setData({plans:view.plans,planLabels:view.plans.map(plan=>PLAN_LABELS[plan.type]),planIndex:0,templateIndex:-1,templateName:''})
        this.choosePlan(0)
      }catch(error){this.setData({planError:friendlyRequestError(error,'学员规划读取失败，请重试')})}
    },
    choosePlan(index:number){const plan=this.data.plans[index];if(plan)this.setData({planIndex:index,title:plan.title,items:plan.items.map(item=>({...item})),templateIndex:-1,templateName:'',results:[]})},
    onStudent(event:WechatMiniprogram.PickerChange){void this.selectStudent(Number(event.detail.value))},
    onStudentCard(event:WechatMiniprogram.BaseEvent){void this.selectStudent(Number(event.currentTarget.dataset.index))},
    clearApplyProgress(){this.setData({completedStudentIds:[],results:[],resultSummary:'',applyError:''})},
    onStage(event:WechatMiniprogram.PickerChange){this.clearApplyProgress();this.setData({stageIndex:Number(event.detail.value)});void this.loadPlans()},
    onPlan(event:WechatMiniprogram.PickerChange){this.clearApplyProgress();this.choosePlan(Number(event.detail.value))},
    onSelection(event:WechatMiniprogram.CheckboxGroupChange){const selectedIds=event.detail.value;this.clearApplyProgress();this.setData({selectedIds,students:this.data.students.map(s=>({...s,checked:selectedIds.includes(s.studentId)}))})},
    onText(event:WechatMiniprogram.Input){const field=String(event.currentTarget.dataset.field);if(['title','templateName','todoTitle','todoDescription'].includes(field)){if(field==='title')this.clearApplyProgress();this.setData({[field]:event.detail.value})}},
    onItemText(event:WechatMiniprogram.Input){const index=Number(event.currentTarget.dataset.index),field=String(event.currentTarget.dataset.field);const items=[...this.data.items];if(items[index]&&(field==='name'||field==='target')){this.clearApplyProgress();items[index]={...items[index],[field]:event.detail.value};this.setData({items})}},
    onItemDate(event:WechatMiniprogram.PickerChange){const index=Number(event.currentTarget.dataset.index),items=[...this.data.items];if(items[index]){this.clearApplyProgress();items[index]={...items[index],dueDate:String(event.detail.value)};this.setData({items})}},
    onClearDate(event:WechatMiniprogram.BaseEvent){const index=Number(event.currentTarget.dataset.index),items=[...this.data.items];if(items[index]){this.clearApplyProgress();items[index]={...items[index],dueDate:null};this.setData({items})}},
    onItemStatus(event:WechatMiniprogram.PickerChange){const index=Number(event.currentTarget.dataset.index),status=STATUSES[Number(event.detail.value)],items=[...this.data.items];if(items[index]&&status){this.clearApplyProgress();items[index]={...items[index],status:status.value};this.setData({items})}},
    onAddItem(){if(this.data.items.length<50){this.clearApplyProgress();this.setData({items:[...this.data.items,{name:'',target:'',status:'pending'}]})}},
    onRemoveItem(event:WechatMiniprogram.BaseEvent){const items=[...this.data.items];items.splice(Number(event.currentTarget.dataset.index),1);this.clearApplyProgress();this.setData({items})},
    currentPlan():Plan|null {
      const plan=this.data.plans[this.data.planIndex],stageCode=STAGES[this.data.stageIndex]?.[0]
      if(!plan||!stageCode){wx.showToast({title:'请先选择有效的规划阶段和类型',icon:'none'});return null}
      const normalized=buildTeacherPlanPayload(stageCode,plan.type,this.data.title,this.data.items)
      if(!normalized.ok){wx.showToast({title:normalized.message,icon:'none'});return null}
      return normalized.value
    },
    async onApply(){
      if(isReadOnly()||this.data.busy)return
      const plan=this.currentPlan(),student=this.data.students[this.data.studentIndex];if(!plan||!student)return
      const candidateIds=this.data.selectedIds.length?this.data.selectedIds:[student.studentId]
      const studentIds=remainingTeacherApplyTargets(candidateIds,this.data.completedStudentIds)
      if(!studentIds.length){wx.showToast({title:'所选学员已成功应用此方案',icon:'none'});return}
      wx.showModal({title:'应用规划',content:`将分别保存到 ${studentIds.length} 位学员的对应阶段；已有同类规划会被本方案替换。`,success:async result=>{
        if(!result.confirm||this.data.busy||isReadOnly())return
        this.setData({busy:true,results:[],applyError:'',resultSummary:''})
        try{
          const response=await request<{results:TeacherApplyResult[]}>('/me/teacher/plans/apply','POST',{studentIds,plan})
          const presentation=presentTeacherApplyResults(response.results,studentIds,this.data.students)
          if(!presentation){this.setData({applyError:'服务端未返回逐位应用结果，不能确认哪些学员已保存。请重新读取学员规划后核对。'});return}
          const completedStudentIds=[...new Set([...this.data.completedStudentIds,...presentation.rows.filter(row=>row.ok).map(row=>row.studentId)])]
          const remainingSelected=studentIds.filter(id=>!completedStudentIds.includes(id))
          this.setData({results:presentation.rows,resultSummary:`成功 ${presentation.successCount} 位 · 失败 ${presentation.failedCount} 位`,completedStudentIds,
            selectedIds:remainingSelected,students:this.data.students.map(s=>({...s,checked:remainingSelected.includes(s.studentId)}))})
        }
        catch(error){
          const code=error instanceof ApiRequestError?error.code:'unknown_error'
          console.warn('Teacher plan apply request failed.',{statusCode:error instanceof ApiRequestError?error.statusCode:0,code:/^[a-z][a-z0-9_]{0,79}$/.test(code)?code:'unknown_error'})
          const message=code==='invalid_teacher_plan_batch'?'服务端拒绝了规划数据（invalid_teacher_plan_batch）；请核对阶段、类型和任务字段后重试。':friendlyRequestError(error,'规划应用失败，请重试')
          this.setData({applyError:message})
        }
        finally{this.setData({busy:false})}
      }})
    },
    async loadTemplates(){try{const response=await request<{templates:Template[]}>('/me/teacher/plan-templates');this.setData({templates:response.templates,templateLabels:response.templates.map(t=>t.name),templateError:''})}catch(error){this.setData({templateError:friendlyRequestError(error,'规划模板读取失败，请重试')})}},
    onTemplate(event:WechatMiniprogram.PickerChange){
      const index=Number(event.detail.value),template=this.data.templates[index];if(!template)return
      const stageIndex=STAGES.findIndex(stage=>stage[0]===template.plan.stageCode)
      const plans=[{type:template.plan.type,title:template.plan.title,items:template.plan.items}]
      this.clearApplyProgress()
      this.setData({templateIndex:index,templateName:template.name,stageIndex,plans,planIndex:0,planLabels:[PLAN_LABELS[template.plan.type]],title:template.plan.title,items:template.plan.items.map(item=>({...item})),results:[]})
    },
    async onSaveTemplate(){
      if(isReadOnly()||this.data.busy)return
      const plan=this.currentPlan(),name=this.data.templateName.trim();if(!plan)return
      if(!name){wx.showToast({title:'请填写模板名称',icon:'none'});return}
      this.setData({busy:true})
      try{const current=this.data.templates[this.data.templateIndex];await request('/me/teacher/plan-templates'+(current?'/'+encodeURIComponent(current.id):''),current?'PUT':'POST',{name,plan});await this.loadTemplates();wx.showToast({title:'模板已保存'})}
      catch(error){wx.showToast({title:friendlyRequestError(error,'模板保存失败'),icon:'none'})}
      finally{this.setData({busy:false})}
    },
    onNewTemplate(){this.setData({templateIndex:-1,templateName:''})},
    async onCopyTemplate(){const template=this.data.templates[this.data.templateIndex];if(!template||this.data.busy||isReadOnly())return;this.setData({busy:true});try{await request('/me/teacher/plan-templates/'+encodeURIComponent(template.id)+'/copy','POST',{});await this.loadTemplates();this.onNewTemplate()}catch(error){wx.showToast({title:friendlyRequestError(error,'复制失败'),icon:'none'})}finally{this.setData({busy:false})}},
    onDeleteTemplate(){
      const template=this.data.templates[this.data.templateIndex]
      if(!template||this.data.busy||isReadOnly())return
      wx.showModal({title:'删除个人模板',content:'已生成的学员规划会保留。',success:async result=>{
        if(!result.confirm||this.data.busy||isReadOnly())return
        this.setData({busy:true})
        try{await request('/me/teacher/plan-templates/'+encodeURIComponent(template.id),'DELETE');await this.loadTemplates();this.onNewTemplate()}
        catch(error){wx.showToast({title:friendlyRequestError(error,'删除失败'),icon:'none'})}
        finally{this.setData({busy:false})}
      }})
    },
    onDetail(){const student=this.data.students[this.data.studentIndex];if(student)wx.navigateTo({url:'/packages/read-only/view/view?kind=student&id='+encodeURIComponent(student.studentId)})},
    async loadTodos(){try{this.setData({todos:await getTeacherTodos(),todoError:''})}catch(error){this.setData({todoError:friendlyRequestError(error,'个人待办读取失败，请重试')})}},
    onTodoDate(event:WechatMiniprogram.PickerChange){this.setData({todoDate:String(event.detail.value)})},
    onTodoClearDate(){this.setData({todoDate:''})},
    onTodoEdit(event:WechatMiniprogram.BaseEvent){const todo=this.data.todos.find(row=>row.id===event.currentTarget.dataset.id);if(todo)this.setData({todoId:todo.id,todoTitle:todo.title,todoDescription:todo.description||'',todoDate:todo.dueDate||''})},
    onTodoCancel(){this.setData({todoId:'',todoTitle:'',todoDescription:'',todoDate:''})},
    async onTodoSave(){if(this.data.busy||isReadOnly())return;if(!this.data.todoTitle.trim()){wx.showToast({title:'请填写待办标题',icon:'none'});return}this.setData({busy:true});try{const current=this.data.todos.find(row=>row.id===this.data.todoId);await saveTeacherTodo(this.data.todoId,{title:this.data.todoTitle.trim(),description:this.data.todoDescription||null,dueDate:this.data.todoDate||null,status:current?.status||'pending'});this.onTodoCancel();await this.loadTodos()}catch(error){wx.showToast({title:friendlyRequestError(error,'待办保存失败'),icon:'none'})}finally{this.setData({busy:false})}},
    async onTodoToggle(event:WechatMiniprogram.BaseEvent){const todo=this.data.todos.find(row=>row.id===event.currentTarget.dataset.id);if(!todo||this.data.busy||isReadOnly())return;this.setData({busy:true});try{await saveTeacherTodo(todo.id,{title:todo.title,description:todo.description,dueDate:todo.dueDate,status:todo.status==='done'?'pending':'done'});await this.loadTodos()}catch(error){wx.showToast({title:friendlyRequestError(error,'待办更新失败'),icon:'none'})}finally{this.setData({busy:false})}},
    onTodoDelete(event:WechatMiniprogram.BaseEvent){
      const id=String(event.currentTarget.dataset.id||'')
      if(!id||this.data.busy||isReadOnly())return
      wx.showModal({title:'删除个人待办',content:'确认删除这条待办？',success:async result=>{
        if(!result.confirm||this.data.busy||isReadOnly())return
        this.setData({busy:true})
        try{await deleteTeacherTodo(id);await this.loadTodos()}
        catch(error){wx.showToast({title:friendlyRequestError(error,'删除失败'),icon:'none'})}
        finally{this.setData({busy:false})}
      }})
    },
  },
})
