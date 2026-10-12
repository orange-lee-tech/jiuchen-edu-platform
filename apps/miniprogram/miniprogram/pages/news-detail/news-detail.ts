import { getNewsPost, getMyNewsFavorites, saveNewsFavorite, removeNewsFavorite, type NewsPostDetail } from '../../utils/request'
import {openOfficialArticle} from '../../utils/official-article'
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
    favorited:false,
    favoriteBusy:false,
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
      if(post.favoritesEnabled){
        try{const saved=await getMyNewsFavorites();if(this.postId===id)this.setData({favorited:saved.some(item=>item.postId===id)})}catch{ /* An unavailable favorite source must not hide the article. */ }
      }
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

    openOfficialArticle(url)
  },
  async onToggleFavorite(){
    const post=this.data.post
    if(!post?.favoritesEnabled||this.data.favoriteBusy)return
    try{
      this.setData({favoriteBusy:true})
      if(this.data.favorited)await removeNewsFavorite(post.id)
      else await saveNewsFavorite(post.id)
      this.setData({favorited:!this.data.favorited})
    }catch{wx.showToast({title:'收藏未保存，请重试',icon:'none'})}
    finally{this.setData({favoriteBusy:false})}
  },
  onCoverError() { this.setData({ coverFailed: true }) },

  onRetry() {
    if (this.postId) void this.loadPost(this.postId)
  },
})
