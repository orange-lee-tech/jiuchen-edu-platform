import { getSchoolById, MOE_985_SOURCE, MOE_211_SOURCE, C9_SOURCE,
  DOUBLE_FIRST_CLASS_2022_SOURCE, SCHOOL_AFFILIATIONS, type School } from '../data'
import { getMyAcademicProfile, getMyClassroom } from '../../../utils/request'
import { getSavedAuthResult } from '../../../utils/auth'
import { openWechatCustomerService } from '../../../utils/customer-service'
Page({
  data: {
    school: null as School | null,
    heroLabel: '',
    cityLabel: '',
    tierLabel: '',
    circleLabel: '',
    hasIntro: false,
    photoVisible: false,
    mapMarkers: [] as Array<{id:number;latitude:number;longitude:number;title:string}>,
  },
  onLoad(options: Record<string,string|undefined>) {
    const school = getSchoolById(String(options.id || ''))
    if (!school) {
      wx.showModal({ title: '资料未找到', content: '学校可能尚未收录，返回院校库重新查找。', showCancel: false, success: () => wx.navigateBack() })
      return
    }
    wx.setNavigationBarTitle({ title: school.name })
    this.setData({
      school, heroLabel: school.name.slice(0,2),
      cityLabel: school.province === school.city ? school.city : school.province + ' · ' + school.city,
      tierLabel: school.is985 ? '985 / 211' : school.is211 ? '211 工程' :
        school.isDoubleFirst ? '双一流 · 非211' : '公办特色院校',
      circleLabel: school.groupTags[0]?.label || (school.isC9 ? 'C9' : '未分类'),
      hasIntro: Boolean(school.intro),
      photoVisible: Boolean(school.heroPhoto?.url),
      mapMarkers: school.mapLocation ? [{
        id:1,latitude:school.mapLocation.latitude,
        longitude:school.mapLocation.longitude,
        title:school.name + ' · ' + school.mapLocation.campus,
      }] : [],
    })
  },
  copyUrl(event: WechatMiniprogram.BaseEvent) {
    const key = String(event.currentTarget.dataset.key)
    const school = this.data.school
    const urls: Record<string,string> = {
      website: school?.website || '',
      intro: school?.introSource || '',
      address: school?.addressSource || '',
      stats: school?.verifiedStats?.sourceUrl || '',
      admissions: school?.admissions?.url || '',
      catalogs: school?.admissions?.catalogsUrl || '',
      summer: school?.admissions?.summerUrl || '',
      moe: MOE_985_SOURCE, moe211: MOE_211_SOURCE, c9: C9_SOURCE,
      photo: school?.heroPhoto?.sourceUrl || '',
      photoLicense: school?.heroPhoto?.licenseUrl || '',
      doubleFirst: DOUBLE_FIRST_CLASS_2022_SOURCE,
      affiliation: SCHOOL_AFFILIATIONS.find(item=>item.key===school?.affiliationKey)?.sourceUrl || '',
      map: school?.mapLocation?.sourceUrl || '',
    }
    const url = urls[key]
    if (!url || !/^https:\/\//.test(url)) return
    wx.setClipboardData({ data: url, success: () => wx.showToast({ title: '地址已复制', icon: 'success' }) })
  },
  onPhotoError() {
    this.setData({photoVisible:false})
  },
  onPreviewPhoto(){
    const photo=this.data.school?.heroPhoto
    if(!photo?.url || !this.data.photoVisible)return
    wx.previewImage({
      current:photo.url,urls:[photo.url],
      fail:()=>wx.showToast({title:'图片预览未打开，请检查网络',icon:'none'}),
    })
  },
  onOpenMap() {
    const school=this.data.school, location=school?.mapLocation
    if(!school||!location)return
    wx.openLocation({
      latitude:location.latitude,longitude:location.longitude,
      name:school.name + ' · ' + location.campus,
      address:school.address || school.city,
      scale:16,
      fail:()=>wx.showToast({title:'地图暂不可用',icon:'none'}),
    })
  },
  onConsultSchool() {
    const school=this.data.school
    if(!school)return
    wx.showActionSheet({
      itemList:['携带目标学校咨询','携带目标学校 + 我的姓名、年级、专业'],
      success:result=>{
        if(result.tapIndex===0) this.confirmConsultSummary(['【九辰院校咨询】','目标学校：'+school.name].join('\n'))
        else if(result.tapIndex===1) void this.prepareConsultSummary(school.name)
      },
    })
  },
  confirmConsultSummary(summary:string){
    wx.showModal({
      title:'发送给九辰客服',
      content:summary+'\n\n确认后先复制这段信息，再打开微信客服。请在对话框粘贴并发送，微信不允许小程序替你自动发送。',
      confirmText:'复制并打开',
      success:result=>{
        if(!result.confirm)return
        wx.setClipboardData({
          data:summary,
          success:()=>openWechatCustomerService(),
          fail:()=>wx.showToast({title:'复制未成功，请重试',icon:'none'}),
        })
      },
    })
  },
  async prepareConsultSummary(targetSchool:string) {
    const session=getSavedAuthResult()
    let name=session?.user.displayName?.trim()||''
    let grade='',major=''
    // Admin/teacher accounts may have no student profile. This must never stall
    // the consultation action: show only known values and let the user fill gaps.
    if(session?.user.role==='student') {
      const [profile,classroom]=await Promise.all([
        getMyAcademicProfile().catch(()=>null),
        getMyClassroom().catch(()=>null),
      ])
      name=classroom?.student.name?.trim()||name
      grade=profile?.currentGrade?.trim()||''
      major=profile?.major?.trim()||''
    }
    const summary=[
      '【九辰院校咨询】','目标学校：'+targetSchool,
      '用户姓名：'+(name||'（请填写）'),
      '就读年级：'+(grade||'（请填写）'),
      '用户专业：'+(major||'（请填写）'),
    ].join('\n')
    this.confirmConsultSummary(summary)
  },
  onCopyAddress() {
    const address = this.data.school?.address
    if (!address) return
    wx.setClipboardData({ data: address, success: () => wx.showToast({ title: '地址已复制', icon: 'success' }) })
  },
})
