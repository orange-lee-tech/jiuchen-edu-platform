import { getSavedAuthResult } from '../../utils/auth'
import { INITIAL_SHELL, observeSlot, openPage, shellView } from '../../utils/navigation'
import { getNewsListing, getMyNewsFavorites, type NewsFavorite, type NewsPost } from '../../utils/request'

import {newsPublicationLabel} from '../../utils/news-date'

type NewsCard = {
  isVideo:boolean
  id: string
  title: string
  summary: string
  sourceLabel: string
  dateLabel: string
  tags: string[]
  rawTags: string[]
  rawTagNote: string
  primaryTag: string
  coverUrl: string
  coverFailed: boolean
}

const FALLBACK_FEATURED: NewsCard = {
  isVideo:false,
  id: '',
  title: '暂无可展示的资讯',
  summary: '已分类文章会在这里展示；请稍后刷新，或联系老师了解近期资讯。',
  sourceLabel: '',
  dateLabel: '',
  tags: [],
  rawTags: [],
  rawTagNote: '',
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
    isVideo:post.mediaType==='video',
    id: post.id,
    title: post.title,
    summary: (post.summary ?? '').replace(/\\(?:x0[ad]|[nr])/gi, ' ').replace(/\s+/g, ' ').trim(),
    sourceLabel: post.source === 'manual' ? '九辰编辑' : post.publicationTimeSource === 'admin_verified_publish_record' ? '九辰教育服务号 · 管理员核实原文' : '九辰教育服务号',
    dateLabel: newsPublicationLabel(post),
    tags: [...new Set(post.tags.map(tag => /^\d+$/.test(tag.trim()) ? '分类待核实' : tag))],
    rawTags: post.tags,
    rawTagNote: post.tags.some(tag => /^\d+$/.test(tag.trim())) ? `原始标签 ${post.tags.filter(tag => /^\d+$/.test(tag.trim())).join('、')}，待核实` : '',
    primaryTag: post.tags[0] || '未分类',
    coverUrl: normalizeRemoteUrl(post.coverUrl),
    coverFailed: false,
  }
}

const NEWS_SECTIONS = ['最新', '招生通知', '经验分享', '学科竞赛', '就业', '其他']
function newsSection(tag: string) {
  if (['招生通知', '招生', '推免通知', '夏令营通知'].includes(tag)) return '招生通知'
  if (['经验分享', '经验', '案例分享'].includes(tag)) return '经验分享'
  if (['学科竞赛', '竞赛', '比赛'].includes(tag)) return '学科竞赛'
  if (['就业', '招聘', '秋招', '实习'].includes(tag)) return '就业'
  return '其他'
}
function matchesNewsSection(card: NewsCard, section: string) {
  if (section === '最新') return true
  const tags = card.rawTags || card.tags
  return tags.length ? tags.some(tag => newsSection(tag) === section) : section === '其他'
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

  return tags
}

Page({
  data: {
    ...INITIAL_SHELL,
    categories: ['全部'],
    sections: ['最新'], currentSection: '最新',
    loadError: '',
    showReferenceNews: false,
    currentCategory: 0,
    searchQuery: '',
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
  viewerKey: '',
  selectedCategoryName: '全部',
  onShow() {
    this.stopShell?.()
    this.stopShell = observeSlot('opportunity', (state) => {
      this.viewGeneration += 1
      const view=shellView(state)
      if (state.phase === 'ready' && state.auth) {
        const viewerKey = [state.auth.user.id, state.auth.user.role, state.auth.businessIdentity?.businessId || ''].join(':')
        if (viewerKey !== this.viewerKey) this.selectedCategoryName = '全部'
        this.viewerKey = viewerKey
      } else if (state.phase !== 'loading') {
        this.viewerKey = ''
        this.selectedCategoryName = '全部'
      }
      this.setData({ ...view, showReferenceNews: state.phase === 'ready' && view.shellKind !== 'student',
        allArticles: [], articles: [], featured: FALLBACK_FEATURED, pendingClassificationCount: 0, sections: ['最新'], currentSection: '最新',
        favorites: [], favoritesError: '', retiring: [], newsV2Enabled: false })
      if (state.phase === 'ready') void this.loadNews()
    })
  },
  onHide() { this.stopShell?.(); this.viewGeneration += 1; this.setData({ shellPhase: 'loading',
    favorites: [], retiring: [], articles: [], allArticles: [], searchQuery: '' }) },
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
          sections: NEWS_SECTIONS, currentSection: '最新',
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
          sections: NEWS_SECTIONS, currentSection: '最新',
          featured: FALLBACK_FEATURED,
          allArticles: [],
          articles: [],
          pendingClassificationCount,
          pendingClassificationRole,
        })
        return
      }

      const sections = NEWS_SECTIONS
      const currentSection = sections.includes(this.data.currentSection) ? this.data.currentSection : '最新'
      const categories = ['全部', ...uniqueTags(cards.filter(card => matchesNewsSection(card, currentSection)))]
      const currentCategory = Math.max(0, categories.indexOf(this.selectedCategoryName))
      const filtered = this.filterArticles(cards, currentCategory, categories, undefined, currentSection)

      this.setData({
        sourceLabel: '真实资讯 · 人工分类',
        categories,
        sections, currentSection,
        currentCategory,
        featured: filtered[0] || FALLBACK_FEATURED,
        allArticles: cards,
        articles: filtered.slice(1),
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
    query?: string,
    section?: string,
  ) {
    const category = categories[categoryIndex]
    const keyword = (query ?? this.data.searchQuery).trim().toLocaleLowerCase()
    return articles.filter(article => {
      const categoryMatches = categoryIndex === 0 || (category === '未分类' ? article.tags.length === 0 : article.tags.includes(category))
      return matchesNewsSection(article, section ?? this.data.currentSection) && categoryMatches && (!keyword || [article.title, article.summary, article.sourceLabel, ...article.tags, ...(article.rawTags || [])].some(value => value.toLocaleLowerCase().includes(keyword)))
    })
  },

  onSearchInput(event: WechatMiniprogram.Input) {
    const searchQuery = String(event.detail.value || '').slice(0, 80)
    const filtered = this.filterArticles(this.data.allArticles, this.data.currentCategory, this.data.categories, searchQuery)
    this.setData({ searchQuery, featured: filtered[0] || FALLBACK_FEATURED, articles: filtered.slice(1) })
  },
  onFilterTap() {
    if (!this.data.allArticles.length) { wx.showToast({ title: '暂无可筛选资讯', icon: 'none' }); return }
    wx.pageScrollTo({ selector: '.category-scroll', duration: 200 })
  },
  onSectionTap(event: WechatMiniprogram.BaseEvent) {
    const section = String(event.currentTarget.dataset.section || '')
    if (!this.data.sections.includes(section)) return
    const categories = ['全部', ...uniqueTags(this.data.allArticles.filter(card => matchesNewsSection(card, section)))]
    const filtered = this.filterArticles(this.data.allArticles, 0, categories, undefined, section)
    this.selectedCategoryName = '全部'
    this.setData({ currentSection: section, categories, currentCategory: 0, featured: filtered[0] || FALLBACK_FEATURED, articles: filtered.slice(1) })
  },

  onManageNewsTags() {
    if (this.data.pendingClassificationRole !== 'admin') return
    openPage('/pages/admin/admin?section=admin-news')
  },

  onCategoryTap(event: WechatMiniprogram.BaseEvent) {
    const currentCategory = Number(event.currentTarget.dataset.index)
    if (!this.data.categories[currentCategory]) return
    this.selectedCategoryName = this.data.categories[currentCategory]
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
    if (post) openPage(`/pages/news-detail/news-detail?id=${encodeURIComponent(post.postId)}`)
  },
})
