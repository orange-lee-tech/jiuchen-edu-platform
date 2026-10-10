import { runtimeConfig } from '../config/runtime'
import { getSavedAuthResult, refreshAuthResult, type UserRole } from './auth'

const CONTACT_ROLE_LABELS:Record<UserRole,string> = {
  admin:'管理员', teacher:'辅导老师', staff:'内部员工', student:'学员', user:'普通用户',
}

/**
 * WeCom's message card is only an optional draft the visitor must actively send.
 * Prefilling chat text is unsupported, so copy the checked identity statement.
 * All role and internal-ID values come from a fresh /auth/me response, NOT a
 * client-supplied target-role or impersonated account.
 */
export async function openVerifiedWechatCustomerService(purpose='联系九辰运营'):Promise<void>{
  const before=getSavedAuthResult()
  if(!before){
    wx.showModal({
      title:'尚未登录',content:'客服目前无法识别你的业务身份。请先登录后重新联系运营。',
      showCancel:false,
    })
    return
  }
  let auth
  try{auth=await refreshAuthResult()}catch{
    wx.showModal({
      title:'身份校验暂不可用',
      content:'无法向服务器核对你的账号角色，本次不会把缓存身份当作已认证信息发送。请稍后重试。',
      showCancel:false,
    })
    return
  }
  if(!auth){
    wx.showModal({
      title:'身份未通过验证',
      content:'本次没有从服务器确认登录身份，不能依赖本地缓存向客服宣称自己是老师或管理员。请稍后重试。',
      showCancel:false,
    })
    return
  }
  if(auth.user.id!==before.user.id || auth.session.token!==before.session.token){
    wx.showToast({title:'登录身份已变化，请重试',icon:'none'})
    return
  }
  const role=CONTACT_ROLE_LABELS[auth.user.role]
  const name=auth.user.displayName?.trim() || '（请填写姓名）'
  const internalId=auth.businessIdentity?.status==='claimed'
    ? auth.businessIdentity.businessId : ''
  const identityLines=[
    '【九辰客服 · 身份识别】',
    '咨询事项：'+purpose,
    '当前身份：'+role,
    '联系人：'+name,
    '九辰内部编号：'+(internalId||'尚未绑定'),
  ]
  const summary=identityLines.join('\n')
  const cardTitle=('九辰咨询｜'+role+'｜'+(internalId||name)).slice(0,48)
  wx.showModal({
    title:'确认客服识别信息',
    content:summary+'\n\n确认后复制信息并打开微信客服。请手动粘贴发送，或主动发送显示的身份卡片；不会后台自动提交。',
    confirmText:'复制并联系',
    success(result){
      if(!result.confirm)return
      const current=getSavedAuthResult()
      if(!current || current.user.id!==auth.user.id || current.session.token!==auth.session.token){
        wx.showToast({title:'账号已变更，请重试',icon:'none'})
        return
      }
      wx.setClipboardData({
        data:summary,
        success:()=>openWechatCustomerService({
          title:cardTitle,path:'/pages/profile/profile',
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
export function openWechatCustomerService(card?:CustomerServiceCard): void {
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

  wx.openCustomerServiceChat({
    corpId,
    extInfo: { url },
    ...(card ? {
      showMessageCard:true,
      sendMessageTitle:card.title,
      sendMessagePath:card.path,
    } : {}),
    success() {
      console.info('Opened WeChat customer service.', { corpId, url })
    },
    fail(error) {
      console.error('Failed to open WeChat customer service.', error)
      wx.showToast({
        title: '客服暂时无法打开，请稍后重试',
        icon: 'none',
      })
    },
  })
}
