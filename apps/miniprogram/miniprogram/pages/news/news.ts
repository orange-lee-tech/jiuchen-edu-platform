import { getSavedAuthResult } from '../../utils/auth'
import { INITIAL_SHELL, observeSlot, openPage, shellView } from '../../utils/navigation'
import { getNewsListing, getMyNewsFavorites, type NewsFavorite, type NewsPost } from '../../utils/request'

import {newsPublicationLabel} from '../../utils/news-date'
import { newsTagScopeNote } from '../../utils/teacher-news-tags'
import { getReadOnlyContext } from '../../utils/read-only-context'
import { openOfficialArticle } from '../../utils/official-article'

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
  scopeNote: string
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
  scopeNote: '',
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
    rawTagNote: post.tags.some(tag => /^\d+$/.test(tag.trim())) ? `未核实分类 ${post.tags.filter(tag => /^\d+$/.test(tag.trim())).join('、')}` : '',
    scopeNote: newsTagScopeNote(post),
    primaryTag: post.tags[0] || '未分类',
    coverUrl: normalizeRemoteUrl(post.coverUrl),
    coverFailed: false,
  }
}

const NEWS_SECTIONS = ['最新', '全部']
function matchesNewsSection(card: NewsCard, section: string) {
  if (section === '最新' || section === '全部') return true
  return section === '未分类' ? card.tags.length === 0 : card.tags.includes(section)
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
    categories: [] as string[],
    sections: NEWS_SECTIONS, currentSection: '最新',
    selectedTags: [] as string[], tagChoices: [] as Array<{ name: string; selected: boolean }>, filtersOpen: false, favoritesOpen: false,
    loadError: '',
    showReferenceNews: false,
    canManageTeacherTags: false,
    searchQuery: '',
    loading: false,
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
  onShow() {
    this.stopShell?.()
    this.stopShell = observeSlot('opportunity', (state) => {
      this.viewGeneration += 1
      const view=shellView(state)
      if (state.phase === 'ready' && state.auth) {
        const viewerKey = [state.auth.user.id, state.auth.user.role, state.auth.businessIdentity?.businessId || ''].join(':')
        this.viewerKey = viewerKey
      } else if (state.phase !== 'loading') {
        this.viewerKey = ''
      }
      this.setData({ ...view, showReferenceNews: state.phase === 'ready' && view.shellKind !== 'student',
        canManageTeacherTags: state.phase === 'ready' && state.auth?.user.role === 'teacher' && !getReadOnlyContext(),
        allArticles: [], articles: [], featured: FALLBACK_FEATURED, pendingClassificationCount: 0,
        sections: NEWS_SECTIONS, currentSection: '最新', categories: [], tagChoices: [], selectedTags: [], filtersOpen: false, favoritesOpen: false, searchQuery: '',
        favorites: [], favoritesError: '', retiring: [], newsV2Enabled: false })
      if (state.phase === 'ready') void this.loadNews()
    })
  },
  onHide() { this.stopShell?.(); this.viewGeneration += 1; this.setData({ shellPhase: 'loading',
    favorites: [], favoritesOpen: false, retiring: [], articles: [], allArticles: [], searchQuery: '', filtersOpen: false, selectedTags: [] }) },
  onUnload() { this.stopShell?.() },
  onSchools() { openPage('/packages/schools/directory/directory') },
  onTeacherNews() { this.setData({ showReferenceNews: true }); void this.loadNews() },
  onTeacherNewsTags() {
    if (this.data.canManageTeacherTags) openPage('/pages/teacher-news-tags/teacher-news-tags')
  },
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
          categories: [], tagChoices: [], selectedTags: [],
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
        ? posts.filter((post) => (post.globalTags ?? post.tags).length === 0).length
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
          categories: [], tagChoices: [], selectedTags: [],
          sections: NEWS_SECTIONS, currentSection: '最新',
          featured: FALLBACK_FEATURED,
          allArticles: [],
          articles: [],
          pendingClassificationCount,
          pendingClassificationRole,
        })
        return
      }

      const sections = [...NEWS_SECTIONS, ...uniqueTags(cards).filter(tag => tag !== '其他' && !NEWS_SECTIONS.includes(tag))]
      const currentSection = sections.includes(this.data.currentSection) ? this.data.currentSection : '最新'
      const categories = uniqueTags(cards).filter(tag => tag !== '其他' && !NEWS_SECTIONS.includes(tag))
      const selectedTags = this.data.selectedTags.filter(tag => categories.includes(tag))
      const filtered = this.filterArticles(cards, this.data.searchQuery, currentSection, selectedTags)

      this.setData({
        categories,
        tagChoices: categories.map(name => ({ name, selected: selectedTags.includes(name) })),
        sections, currentSection, selectedTags,
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

  /** Search and tag selection only affect news, never favorites. */
  filterArticles(
    articles: NewsCard[],
    query?: string,
    section?: string,
    tags?: string[],
  ) {
    const keyword = (query ?? this.data.searchQuery).trim().toLocaleLowerCase()
    const activeSection = section ?? this.data.currentSection
    const activeTags = tags ?? this.data.selectedTags
    const filtered = articles.filter(article => {
      const tagMatches = !activeTags.length || activeTags.some(tag =>
        tag === '未分类' ? article.tags.length === 0 : article.tags.includes(tag))
      const queryMatches = !keyword || [article.title, article.summary, article.sourceLabel, ...article.tags, ...article.rawTags]
        .some(value => value.toLocaleLowerCase().includes(keyword))
      return matchesNewsSection(article, activeSection) && tagMatches && queryMatches
    })
    // Latest is a concise view of the first ten items in the server-provided feed order.
    return activeSection === '最新' ? filtered.slice(0, 10) : filtered
  },
  refreshFilteredArticles(query?: string, section?: string, tags?: string[]) {
    const filtered = this.filterArticles(this.data.allArticles, query, section, tags)
    this.setData({ featured: filtered[0] || FALLBACK_FEATURED, articles: filtered.slice(1) })
  },
  onSearchInput(event: WechatMiniprogram.Input) {
    const searchQuery = String(event.detail.value || '').slice(0, 80)
    this.setData({ searchQuery })
    this.refreshFilteredArticles(searchQuery)
  },
  onFilterTap() {
    if (!this.data.allArticles.length) { wx.showToast({ title: '暂无可筛选资讯', icon: 'none' }); return }
    this.setData({ filtersOpen: !this.data.filtersOpen })
  },
  onSectionTap(event: WechatMiniprogram.BaseEvent) {
    const section = String(event.currentTarget.dataset.section || '')
    if (!this.data.sections.includes(section)) return
    // 横向导航是单选；切换时清除下拉复选状态，避免两组标签交叉筛选。
    const searchQuery = section === '全部' ? '' : this.data.searchQuery
    this.setData({ currentSection: section, selectedTags: [], searchQuery, filtersOpen: false,
      tagChoices: this.data.categories.map(name => ({ name, selected: false })) })
    this.refreshFilteredArticles(searchQuery, section, [])
  },
  onFilterCheckboxChange(event: WechatMiniprogram.CustomEvent<{ value: string[] }>) {
    const selected = Array.isArray(event.detail.value) ? event.detail.value : []
    const selectedTags = this.data.categories.filter(tag => tag !== '其他' && selected.includes(tag))
    // 使用下拉复选时，主导航切到「全部」，所选标签按 OR 组合。
    this.setData({ currentSection: '全部', selectedTags,
      tagChoices: this.data.categories.map(name => ({ name, selected: selectedTags.includes(name) })) })
    this.refreshFilteredArticles(this.data.searchQuery, '全部', selectedTags)
  },
  onClearTags() {
    this.setData({ currentSection: '全部', selectedTags: [],
      tagChoices: this.data.categories.map(name => ({ name, selected: false })) })
    this.refreshFilteredArticles(this.data.searchQuery, '全部', [])
  },
  onManageNewsTags() {
    if (this.data.pendingClassificationRole !== 'admin') return
    openPage('/pages/admin/admin?section=admin-news')
  },

  onCoverError(event: WechatMiniprogram.BaseEvent) {
    const id = String(event.currentTarget.dataset.id || '')
    if (!id) return

    const allArticles = this.data.allArticles.map((article) =>
      article.id === id
        ? { ...article, coverFailed: true }
        : article,
    )
    const filtered = this.filterArticles(allArticles)

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
  onToggleFavorites() { this.setData({ favoritesOpen: !this.data.favoritesOpen }) },
  onFavoriteTap(event: WechatMiniprogram.BaseEvent) {
    const post = this.data.favorites.find(item => item.postId === event.currentTarget.dataset.id)
    if (post) openOfficialArticle(post.articleUrl)
  },
})
