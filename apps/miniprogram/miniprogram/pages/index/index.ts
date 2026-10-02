import { getProducts } from '../../utils/request'
import { openWechatCustomerService } from '../../utils/customer-service'

type AnyRecord = Record<string, unknown>

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as AnyRecord)
    : {}
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asStrings(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string')
  }
  return typeof value === 'string' && value ? [value] : []
}

Page({
  data: {
    quickEntries: [
      { key: 'assessment', icon: 'AI', title: 'AI 保研定位', desc: '结合背景与目标生成定位建议', tone: 'blue' },
      { key: 'planning', icon: '规', title: '规划定位', desc: '进入真实阶段计划与课表', tone: 'violet' },
      { key: 'library', icon: '校', title: '院校库', desc: '检索已同步院校、项目与服务资料', tone: 'cyan' },
      { key: 'news', icon: '讯', title: '资讯库', desc: '打开已同步政策与招生动态', tone: 'orange' },
    ],
    cases: [
      { title: '案例库正在接入', result: '结构化案例将在审核后展示', tag: '真实案例' },
    ],
    servicePlans: [] as Array<{
      documentKey: string
      name: string
      coverAsset: string
      meta: string
    }>,
    updates: [
      { school: '九辰资讯', title: '服务号最新文章已接入资讯同步链路', date: '持续同步' },
    ],
  },

  onLoad() {
    void this.loadServicePlans()
  },

  async loadServicePlans() {
    try {
      const products = await getProducts()
      this.setData({
        servicePlans: products.slice(0, 3).map((item) => {
          const product = asRecord(item.product)
          const period = asRecord(product.service_period)
          const price = asString(asRecord(product.price).display)
          const serviceCount =
            typeof product.service_count === 'number'
              ? `${product.service_count}项服务`
              : ''
          const taglines = asStrings(product.tagline)
          const meta = [
            serviceCount,
            asString(period.display) || asString(period.description),
            price,
          ]
            .filter(Boolean)
            .join(' · ')

          return {
            documentKey: item.documentKey,
            name: item.productName,
            coverAsset: asString(product.cover_asset),
            meta: meta || taglines[0] || '查看服务详情',
          }
        }),
      })
    } catch (error) {
      console.info('Bundled service plans are temporarily unavailable.', error)
    }
  },

  onCustomerServiceTap() {
    openWechatCustomerService()
  },

  onBrandTap() {
    wx.navigateTo({ url: '/pages/brand/brand' })
  },

  onSearchTap() {
    wx.navigateTo({ url: '/pages/library/library' })
  },

  onEntryTap(event: WechatMiniprogram.BaseEvent) {
    const key = String(event.currentTarget.dataset.key || '')
    if (key === 'assessment') {
      wx.switchTab({ url: '/pages/position/position' })
      return
    }
    if (key === 'planning') {
      wx.switchTab({ url: '/pages/classroom/classroom' })
      return
    }
    if (key === 'library') {
      wx.navigateTo({ url: '/pages/library/library' })
      return
    }
    if (key === 'news') {
      wx.switchTab({ url: '/pages/news/news' })
    }
  },

  onAllProducts() {
    wx.navigateTo({ url: '/pages/products/products' })
  },

  onProductTap(event: WechatMiniprogram.BaseEvent) {
    const documentKey = String(event.currentTarget.dataset.key || '')
    if (!documentKey) return

    wx.navigateTo({
      url: `/pages/product-detail/product-detail?documentKey=${encodeURIComponent(documentKey)}`,
    })
  },
})
