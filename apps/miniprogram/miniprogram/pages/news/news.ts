import { getNewsPosts, type NewsPost } from '../../utils/request'

type NewsCard = {
  id: string
  title: string
  summary: string
  meta: string
  tag: string
  school: string
  articleUrl: string
}

const FALLBACK_FEATURED = {
  id: 'fallback-featured',
  tag: '近期关注',
  title: '推免准备进入信息密集期，如何建立自己的院校追踪表',
  summary: '把报名节点、材料要求与目标梯度放进同一套可追踪流程。',
  articleUrl: '',
}

const FALLBACK_ARTICLES: NewsCard[] = [
  { id: 'fallback-1', school: '示例大学', title: '2027 年优秀大学生夏令营通知', meta: '招生动态 · 09-18', tag: '夏令营', summary: '', articleUrl: '' },
  { id: 'fallback-2', school: '示例学院', title: '预推免报名材料与时间安排', meta: '招生动态 · 09-17', tag: '预推免', summary: '', articleUrl: '' },
  { id: 'fallback-3', school: '九辰整理', title: '从大一到大三：不同阶段最该关注什么', meta: '规划方法 · 09-15', tag: '经验', summary: '', articleUrl: '' },
  { id: 'fallback-4', school: '九辰整理', title: '如何判断一个项目是否值得重点准备', meta: '定位方法 · 09-13', tag: '经验', summary: '', articleUrl: '' },
]

function formatDate(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${month}-${day}`
}

function inferTag(title: string) {
  if (title.includes('预推免') || title.includes('推免')) return '推免'
  if (title.includes('科研') || title.includes('论文') || title.includes('SCI')) return '科研'
  if (title.includes('产品') || title.includes('九辰教育')) return '九辰'
  return '资讯'
}

function toCard(post: NewsPost): NewsCard {
  return {
    id: post.id,
    school: '九辰教育',
    title: post.title,
    summary: post.summary ?? '',
    meta: `服务号 · ${formatDate(post.publishedAt)}`,
    tag: inferTag(post.title),
    articleUrl: post.articleUrl ?? '',
  }
}

Page({
  data: {
    categories: ['推荐', '推免', '科研', '九辰'],
    currentCategory: 0,
    loading: false,
    sourceLabel: '静态预览',
    featured: FALLBACK_FEATURED,
    articles: FALLBACK_ARTICLES,
    allArticles: FALLBACK_ARTICLES,
  },

  onShow() {
    void this.loadNews()
  },

  async loadNews() {
    try {
      this.setData({ loading: true })
      const posts = await getNewsPosts()
      if (posts.length === 0) return

      const cards = posts.map(toCard)
      const first = cards[0]

      this.setData({
        sourceLabel: '九辰教育服务号',
        featured: {
          id: first.id,
          tag: '最新发布',
          title: first.title,
          summary: first.summary || '来自九辰教育服务号的最新发布内容。',
          articleUrl: first.articleUrl,
        },
        allArticles: cards.slice(1),
        articles: this.filterArticles(cards.slice(1), this.data.currentCategory),
      })
    } catch (error) {
      console.info('Synchronized news is unavailable; using local fallback.', error)
    } finally {
      this.setData({ loading: false })
    }
  },

  filterArticles(articles: NewsCard[], categoryIndex: number) {
    if (categoryIndex === 0) return articles
    const category = this.data.categories[categoryIndex]
    return articles.filter((article) => article.tag === category)
  },

  onCategoryTap(event: WechatMiniprogram.BaseEvent) {
    const currentCategory = Number(event.currentTarget.dataset.index)
    this.setData({
      currentCategory,
      articles: this.filterArticles(this.data.allArticles, currentCategory),
    })
  },

  onArticleTap(event: WechatMiniprogram.BaseEvent) {
    const url = String(event.currentTarget.dataset.url || '')

    if (!url) {
      wx.showToast({ title: '当前为预览内容', icon: 'none' })
      return
    }

    const api = wx as unknown as {
      openOfficialAccountArticle?: (options: {
        url: string
        success?: () => void
        fail?: () => void
      }) => void
    }

    if (url.includes('mp.weixin.qq.com') && api.openOfficialAccountArticle) {
      api.openOfficialAccountArticle({
        url,
        fail() {
          wx.setClipboardData({
            data: url,
            success() {
              wx.showToast({ title: '打开失败，链接已复制', icon: 'none' })
            },
          })
        },
      })
      return
    }

    wx.setClipboardData({
      data: url,
      success() {
        wx.showToast({ title: '原文链接已复制', icon: 'none' })
      },
    })
  },
})
