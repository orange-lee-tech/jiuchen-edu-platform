import { runtimeConfig } from '../config/runtime'
import { getSavedAuthResult, type BootstrapUser, type BusinessIdentity, type UserRole } from './auth'
import { request } from './request'

const CONTACT_ROLE_LABELS:Record<UserRole,string> = {
  admin:'管理员', teacher:'辅导老师', staff:'内部员工', student:'学员', user:'普通用户',
}

/** Prefilling chat text is unsupported, so copy the checked identity statement.
 * All role and internal-ID values come from a fresh /auth/me response. */
export type CustomerServiceContext = {
  school?: string
  grade?: string
  major?: string
  path?: string
}
/** One verified identity confirmation, optionally carrying a school consultation.
 * This never silently sends clipboard text or role labels. */
export async function openVerifiedWechatCustomerService(
  purpose='联系九辰运营', context:CustomerServiceContext={},
):Promise<void>{
  const before=getSavedAuthResult()
  if(!before){
    wx.showModal({
      title:'游客身份咨询',
      content:'你尚未登录，客服只能识别为“未登录游客”，无法判断老师/学员/管理员身份。'+
        (context.school?'\n目标学校：'+context.school:'')+'\n是否继续咨询？',
      confirmText:'游客咨询',cancelText:'返回登录',
      success:result=>{
        if(!result.confirm)return
        const card={title:'九辰咨询｜未登录游客'+(context.school?'｜'+context.school:''),
          path:context.path||'/pages/index/index'}
        if(context.school){
          wx.setClipboardData({
            data:['【九辰院校咨询】','当前身份：未登录游客','目标学校：'+context.school,
              '联系人：（请填写）'].join('\n'),
            success:()=>openWechatCustomerService(card),
            fail:()=>wx.showToast({title:'复制失败，请稍后再试',icon:'none'}),
          })
        } else openWechatCustomerService(card)
      },
    })
    return
  }
  let verified: {ok:true;user:BootstrapUser;businessIdentity:BusinessIdentity|null}
  try{verified=await request('/auth/me')}catch{
    wx.showModal({
      title:'身份校验暂不可用',
      content:'无法向服务器核对你的账号角色，本次不会把本地缓存身份当作已认证信息发送。请稍后重试。',
      showCancel:false,
    })
    return
  }
  if(!verified.ok || verified.user.id!==before.user.id || !CONTACT_ROLE_LABELS[verified.user.role]){
    wx.showModal({
      title:'身份未通过验证',
      content:'本次没有从服务器确认登录身份，不能依赖本地缓存向客服宣称自己是老师或管理员。请稍后重试。',
      showCancel:false,
    })
    return
  }
  if(getSavedAuthResult()?.session.token!==before.session.token){
    wx.showToast({title:'登录身份已变化，请重试',icon:'none'})
    return
  }
  const role=CONTACT_ROLE_LABELS[verified.user.role]
  const name=verified.user.displayName?.trim() || '（请填写姓名）'
  const internalId=verified.businessIdentity?.status==='claimed'
    ? verified.businessIdentity.businessId : ''
  const identityLines=[
    '【九辰客服 · 身份识别】',
    '咨询事项：'+purpose,
    '当前身份：'+role,
    '联系人：'+name,
    '九辰内部编号：'+(internalId||'尚未绑定'),
    ...(context.school?['目标学校：'+context.school]:[]),
    ...(context.grade?['就读年级：'+context.grade]:[]),
    ...(context.major?['就读专业：'+context.major]:[]),
  ]
  const summary=identityLines.join('\n')
  const cardTitle=('九辰咨询｜'+role+'｜'+name+(context.school?'｜'+context.school:'')+
    (internalId?'｜'+internalId:'')).slice(0,48)
  wx.showModal({
    title:'确认客服识别信息',
    content:summary+'\n\n确认后复制信息并打开微信客服，请手动粘贴发送。不会后台自动提交。',
    confirmText:'复制并联系',
    success(result){
      if(!result.confirm)return
      const current=getSavedAuthResult()
      if(!current || current.user.id!==verified.user.id || current.session.token!==before.session.token){
        wx.showToast({title:'账号已变更，请重试',icon:'none'})
        return
      }
      wx.setClipboardData({
        data:summary,
        success:()=>openWechatCustomerService({
          title:cardTitle,path:context.path||'/pages/profile/profile',
        }),
        fail:()=>wx.showToast({title:'身份信息复制失败',icon:'none'}),
      })
    },
  })
}


export function supportsWechatCustomerService(): boolean {
  return typeof wx.openCustomerServiceChat === 'function'
}

export type CustomerServiceCard = { title:string; path:string }
export function openWechatCustomerService(_card?:CustomerServiceCard): void {
  const { corpId, url } = runtimeConfig.wechatCustomerService

  if (!corpId || !url) {
    wx.showToast({
      title: '客服暂未配置',
      icon: 'none',
    })
    return
  }

  if (!supportsWechatCustomerService()) {
    wx.showToast({
      title: '当前微信版本暂不支持，请升级微信后重试',
      icon: 'none',
    })
    return
  }

  const open = (canRetry:boolean) => wx.openCustomerServiceChat({
    corpId, extInfo:{url},
    success(){console.info('Opened WeChat customer service.',{corpId,url})},
    fail(error){
      const code=String(error.errMsg||'unknown').slice(0,120)
      console.error('Failed to open WeChat customer service.',error)
      wx.showModal({
        title:'客服未打开（新版）',
        content:`微信返回：${code}。${canRetry?'可点击重试一次。':'请将此错误反馈给九辰运营。'}`,
        showCancel:canRetry,
        confirmText:canRetry?'点击重试':'知道了',
        success:result=>{if(canRetry&&result.confirm)open(false)},
      })
    },
  })
  open(true)
}


/** Shared clipboard flow. The chat opens only after a real successful copy. */
export function copyConsultationAndOpen(
  text: string, card?: CustomerServiceCard, isCurrent: () => boolean = () => true,
): Promise<void> {
  return new Promise(resolve => {
    if (!text || !isCurrent()) {
      wx.showToast({title:'账号或报告已变化，请重试',icon:'none'})
      resolve(); return
    }
    wx.setClipboardData({
      data:text,
      success:()=>{
        if (!isCurrent()) { resolve(); return }
        wx.showModal({
          title:'咨询信息已复制',
          content:'请在客服对话中粘贴发送。信息不会自动发送给老师。',
          showCancel:false,confirmText:'打开客服',
          success:()=>{ if(isCurrent()) openWechatCustomerService(card); resolve() },
          fail:()=>resolve(),
        })
      },
      fail:()=>{
        wx.showModal({title:'复制失败',content:'未复制咨询信息，请重试。',confirmText:'重试',
          success:async result=>{ if(result.confirm && isCurrent()) await copyConsultationAndOpen(text,card,isCurrent); resolve() },
          fail:()=>resolve(),
        })
      },
    })
  })
}
