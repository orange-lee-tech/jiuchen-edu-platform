import { refreshAuthResult } from '../../utils/auth'
import { friendlyRequestError, request } from '../../utils/request'
import { isReadOnly } from '../../utils/read-only-context'
type Student = {id:string;userId:string;name:string;university:string|null}
type Receipt = {ledgerEntryId:string;before:number;after:number;amount:number;reason:string;actorId:string;idempotent:boolean}
function requestId(){return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const n=Math.floor(Math.random()*16);return(c==='x'?n:(n&3)|8).toString(16)})}
Page({
  data:{loading:false,busy:false,error:'',allowed:false,students:[] as Student[],studentNames:[] as string[],selected:-1,
    amount:'',reason:'',pin:'',key:'',attempted:false,balance:null as number|null,receipt:null as Receipt|null},
  epoch:0,owner:'',
  onShow(){void this.load()},
  onHide(){this.epoch++;this.owner='';this.setData({pin:'',busy:false,allowed:false,students:[],studentNames:[],balance:null,receipt:null,selected:-1,amount:'',reason:'',key:'',attempted:false})},
  onUnload(){this.epoch++},
  async load(){const epoch=++this.epoch;this.setData({loading:true,error:''})
    try{const auth=await refreshAuthResult();if(epoch!==this.epoch)return
      if(auth?.user.role!=='admin'||isReadOnly())throw new Error('请以本人管理员身份进入')
      const result=await request<{ok:true;students:Student[]}>('/me/admin/credit-adjustments')
      if(epoch!==this.epoch)return
      this.owner=auth.user.id
      this.setData({allowed:true,students:result.students,studentNames:result.students.map(s=>`${s.name} · ${s.university||'学校待补充'}`)})
      const pending=wx.getStorageSync('jiuchen-admin-credit-pending:'+this.owner) as {userId?:string;amount?:number;reason?:string;key?:string}|undefined
      if(pending&&typeof pending.userId==='string'&&Number.isInteger(pending.amount)&&typeof pending.reason==='string'&&typeof pending.key==='string'){
        const selected=result.students.findIndex(s=>s.userId===pending.userId)
        this.setData({selected,amount:String(pending.amount),reason:pending.reason,key:pending.key,attempted:true,
          error:selected<0?'上一笔目标账号已不在可发放名单，请核对账本后开始另一笔操作。':'发现待确认的发放记录。重试会核对同一账本事件，不会重复入账。'})
      }
    }catch(error){if(epoch===this.epoch)this.setData({error:friendlyRequestError(error,'学员名单读取失败，请重试')})}
    finally{if(epoch===this.epoch)this.setData({loading:false})}},
  async onStudent(event:WechatMiniprogram.PickerChange){
    if(this.data.attempted)return
    const selected=Number(event.detail.value), student=this.data.students[selected]
    const epoch=this.epoch
    this.setData({selected,balance:null,error:''})
    if(!student)return
    try{const value=await request<{balance:number}>('/me/admin/credit-adjustments/'+student.userId)
      if(epoch===this.epoch&&this.data.selected===selected)this.setData({balance:value.balance})
    }catch(error){if(epoch===this.epoch)this.setData({error:friendlyRequestError(error,'余额读取失败，请重试')})}
  },
  onField(event:WechatMiniprogram.Input){const field=String(event.currentTarget.dataset.field)
    if(field==='pin'||(!this.data.attempted&&['amount','reason'].includes(field)))this.setData({[field]:event.detail.value})},
  async submit(){
    if(this.data.busy||this.data.receipt||!this.data.allowed||isReadOnly())return
    const student=this.data.students[this.data.selected],amount=Number(this.data.amount),reason=this.data.reason.trim()
    if(!student||!Number.isInteger(amount)||amount<1||amount>10000||!reason||!/^\d{6}$/.test(this.data.pin)){
      this.setData({error:'请选择学员，填写1至10000的整数次数、发放原因及收费控制盒六位PIN'});return}
    const key=this.data.key||requestId(),epoch=this.epoch
    wx.setStorageSync('jiuchen-admin-credit-pending:'+this.owner,{userId:student.userId,amount,reason,key})
    this.setData({busy:true,attempted:true,key,error:''})
    try{const receipt=await request<Receipt>('/me/admin/credit-adjustments','POST',{
      userId:student.userId,amount,reason,pin:this.data.pin,idempotencyKey:key})
      if(epoch===this.epoch){
        this.setData({receipt,pin:'',balance:null})
        try{const account=await request<{balance:number}>('/me/admin/credit-adjustments/'+student.userId)
          if(epoch===this.epoch)this.setData({balance:account.balance})
        }catch(error){if(epoch===this.epoch)this.setData({error:friendlyRequestError(error,'次数已入账，可用余额重新读取失败；请重新进入核对。')})}
      }
    }catch(error){if(epoch===this.epoch)this.setData({error:friendlyRequestError(error,'发放未确认。请保留本笔内容并重试，重复请求不会重复入账。')})}
    finally{if(epoch===this.epoch)this.setData({busy:false,pin:''})}
  },
  newOperation(){if(this.data.busy)return
    const epoch=this.epoch,owner=this.owner
    wx.showModal({title:'开始另一笔发放',content:'确认上一笔结果后再开始。新操作会生成独立账本事件。',success:result=>{
      if(result.confirm&&epoch===this.epoch&&owner===this.owner){wx.removeStorageSync('jiuchen-admin-credit-pending:'+owner);this.setData({attempted:false,key:'',receipt:null,amount:'',reason:'',pin:'',error:''})}}})},
})
