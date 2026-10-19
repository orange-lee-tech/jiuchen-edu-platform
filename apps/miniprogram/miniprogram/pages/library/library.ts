import {
  getNewsPosts,
  getProducts,
  type NewsPost,
  type ProductSummary,
} from '../../utils/request'

type LibraryItem = {
  id: string
  kind: 'news' | 'product'
  eyebrow: string
  title: string
  desc: string
  articleUrl: string
  documentKey: string
}

function productItem(product: ProductSummary): LibraryItem {
  const raw = product.product as Record<string, unknown>
  const tagline = Array.isArray(raw.tagline)
    ? raw.tagline.filter((item): item is string => typeof item === 'string').join(' · ')
    : ''
  return {
    id: `product:${product.documentKey}`,
    kind: 'product',
    eyebrow: '九辰服务方案',
    title: product.productName,
    desc: tagline || '结构化产品资料',
    articleUrl: '',
    documentKey: product.documentKey,
  }
}

function newsItem(post: NewsPost): LibraryItem {
  return {
    id: `news:${post.id}`,
    kind: 'news',
    eyebrow: '同步资讯',
    title: post.title,
    desc: post.summary || '点击查看原文',
    articleUrl: post.articleUrl || '',
    documentKey: '',
  }
}

Page({
  data: {
    query: '',
    loading: true,
    allItems: [] as LibraryItem[],
    items: [] as LibraryItem[],
  },

  onLoad() {
    void this.loadData()
  },

  async loadData() {
    try {
      const [products, news] = await Promise.all([
        getProducts(),
        getNewsPosts().catch(() => []),
      ])
      const allItems = [
        ...news.map(newsItem),
        ...products.map(productItem),
      ]
      this.setData({ allItems, items: allItems })
    } catch (error) {
      console.info('Library data unavailable.', error)
      wx.showToast({ title: '资料库暂时无法加载', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  onSearchInput(event: WechatMiniprogram.Input) {
    const query = event.detail.value.trim().toLowerCase()
    const items = query
      ? this.data.allItems.filter((item) =>
          [item.eyebrow, item.title, item.desc]
            .join(' ')
            .toLowerCase()
            .includes(query),
        )
      : this.data.allItems
    this.setData({ query: event.detail.value, items })
  },

  onItemTap(event: WechatMiniprogram.BaseEvent) {
    const index = Number(event.currentTarget.dataset.index)
    const item = this.data.items[index]
    if (!item) return

    if (item.kind === 'product') {
      wx.navigateTo({
        url: `/pages/product-detail/product-detail?documentKey=${encodeURIComponent(item.documentKey)}`,
      })
      return
    }

    if (!item.articleUrl) {
      wx.showToast({ title: '该条目暂无原文链接', icon: 'none' })
      return
    }

    const api = wx as unknown as {
      openOfficialAccountArticle?: (options: {
        url: string
        fail?: () => void
      }) => void
    }
    if (item.articleUrl.includes('mp.weixin.qq.com') && api.openOfficialAccountArticle) {
      api.openOfficialAccountArticle({
        url: item.articleUrl,
        fail: () => wx.setClipboardData({ data: item.articleUrl }),
      })
      return
    }
    wx.setClipboardData({ data: item.articleUrl })
  },
})
