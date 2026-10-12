export function openOfficialArticle(url:string){
  let parsed:URL
  try{parsed=new URL(url)}catch{wx.showToast({title:'原文链接无效',icon:'none'});return}
  if(parsed.protocol!=='https:'||parsed.hostname!=='mp.weixin.qq.com'){
    wx.showToast({title:'不是可验证的公众号原文',icon:'none'});return
  }
  if(typeof wx.openOfficialAccountArticle!=='function'){
    wx.showToast({title:'当前微信版本不支持打开公众号原文',icon:'none'});return
  }
  wx.openOfficialAccountArticle({url,fail:()=>wx.showToast({title:'原文无法打开，可能已下架',icon:'none'})})
}
