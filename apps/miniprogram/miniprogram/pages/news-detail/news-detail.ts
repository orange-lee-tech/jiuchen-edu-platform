import { getNewsPost, type NewsPostDetail } from '../../utils/request'

function formatDate(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}

Page({
  data: {
    loading: true,
    error: '',
    post: null as NewsPostDetail | null,
    dateLabel: '',
  },

  onLoad(options: Record<string, string | undefined>) {
    const id = options.id ? decodeURIComponent(options.id) : ''
    if (!id) {
      this.setData({ loading: false, error: '缺少资讯 ID' })
      return
    }
    void this.loadPost(id)
  },

  async loadPost(id: string) {
    try {
      this.setData({ loading: true, error: '' })
      const post = await getNewsPost(id)
      this.setData({
        post,
        dateLabel: formatDate(post.publishedAt),
      })
    } catch (error) {
      console.info('News detail load failed.', error)
      this.setData({ error: '资讯正文暂时无法加载，请稍后重试' })
    } finally {
      this.setData({ loading: false })
    }
  },

  onOpenOriginal() {
    const url = this.data.post?.articleUrl || ''
    if (!url) {
      wx.showToast({ title: '暂无服务号原文链接', icon: 'none' })
      return
    }

    const api = wx as unknown as {
      openOfficialAccountArticle?: (options: {
        url: string
        success?: () => void
        fail?: () => void
      }) => void
    }

    if (api.openOfficialAccountArticle) {
      api.openOfficialAccountArticle({
        url,
        fail() {
          wx.setClipboardData({
            data: url,
            success() {
              wx.showToast({ title: '原文链接已复制', icon: 'none' })
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

  onRetry() {
    const pages = getCurrentPages()
    const current = pages[pages.length - 1]
    const id = String((current?.options as Record<string, string> | undefined)?.id || '')
    if (id) void this.loadPost(decodeURIComponent(id))
  },
})
