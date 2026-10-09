import { SCHOOLS, SCHOOL_REGIONS, findSchools, type School } from '../../data'

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
    level: 'all' as 'all' | 'c9' | 'other985',
    region: '全部地区',
    regions: SCHOOL_REGIONS,
    showFilter: false,
    totalCount: SCHOOLS.length,
    c9Count: SCHOOLS.filter(s => s.isC9).length,
    schools: cards([...SCHOOLS]),
  },
  onLoad() {
    wx.setNavigationBarTitle({ title: '九辰院校库' })
  },
  refreshSchools() {
    this.setData({ schools: cards(findSchools(this.data.query,this.data.level,this.data.region)) })
  },
  onQuery(event: WechatMiniprogram.Input) {
    this.setData({ query: event.detail.value })
    this.refreshSchools()
  },
  onLevel(event: WechatMiniprogram.BaseEvent) {
    const level = String(event.currentTarget.dataset.level)
    if (level !== 'all' && level !== 'c9' && level !== 'other985') return
    this.setData({ level })
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
    this.setData({ region: '全部地区', level: 'all', query: '' })
    this.refreshSchools()
  },
  onSchool(event: WechatMiniprogram.BaseEvent) {
    const id = String(event.currentTarget.dataset.id)
    if (!SCHOOLS.some(s=>s.id===id)) return
    wx.navigateTo({ url: '/packages/schools/detail/detail?id=' + encodeURIComponent(id) })
  },
})
