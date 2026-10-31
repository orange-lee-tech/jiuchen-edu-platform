import { getSavedAuthResult, refreshAuthResult } from '../../utils/auth'
import { friendlyRequestError, request } from '../../utils/request'
import { isReadOnly } from '../../utils/read-only-context'

type StaffProfile = {realName:string|null;phone:string|null;department:string|null;supervisor:string|null;completedFields:number;complete:boolean}
type StaffTeacher = StaffProfile & {teacherId:string;businessName:string}
Page({
  data:{loading:false,saving:false,error:'',role:'',realName:'',phone:'',department:'',supervisor:'',teachers:[] as StaffTeacher[]},
  epoch:0,
  onShow(){void this.load()},
  onHide(){this.epoch++;this.setData({saving:false,realName:'',phone:'',department:'',supervisor:'',teachers:[],role:''})},
  onUnload(){this.epoch++},
  async load(){
    const epoch=++this.epoch
    this.setData({loading:true,saving:false,error:''})
    try{
      const auth=await refreshAuthResult()
      if(epoch!==this.epoch)return
      if(!auth||!['teacher','admin'].includes(auth.user.role)||isReadOnly())throw new Error('请以本人老师或管理员身份进入')
      const owner=auth.user.id
      this.setData({role:auth.user.role})
      const result=await request<{ok:true;profile:StaffProfile}>('/me/staff-profile')
      if(epoch!==this.epoch||getSavedAuthResult()?.user.id!==owner)return
      const p=result.profile
      this.setData({realName:p.realName||'',phone:p.phone||'',department:p.department||'',supervisor:p.supervisor||''})
      if(auth.user.role==='admin'){
        const roster=await request<{ok:true;teachers:StaffTeacher[]}>('/me/admin/staff-profiles')
        if(epoch===this.epoch&&getSavedAuthResult()?.user.id===owner)this.setData({teachers:roster.teachers})
      }
    }catch(error){if(epoch===this.epoch)this.setData({error:friendlyRequestError(error,'员工资料读取失败，请重试')})}
    finally{if(epoch===this.epoch)this.setData({loading:false})}
  },
  onField(event:WechatMiniprogram.Input){const field=String(event.currentTarget.dataset.field)
    if(['realName','phone','department','supervisor'].includes(field))this.setData({[field]:event.detail.value})},
  async save(){
    if(this.data.saving||!['teacher','admin'].includes(this.data.role)||isReadOnly())return
    if(!this.data.realName.trim()){this.setData({error:'请填写真实姓名'});return}
    const epoch=this.epoch
    this.setData({saving:true,error:''})
    try{
      await request('/me/staff-profile','PUT',{realName:this.data.realName.trim(),phone:this.data.phone.trim()||null,
        department:this.data.department.trim()||null,supervisor:this.data.supervisor.trim()||null})
      if(epoch===this.epoch){wx.showToast({title:'员工资料已保存',icon:'success'});await this.load()}
    }catch(error){if(epoch===this.epoch)this.setData({error:friendlyRequestError(error,'保存失败，请检查手机号后重试')})}
    finally{if(epoch===this.epoch)this.setData({saving:false})}
  },
})
