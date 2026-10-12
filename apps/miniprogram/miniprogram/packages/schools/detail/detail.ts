import { getSchoolById, MOE_985_SOURCE, MOE_211_SOURCE, C9_SOURCE,
  DOUBLE_FIRST_CLASS_2022_SOURCE, SCHOOL_AFFILIATIONS, type School } from '../data'
import { getMyAcademicProfile } from '../../../utils/request'
import { getSavedAuthResult, refreshAuthResult } from '../../../utils/auth'
import { SCHOOL_CAMPUS_POINTS, type SchoolCampusPoint } from '../campus-points'
import { copyConsultationAndOpen } from '../../../utils/customer-service'
import { buildSchoolConsultation } from '../../../utils/consultation-payload'
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
    campusOptions: [] as SchoolCampusPoint[],
    activeCampus: null as SchoolCampusPoint | null,
    campusIndex:0,
    consultBusy:false,
  },
  onLoad(options: Record<string,string|undefined>) {
    const school = getSchoolById(String(options.id || ''))
    if (!school) {
      wx.showModal({ title: '资料未找到', content: '学校可能尚未收录，返回院校库重新查找。', showCancel: false, success: () => wx.navigateBack() })
      return
    }
    wx.setNavigationBarTitle({ title: school.name })
    const audited = school.mapLocation ? [{
      campus:school.mapLocation.campus,
      latitude:school.mapLocation.latitude,longitude:school.mapLocation.longitude,
      sourceUrl:school.mapLocation.sourceUrl,address:school.address,quality:'verified' as const,
    }] : []
    const points = SCHOOL_CAMPUS_POINTS[school.name] || []
    // An audited campus remains first. Show alternative locations as references,
    // never replace a known campus with a city center or an uncertain POI.
    const campuses = [...audited,...points.filter(p=>
      !audited.some(v=>Math.abs(v.latitude-p.latitude)<.001&&Math.abs(v.longitude-p.longitude)<.001))]
    // Prefer the institution's established/traditional main campus when its
    // official location is known. Do not equate an unreviewed first POI with
    // 'main campus'. The photograph may depict another, clearly credited campus.
    const primaryCampus:Record<string,string>={
      '复旦大学':'邯郸',
      '南开大学':'八里台',
    }
    const preferred=primaryCampus[school.name]
    const campusIndex=preferred
      ? Math.max(0,campuses.findIndex(p=>p.campus.includes(preferred)))
      : Math.max(0,campuses.findIndex(p=>p.campus.includes('校本部')))
    const activeCampus=campuses[campusIndex] || null
    this.setData({
      school, heroLabel: school.name.slice(0,2),
      cityLabel: school.province === school.city ? school.city : school.province + ' · ' + school.city,
      tierLabel: school.is985 ? '985 / 211' : school.is211 ? '211 工程' :
        school.isDoubleFirst ? '双一流 · 非211' : '公办特色院校',
      circleLabel: school.groupTags[0]?.label || (school.isC9 ? 'C9' : '未分类'),
      hasIntro: Boolean(school.intro),
      photoVisible: Boolean(school.heroPhoto?.url),
      campusOptions:campuses,activeCampus,campusIndex,
      mapMarkers:activeCampus?[{
        id:1,latitude:activeCampus.latitude,
        longitude:activeCampus.longitude,
        title:school.name+' · '+activeCampus.campus,
      }]:[],
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
      map: this.data.activeCampus?.sourceUrl || school?.mapLocation?.sourceUrl || '',
    }
    const url = urls[key]
    if (!url || !/^https:\/\//.test(url)) return
    wx.setClipboardData({ data: url, success: () => wx.showToast({ title: '地址已复制', icon: 'success' }) })
  },
  onPhotoError() {
    this.setData({photoVisible:false})
  },
  onRetryPhoto(){
    if(!this.data.school?.heroPhoto)return
    this.setData({photoVisible:true})
  },
  onPreviewPhoto(){
    const photo=this.data.school?.heroPhoto
    if(!photo?.url || !this.data.photoVisible)return
    wx.previewImage({
      current:photo.url,urls:[photo.url],
      fail:()=>wx.showToast({title:'图片预览未打开，请检查网络',icon:'none'}),
    })
  },
  onSelectCampus(event:WechatMiniprogram.BaseEvent){
    const index=Number(event.currentTarget.dataset.index)
    const point=this.data.campusOptions[index],school=this.data.school
    if(!point||!school)return
    this.setData({
      campusIndex:index,activeCampus:point,
      mapMarkers:[{id:1,latitude:point.latitude,longitude:point.longitude,
        title:school.name+' · '+point.campus}],
    })
  },
  onOpenMap() {
    const school=this.data.school, location=this.data.activeCampus
    if(!school||!location)return
    wx.openLocation({
      latitude:location.latitude,longitude:location.longitude,
      name:school.name + ' · ' + location.campus,
      address:location.address || school.address || school.city,
      scale:16,
      fail:()=>wx.showToast({title:'地图暂不可用',icon:'none'}),
    })
  },
  async onConsultSchool() {
    if(!this.data.school || this.data.consultBusy)return
    this.setData({consultBusy:true})
    try { await this.prepareConsultSummary(this.data.school.name) }
    finally { this.setData({consultBusy:false}) }
  },
  async prepareConsultSummary(targetSchool:string) {
    const before=getSavedAuthResult()
    try {
      const auth=before ? await refreshAuthResult() : null
      if(before && (!auth || before.user.id!==auth.user.id || before.session.token!==auth.session.token)) {
        wx.showToast({title:'身份校验失败，请重试',icon:'none'}); return
      }
      const bound=auth?.user.role==='student' && auth.businessIdentity?.status==='claimed'
      const profile=bound ? await getMyAcademicProfile().catch(()=>null) : null
      const isCurrent=()=>{
        const current=getSavedAuthResult()
        return before ? current?.user.id===before.user.id && current?.session.token===before.session.token : !current
      }
      const text=buildSchoolConsultation(targetSchool,{
        bound:Boolean(bound),userId:auth?.businessIdentity?.businessId,displayName:auth?.user.displayName,
      },profile)
      await copyConsultationAndOpen(text,{
        title:'九辰院校咨询｜'+targetSchool,
        path:'/packages/schools/detail/detail?id='+encodeURIComponent(this.data.school?.id||''),
      },isCurrent)
    } catch {
      wx.showToast({title:'咨询信息准备失败，请重试',icon:'none'})
    }
  },

  onCopyAddress() {
    const address = this.data.school?.address
    if (!address) return
    wx.setClipboardData({ data: address, success: () => wx.showToast({ title: '地址已复制', icon: 'success' }) })
  },
})

