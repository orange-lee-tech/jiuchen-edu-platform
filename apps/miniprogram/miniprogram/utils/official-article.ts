export function openOfficialArticle(url:string){
  // The WeChat JS runtime does not guarantee a global URL constructor.
  const original=typeof url==='string'?url.trim():''
  if(!/^https:\/\/mp\.weixin\.qq\.com\/s(?:\/|\?)/i.test(original)){
    wx.showToast({title:'不是可验证的公众号原文',icon:'none'});return
  }
  const copyForManualOpen=()=>wx.setClipboardData({
    data:original,
    success:()=>wx.showModal({title:'原文链接已复制',content:'微信暂时无法直接打开这篇原文。请在微信聊天中粘贴链接后打开。',showCancel:false}),
    fail:()=>wx.showToast({title:'原文无法打开或复制，请稍后重试',icon:'none'}),
  })
  if(typeof wx.openOfficialAccountArticle!=='function'){
    copyForManualOpen();return
  }
  wx.openOfficialAccountArticle({url:original,fail:error=>{
    console.info('Official article open failed.',{errCode:error.errCode})
    copyForManualOpen()
  }})
}
