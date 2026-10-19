import {getSavedAuthResult} from '../../../utils/auth'
import {request,friendlyRequestError} from '../../../utils/request'
import {setReadOnlyContext,clearReadOnlyContext,type ReadOnlyContext} from '../../../utils/read-only-context'

// Legacy lazy route remains an authorized entry, then uses the actual native four tabs.
Page({
 data:{loading:true,error:'',kind:'student' as 'student'|'teacher',id:''},
 generation:0,
 onLoad(options:Record<string,string>){
  const kind=options.kind==='teacher'?'teacher':'student',id=String(options.id||'')
  const auth=getSavedAuthResult()
  if(!auth||!['admin','teacher'].includes(auth.user.role)||kind==='teacher'&&auth.user.role!=='admin'){
   this.setData({loading:false,error:'当前账号无权查看该身份'});return
  }
  if(!/^[0-9a-f-]{36}$/i.test(id)){this.setData({loading:false,error:'查看对象参数无效'});return}
  this.setData({kind,id});void this.onRetry()
 },
 onUnload(){this.generation++},
 async onRetry(){
  const owner=getSavedAuthResult()?.user.id,serial=++this.generation
  this.setData({loading:true,error:''})
  try{
   const result=await request<{ok:true;subject:Omit<ReadOnlyContext,'operatorUserId'|'readToken'|'expiresAt'>;operatorUserId:string;readToken:string;expiresAt:string}>(
    `/me/read-only/context?kind=${this.data.kind}&id=${encodeURIComponent(this.data.id)}`)
   if(serial!==this.generation||owner!==getSavedAuthResult()?.user.id)return
   if(result.operatorUserId!==owner)throw new Error('session_changed')
   setReadOnlyContext({...result.subject,operatorUserId:result.operatorUserId,readToken:result.readToken,expiresAt:result.expiresAt})
   wx.switchTab({url:'/pages/index/index',fail:()=>{clearReadOnlyContext();this.setData({loading:false,error:'页面未打开，请重试'})}})
  }catch(error){if(serial===this.generation)this.setData({loading:false,error:friendlyRequestError(error,'只读查看未能进入，请核对目标账号是否已认领、可用及服务器版本')})}
 },
 onExit(){clearReadOnlyContext();wx.navigateBack({delta:1})},
})
