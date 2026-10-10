import { SCHOOLS, SCHOOL_GROUPS, SCHOOL_REGIONS, findSchools, type School, type SchoolTier, type SchoolGroupKey } from '../data'

type SchoolCard = School & { monogram: string; subtitle: string }

function cards(schools: School[]): SchoolCard[] {
  return schools.map(s => ({
    ...s,
    monogram: s.name.slice(0, 2),
    subtitle: s.province === s.city ? s.city : s.province + ' · ' + s.city,
  }))
}
Page({
  data: {
    query: '',
    level: 'all' as 'all' | '985' | '211' | 'c9' | 'other211',
    region: '全部地区',
    group: 'all' as SchoolGroupKey | 'all',
    groups: SCHOOL_GROUPS.map(item => ({
      ...item,
      count: SCHOOLS.filter(school => school.groupTags.some(tag => tag.key === item.key)).length,
    })),
    regions: SCHOOL_REGIONS,
    showFilter: false,
    totalCount: SCHOOLS.length,
    c9Count: SCHOOLS.filter(s => s.isC9).length,
    n985: SCHOOLS.filter(s => s.is985).length,
    nOther211: SCHOOLS.filter(s => !s.is985).length,
    schools: cards([...SCHOOLS]),
  },
  onLoad() {
    wx.setNavigationBarTitle({ title: '九辰院校库' })
  },
  refreshSchools() {
    this.setData({ schools: cards(findSchools(this.data.query,this.data.level,this.data.region,this.data.group)) })
  },
  onQuery(event: WechatMiniprogram.Input) {
    this.setData({ query: event.detail.value })
    this.refreshSchools()
  },
  onLevel(event: WechatMiniprogram.BaseEvent) {
    const level = String(event.currentTarget.dataset.level)
    if (!['all','985','211','c9','other211'].includes(level)) return
    this.setData({ level: level as SchoolTier })
    this.refreshSchools()
  },
  onGroup(event: WechatMiniprogram.BaseEvent) {
    const value = String(event.currentTarget.dataset.group)
    if (value !== 'all' && !SCHOOL_GROUPS.some(item => item.key === value)) return
    this.setData({ group: value as SchoolGroupKey | 'all' })
    this.refreshSchools()
  },
  onOpenFilter() { this.setData({ showFilter: true }) },
  onCloseFilter() { this.setData({ showFilter: false }) },
  onRegion(event: WechatMiniprogram.BaseEvent) {
    const region = String(event.currentTarget.dataset.region)
    if (!SCHOOL_REGIONS.includes(region)) return
    this.setData({ region })
    this.refreshSchools()
  },
  onReset() {
    this.setData({ region: '全部地区', level: 'all', group: 'all', query: '' })
    this.refreshSchools()
  },
  onSchool(event: WechatMiniprogram.BaseEvent) {
    const id = String(event.currentTarget.dataset.id)
    if (!SCHOOLS.some(s=>s.id===id)) return
    wx.navigateTo({ url: '/packages/schools/detail/detail?id=' + encodeURIComponent(id) })
  },
})
