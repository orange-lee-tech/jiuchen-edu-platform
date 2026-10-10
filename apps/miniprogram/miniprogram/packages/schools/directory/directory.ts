import {
  SCHOOLS, SCHOOL_GROUPS, SCHOOL_AFFILIATIONS, SCHOOL_REGIONS, findSchools,
  type School, type SchoolTier, type SchoolGroupKey, type SchoolAffiliationKey,
} from '../data'

type SchoolCard = School & { monogram: string; subtitle: string; cardTags: School['groupTags'] }
const PAGE_SIZE = 36
const LEVELS: ReadonlyArray<{value:SchoolTier;label:string}> = [
 {value:'all',label:'全部层次'},{value:'985',label:'985'},{value:'other211',label:'非985的211'},
 {value:'doubleFirst',label:'双一流（2022）'},{value:'nonDouble',label:'非985/211/双一流'},
 {value:'c9',label:'C9'},
]
function cards(schools: School[]): SchoolCard[] {
  return schools.map(s => ({
    ...s, monogram: s.name.slice(0,2),
    subtitle: s.province === s.city ? s.city : s.province+' · '+s.city,
    cardTags: s.groupTags.slice(0,3),
  }))
}
Page({
  data: {
    query:'',level:'all' as SchoolTier,region:'全部地区',
    group:'all' as SchoolGroupKey | 'all',
    affiliation:'all' as SchoolAffiliationKey | 'all',
    exactSchool:'',
    levels: LEVELS,
    groups: SCHOOL_GROUPS.map(item=>({key:item.key,label:item.label,description:item.description})),
    affiliations: SCHOOL_AFFILIATIONS.map(item=>({key:item.key,label:item.label})),
    regions: SCHOOL_REGIONS,
    showFilter:false,
    // Keep staged choices separate: closing the drawer cancels uncommitted edits.
    draftQuery:'',draftLevel:'all' as SchoolTier,draftRegion:'全部地区',
    draftGroup:'all' as SchoolGroupKey | 'all',
    draftAffiliation:'all' as SchoolAffiliationKey | 'all',
    draftExactSchool:'',
    candidateSchools:[] as Array<{name:string;id:string}>,
    previewCount:SCHOOLS.length,
    resultCount:SCHOOLS.length,
    schools:cards(SCHOOLS.slice(0,PAGE_SIZE)),
  },
  onLoad(){wx.setNavigationBarTitle({title:'九辰院校库'})},
  currentMatches(){
    return findSchools(this.data.query,this.data.level,this.data.region,
      this.data.group,this.data.affiliation,this.data.exactSchool)
  },
  refreshSchools(){
    const results=this.currentMatches()
    this.setData({resultCount:results.length,schools:cards(results.slice(0,PAGE_SIZE))})
  },
  onLoadMore(){
    if(this.data.schools.length>=this.data.resultCount)return
    const count=this.data.schools.length+PAGE_SIZE
    this.setData({schools:cards(this.currentMatches().slice(0,count))})
  },
  onReachBottom(){this.onLoadMore()},
  onQuery(event:WechatMiniprogram.Input){
    this.setData({query:event.detail.value,exactSchool:''})
    this.refreshSchools()
  },
  onLevel(event:WechatMiniprogram.BaseEvent){
    const value=String(event.currentTarget.dataset.level)
    if(!LEVELS.some(option=>option.value===value))return
    // Quick-select tabs show a full tier: the advanced drawer handles AND combinations.
    this.setData({level:value as SchoolTier,group:'all',exactSchool:''})
    this.refreshSchools()
  },
  onGroup(event:WechatMiniprogram.BaseEvent){
    const value=String(event.currentTarget.dataset.group)
    if(value!=='all' && !SCHOOL_GROUPS.some(option=>option.key===value))return
    // Quick circle = full circle. Multiple dimensions can still be ANDed in drawer.
    this.setData({group:value as SchoolGroupKey | 'all',level:'all',exactSchool:''})
    this.refreshSchools()
  },
  onOpenFilter(){
    this.setData({
      showFilter:true,
      draftQuery:this.data.query,draftLevel:this.data.level,draftRegion:this.data.region,
      draftGroup:this.data.group,draftAffiliation:this.data.affiliation,
      draftExactSchool:this.data.exactSchool,
    })
    this.previewFilter()
  },
  onStopFilterTap(){ /* Do not close the bottom sheet on internal taps. */ },
  onCloseFilter(){this.setData({showFilter:false})},
  previewFilter(){
    const choices=findSchools(this.data.draftQuery,this.data.draftLevel,
      this.data.draftRegion,this.data.draftGroup,
      this.data.draftAffiliation,this.data.draftExactSchool)
    const needle=this.data.draftQuery.trim().toLowerCase()
    const candidates=(needle
      ? SCHOOLS.filter(s=>s.name.toLowerCase().includes(needle) ||
        s.keywords.toLowerCase().includes(needle))
      : SCHOOLS).slice(0,20).map(s=>({id:s.id,name:s.name}))
    this.setData({previewCount:choices.length,candidateSchools:candidates})
  },
  onFilterQuery(event:WechatMiniprogram.Input){
    this.setData({draftQuery:event.detail.value,draftExactSchool:''})
    this.previewFilter()
  },
  onFilterRegion(event:WechatMiniprogram.BaseEvent){
    const value=String(event.currentTarget.dataset.region)
    if(!SCHOOL_REGIONS.includes(value))return
    this.setData({draftRegion:value});this.previewFilter()
  },
  onFilterLevel(event:WechatMiniprogram.BaseEvent){
    const value=String(event.currentTarget.dataset.level)
    if(!LEVELS.some(v=>v.value===value))return
    this.setData({draftLevel:value as SchoolTier});this.previewFilter()
  },
  onFilterGroup(event:WechatMiniprogram.BaseEvent){
    const value=String(event.currentTarget.dataset.group)
    if(value!=='all' && !SCHOOL_GROUPS.some(v=>v.key===value))return
    this.setData({draftGroup:value as SchoolGroupKey | 'all'});this.previewFilter()
  },
  onFilterAffiliation(event:WechatMiniprogram.BaseEvent){
    const value=String(event.currentTarget.dataset.affiliation)
    if(value!=='all' && !SCHOOL_AFFILIATIONS.some(v=>v.key===value))return
    this.setData({draftAffiliation:value as SchoolAffiliationKey | 'all'});this.previewFilter()
  },
  onFilterSchool(event:WechatMiniprogram.BaseEvent){
    const name=String(event.currentTarget.dataset.name)
    if(!SCHOOLS.some(s=>s.name===name))return
    this.setData({draftExactSchool:this.data.draftExactSchool===name?'':name})
    this.previewFilter()
  },
  onFilterReset(){
    this.setData({draftQuery:'',draftRegion:'全部地区',draftLevel:'all',
      draftGroup:'all',draftAffiliation:'all',draftExactSchool:''})
    this.previewFilter()
  },
  onFilterApply(){
    this.setData({
      query:this.data.draftQuery,region:this.data.draftRegion,
      level:this.data.draftLevel,group:this.data.draftGroup,
      affiliation:this.data.draftAffiliation,exactSchool:this.data.draftExactSchool,
      showFilter:false,
    })
    this.refreshSchools()
  },
  onReset(){
    this.setData({region:'全部地区',level:'all',group:'all',query:'',
      affiliation:'all',exactSchool:'',showFilter:false})
    this.refreshSchools()
  },
  onSchool(event:WechatMiniprogram.BaseEvent){
    const id=String(event.currentTarget.dataset.id)
    if(!SCHOOLS.some(s=>s.id===id))return
    wx.navigateTo({url:'/packages/schools/detail/detail?id='+encodeURIComponent(id)})
  },
})
