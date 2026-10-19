import { ApiRequestError, getNewsPost, getMyNewsFavorites, saveNewsFavorite, removeNewsFavorite, type NewsPostDetail } from '../../utils/request'
import {openOfficialArticle} from '../../utils/official-article'
import { articleReaderNodes, type ArticleNode } from '../../utils/article-reader'
import { validateIntent } from '../../utils/navigation'

import {newsPublicationLabel} from '../../utils/news-date'
import {getSavedAuthResult} from '../../utils/auth'

Page({
  data: {
    loading: true,
    error: '',
    post: null as NewsPostDetail | null,
    dateLabel: '',
    readerNodes: [] as ArticleNode[],
    contentBlocks: [] as NonNullable<NewsPostDetail['content']['blocks']>,
    bodyImageFailed:false,
    coverFailed: false,
    favorited:false,
    favoriteBusy:false,
    favoritesReady:false,
    favoriteError:'',
  },

  postId: '',
  generation:0,
  onUnload(){this.generation++},
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
    const generation=++this.generation
    const owner=getSavedAuthResult()?.user.id
    const current=()=>generation===this.generation&&getSavedAuthResult()?.user.id===owner
    try {
      this.setData({ loading: true, error: '', favoritesReady:false, favoriteError:'',favorited:false })
      const post = await getNewsPost(id)
      if(!current())return
      this.setData({
        post,
        readerNodes: articleReaderNodes(post.content.html || ''),
        contentBlocks: post.content.blocks || [],
        bodyImageFailed:false,
        coverFailed: false,
        dateLabel: newsPublicationLabel(post,true),
      })
      if(post.favoritesEnabled){
        try{const saved=await getMyNewsFavorites();if(current())this.setData({favorited:saved.some(item=>item.postId===id),favoritesReady:true})}
        catch{if(current())this.setData({favoriteError:'收藏状态暂时无法读取，请重新加载后再试。'})}
      }
    } catch (error) {
      if(!current())return
      console.info('News detail load failed.', error)
      this.setData({ error: '资讯正文暂时无法加载，请稍后重试' })
    } finally {
      if(current())this.setData({ loading: false })
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
    if(!post?.favoritesEnabled||!this.data.favoritesReady||this.data.favoriteBusy)return
    const owner=getSavedAuthResult()?.user.id,wasFavorited=this.data.favorited
    const generation=this.generation
    try{
      this.setData({favoriteBusy:true,favoriteError:''})
      if(wasFavorited)await removeNewsFavorite(post.id)
      else await saveNewsFavorite(post.id)
      if(generation===this.generation&&getSavedAuthResult()?.user.id===owner)this.setData({favorited:!wasFavorited})
    }catch(error){
      const code=error instanceof ApiRequestError?`${error.statusCode}/${error.code}`:'client_error'
      if(generation===this.generation&&getSavedAuthResult()?.user.id===owner)
        this.setData({favoriteError:`${wasFavorited?'取消收藏':'收藏'}失败（${code}）。请保留此提示反馈给管理员。`})
    }
    finally{this.setData({favoriteBusy:false})}
  },
  onUnavailableFavorite(){wx.showModal({title:'收藏服务尚不可用',content:'当前服务器尚未启用个人收藏。可以先查看公众号原文；收藏记录需服务器升级后才能保存。',showCancel:false})},
  onCoverError() { this.setData({ coverFailed: true }) },
  onBodyImageError(){this.setData({bodyImageFailed:true})},
  onPreviewImage(event:WechatMiniprogram.BaseEvent){
    const current=String(event.currentTarget.dataset.url||'')
    const urls=this.data.contentBlocks.filter((block):block is {type:'image';url:string}=>block.type==='image').map(block=>block.url)
    if(current&&urls.includes(current))wx.previewImage({current,urls})
  },

  onRetry() {
    if (this.postId) void this.loadPost(this.postId)
  },
})
