import { getSavedAuthResult } from '../../utils/auth'
import { getNewsPosts, type NewsPost } from '../../utils/request'

type NewsCard = {
  id: string
  title: string
  summary: string
  meta: string
  tags: string[]
  primaryTag: string
  coverUrl: string
  coverFailed: boolean
}

const FALLBACK_FEATURED: NewsCard = {
  id: '',
  title: '真实资讯正在同步',
  summary: '这里只展示九辰已同步或已审核的真实内容，不再使用示例院校占位。',
  meta: '',
  tags: [],
  primaryTag: '近期关注',
  coverUrl: '',
  coverFailed: false,
}

function formatDate(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${month}-${day}`
}

function normalizeRemoteUrl(value: string | null | undefined) {
  if (!value) return ''
  return value.replace(/^http:\/\//i, 'https://')
}

function toCard(post: NewsPost): NewsCard {
  return {
    id: post.id,
    title: post.title,
    summary: post.summary ?? '',
    meta: ['九辰教育服务号', formatDate(post.publishedAt)]
      .filter(Boolean)
      .join(' · '),
    tags: post.tags,
    primaryTag: post.tags[0] || '未分类',
    coverUrl: normalizeRemoteUrl(post.coverUrl),
    coverFailed: false,
  }
}

function uniqueTags(cards: NewsCard[]) {
  const seen = new Set<string>()
  const tags: string[] = []

  cards.forEach((card) => {
    card.tags.forEach((tag) => {
      if (!seen.has(tag)) {
        seen.add(tag)
        tags.push(tag)
      }
    })
  })

  if (cards.some((card) => card.tags.length === 0)) {
    tags.push('未分类')
  }

  return tags.slice(0, 12)
}

Page({
  data: {
    categories: ['推荐'],
    currentCategory: 0,
    loading: false,
    sourceLabel: '真实资讯',
    featured: FALLBACK_FEATURED,
    articles: [] as NewsCard[],
    allArticles: [] as NewsCard[],
  },

  onShow() {
    void this.loadNews()
  },

  async loadNews() {
    try {
      this.setData({ loading: true })
      const posts = await getNewsPosts()
      if (posts.length === 0) {
        this.setData({
          categories: ['推荐'],
          currentCategory: 0,
          featured: FALLBACK_FEATURED,
          allArticles: [],
          articles: [],
        })
        return
      }

      const auth = getSavedAuthResult()
      const canSeeUnclassified = Boolean(
        auth && ['teacher', 'staff', 'admin'].includes(auth.user.role),
      )
      const visiblePosts = canSeeUnclassified
        ? posts
        : posts.filter((post) => post.tags.length > 0)

      const cards = visiblePosts.map(toCard)
      if (cards.length === 0) {
        this.setData({
          categories: ['推荐'],
          currentCategory: 0,
          featured: FALLBACK_FEATURED,
          allArticles: [],
          articles: [],
        })
        return
      }

      const first = cards[0]
      const categories = ['推荐', ...uniqueTags(cards)]

      this.setData({
        sourceLabel: '九辰教育服务号',
        categories,
        currentCategory: 0,
        featured: first,
        allArticles: cards,
        articles: cards.slice(1),
      })
    } catch (error) {
      console.info('Synchronized news is unavailable.', error)
      this.setData({
        featured: FALLBACK_FEATURED,
        allArticles: [],
        articles: [],
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  filterArticles(
    articles: NewsCard[],
    categoryIndex: number,
    categories: string[],
  ) {
    if (categoryIndex === 0) return articles
    const category = categories[categoryIndex]
    if (category === '未分类') {
      return articles.filter((article) => article.tags.length === 0)
    }
    return articles.filter((article) => article.tags.includes(category))
  },

  onCategoryTap(event: WechatMiniprogram.BaseEvent) {
    const currentCategory = Number(event.currentTarget.dataset.index)
    const filtered = this.filterArticles(
      this.data.allArticles,
      currentCategory,
      this.data.categories,
    )
    this.setData({
      currentCategory,
      featured: filtered[0] || FALLBACK_FEATURED,
      articles: filtered.slice(1),
    })
  },

  onCoverError(event: WechatMiniprogram.BaseEvent) {
    const id = String(event.currentTarget.dataset.id || '')
    if (!id) return

    const allArticles = this.data.allArticles.map((article) =>
      article.id === id
        ? { ...article, coverFailed: true }
        : article,
    )
    const filtered = this.filterArticles(
      allArticles,
      this.data.currentCategory,
      this.data.categories,
    )

    this.setData({
      allArticles,
      featured: filtered[0] || FALLBACK_FEATURED,
      articles: filtered.slice(1),
    })
  },

  onArticleTap(event: WechatMiniprogram.BaseEvent) {
    const id = String(event.currentTarget.dataset.id || '')
    if (!id) {
      wx.showToast({ title: '当前暂无可阅读内容', icon: 'none' })
      return
    }

    wx.navigateTo({
      url: `/pages/news-detail/news-detail?id=${encodeURIComponent(id)}`,
    })
  },
})
