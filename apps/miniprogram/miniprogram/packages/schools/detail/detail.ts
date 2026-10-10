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
      itemList:['仅咨询这所学校','携带我的姓名、年级与专业咨询'],
      success:result=>{
        if(result.tapIndex===0) {
          openWechatCustomerService()
          return
        }
        if(result.tapIndex!==1)return
        void this.prepareConsultSummary(school.name)
      },
    })
  },
  async prepareConsultSummary(targetSchool:string) {
    const session=getSavedAuthResult()
    if(!session?.user) {
      wx.showModal({
        title:'请先登录',
        content:'要携带个人学业资料咨询，需要先登录。你也可以重新选择“仅咨询这所学校”。',
        showCancel:false,
      })
      return
    }
    let profile
    let studentName = ''
    try {
      const [academic, classroom] = await Promise.all([
        getMyAcademicProfile(),
        getMyClassroom().catch(() => null),
      ])
      profile = academic
      studentName = classroom?.student.name?.trim() || ''
    } catch {
      wx.showModal({title:'学业资料暂不可用',
        content:'没有读取成功，本次不会附加姓名、年级或专业。可重新选择“仅咨询这所学校”。',
        showCancel:false})
      return
    }
    // The data is shown for explicit review; wx.openCustomerServiceChat
    // cannot prefill or auto-send a customer-service message.
    const summary=[
      '【九辰院校咨询】','目标学校：'+targetSchool,
      '用户姓名（发送前核对）：'+(studentName || session.user.displayName?.trim() || '未填写'),
      '就读年级：'+(profile.currentGrade?.trim()||'未填写'),
      '用户专业：'+(profile.major?.trim()||'未填写'),
    ].join('\n')
    wx.showModal({
      title:'确认携带哪些资料',
      content:summary+'\n\n确认后将复制上述信息并打开九辰客服。请在聊天框手动粘贴、检查并发送；不会自动传输。',
      confirmText:'复制并咨询',
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
  onCopyAddress() {
    const address = this.data.school?.address
    if (!address) return
    wx.setClipboardData({ data: address, success: () => wx.showToast({ title: '地址已复制', icon: 'success' }) })
  },
})
