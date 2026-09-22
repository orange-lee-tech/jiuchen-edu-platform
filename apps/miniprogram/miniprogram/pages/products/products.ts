import { getProducts } from '../../utils/request'

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
    loading: true,
    error: '',
    products: [] as Array<{
      documentKey: string
      name: string
      coverAsset: string
      taglines: string[]
      meta: string
      source: 'bundled' | 'database'
    }>,
  },

  onLoad() {
    void this.loadProducts()
  },

  async loadProducts() {
    try {
      this.setData({ loading: true, error: '' })
      const products = await getProducts()

      this.setData({
        products: products.map((item) => {
          const product = asRecord(item.product)
          const period = asRecord(product.service_period)
          const serviceCount =
            typeof product.service_count === 'number'
              ? `${product.service_count} 项服务`
              : ''
          const price = asString(asRecord(product.price).display)
          const periodDisplay =
            asString(period.display) || asString(period.description)

          return {
            documentKey: item.documentKey,
            name: item.productName,
            coverAsset: asString(product.cover_asset),
            taglines: asStrings(product.tagline),
            meta: [serviceCount, periodDisplay, price].filter(Boolean).join(' · '),
            source: item.source,
          }
        }),
      })
    } catch (error) {
      console.error('Failed to load products.', error)
      this.setData({
        error: '服务方案暂时无法加载，请稍后重试。',
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  onProductTap(event: WechatMiniprogram.BaseEvent) {
    const documentKey = String(event.currentTarget.dataset.key || '')
    if (!documentKey) return

    wx.navigateTo({
      url: `/pages/product-detail/product-detail?documentKey=${encodeURIComponent(documentKey)}`,
    })
  },
})
