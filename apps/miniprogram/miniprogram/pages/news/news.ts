import { getSavedAuthResult } from '../../utils/auth'
import { INITIAL_SHELL, observeSlot, openPage, shellView } from '../../utils/navigation'
import { getNewsListing, getMyNewsFavorites, type NewsFavorite, type NewsPost } from '../../utils/request'
import { openOfficialArticle } from '../../utils/official-article'

import {newsPublicationLabel} from '../../utils/news-date'

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
  title: '暂无可展示的资讯',
  summary: '已分类文章会在这里展示；请稍后刷新，或联系老师了解近期资讯。',
  meta: '',
  tags: [],
  primaryTag: '近期关注',
  coverUrl: '',
  coverFailed: false,
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
    meta: [post.source === 'manual' ? '九辰编辑' : '九辰教育服务号', newsPublicationLabel(post)]
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
    ...INITIAL_SHELL,
    categories: ['全部'],
    loadError: '',
    showReferenceNews: false,
    currentCategory: 0,
    loading: false,
    sourceLabel: '真实资讯',
    featured: FALLBACK_FEATURED,
    articles: [] as NewsCard[],
    allArticles: [] as NewsCard[],
    pendingClassificationCount: 0,
    pendingClassificationRole: 'none' as 'none' | 'admin' | 'reviewer',
    retiring: [] as Array<NewsCard & { retireAt: string }>,
    favorites: [] as NewsFavorite[],
    newsV2Enabled: false,
    favoritesError: '',
  },

  stopShell: undefined as (() => void) | undefined,
  viewGeneration: 0,
  onShow() {
    this.stopShell?.()
    this.stopShell = observeSlot('opportunity', (state) => {
      this.viewGeneration += 1
      this.setData({ ...shellView(state), showReferenceNews: false, allArticles: [], articles: [], featured: FALLBACK_FEATURED, pendingClassificationCount: 0 })
      if (state.phase === 'ready' && this.data.shellKind === 'student') void this.loadNews()
    })
  },
  onHide() { this.stopShell?.(); this.viewGeneration += 1; this.setData({ shellPhase: 'loading' }) },
  onUnload() { this.stopShell?.() },
  onSchools() { openPage('/packages/schools/directory/directory') },
  onReferenceNews() {
    this.setData({ showReferenceNews: !this.data.showReferenceNews })
    if (this.data.showReferenceNews) void this.loadNews()
  },

  async loadNews() {
    const generation = this.viewGeneration
    try {
      this.setData({ loading: true, loadError: '' })
      const auth = getSavedAuthResult()
      const role = auth?.user.role ?? 'user'
      const canSeeUnclassified = ['teacher', 'staff', 'admin'].includes(role)
      const listing = await getNewsListing()
      const posts = listing.posts
      if (generation !== this.viewGeneration) return
      this.setData({
        newsV2Enabled: listing.v2,
        retiring: listing.retiring.map(post => ({ ...toCard(post), retireAt: post.retireAt || '' })),
        favorites: [], favoritesError: '',
      })
      if (listing.v2) {
        try {
          const favorites = await getMyNewsFavorites()
          if (generation !== this.viewGeneration) return
          this.setData({ favorites })
        } catch {
          if (generation !== this.viewGeneration) return
          this.setData({ favoritesError: '收藏暂时无法读取，请刷新重试。' })
        }
      }
      if (posts.length === 0) {
        this.setData({
          categories: ['全部'],
          currentCategory: 0,
          featured: FALLBACK_FEATURED,
          allArticles: [],
          articles: [],
          pendingClassificationCount: 0,
          pendingClassificationRole: 'none',
        })
        return
      }

      const pendingClassificationCount = canSeeUnclassified
        ? posts.filter((post) => post.tags.length === 0).length
        : 0
      const pendingClassificationRole = role === 'admin'
        ? 'admin'
        : canSeeUnclassified ? 'reviewer' : 'none'
      const visiblePosts = canSeeUnclassified
        ? posts
        : posts.filter((post) => post.tags.length > 0)

      const cards = visiblePosts.map(toCard)
      if (cards.length === 0) {
        this.setData({
          categories: ['全部'],
          currentCategory: 0,
          featured: FALLBACK_FEATURED,
          allArticles: [],
          articles: [],
          pendingClassificationCount,
          pendingClassificationRole,
        })
        return
      }

      const first = cards[0]
      const categories = ['全部', ...uniqueTags(cards)]

      this.setData({
        sourceLabel: '九辰教育服务号',
        categories,
        currentCategory: 0,
        featured: first,
        allArticles: cards,
        articles: cards.slice(1),
        pendingClassificationCount,
        pendingClassificationRole,
      })
    } catch (error) {
      if (generation !== this.viewGeneration) return
      console.info('Synchronized news is unavailable.', error)
      this.setData({
        loadError: '文章暂时无法加载，请检查网络后重试。',
        featured: FALLBACK_FEATURED,
        allArticles: [],
        articles: [],
        pendingClassificationCount: 0,
        pendingClassificationRole: 'none',
        retiring: [], favorites: [], newsV2Enabled: false,
      })
    } finally {
      if (generation === this.viewGeneration) this.setData({ loading: false })
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

  onManageNewsTags() {
    if (this.data.pendingClassificationRole !== 'admin') return
    openPage('/pages/admin/admin?section=admin-news')
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
  onFavoriteTap(event: WechatMiniprogram.BaseEvent) {
    const post = this.data.favorites.find(item => item.postId === event.currentTarget.dataset.id)
    if (post) openOfficialArticle(post.articleUrl)
  },
})
