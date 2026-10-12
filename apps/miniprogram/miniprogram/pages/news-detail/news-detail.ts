import { getNewsPost, type NewsPostDetail } from '../../utils/request'
import { articleReaderNodes, type ArticleNode } from '../../utils/article-reader'
import { validateIntent } from '../../utils/navigation'

import {newsPublicationLabel} from '../../utils/news-date'

Page({
  data: {
    loading: true,
    error: '',
    post: null as NewsPostDetail | null,
    dateLabel: '',
    readerNodes: [] as ArticleNode[],
    coverFailed: false,
  },

  postId: '',
  onLoad(options: Record<string, string | undefined>) {
    const id = validateIntent('pages/news-detail/news-detail', options)?.params.id || ''
    if (!id) {
      this.setData({ loading: false, error: '文章链接无法识别，请返回机会页重新选择' })
      return
    }
    this.postId = id
    void this.loadPost(id)
  },

  async loadPost(id: string) {
    try {
      this.setData({ loading: true, error: '' })
      const post = await getNewsPost(id)
      this.setData({
        post,
        readerNodes: articleReaderNodes(post.content.html || ''),
        coverFailed: false,
        dateLabel: newsPublicationLabel(post,true),
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
  onCoverError() { this.setData({ coverFailed: true }) },

  onRetry() {
    if (this.postId) void this.loadPost(this.postId)
  },
})
