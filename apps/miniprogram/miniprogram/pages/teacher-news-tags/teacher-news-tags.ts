import { getSavedAuthResult } from '../../utils/auth'
import { getReadOnlyContext } from '../../utils/read-only-context'
import { getTeacherTaggedNews, saveTeacherNewsTags, teacherNewsError, type TeacherTaggedPost } from '../../utils/teacher-news-tags'

Page({
  data: {
    loading: false, busy: false, error: '', notice: '',
    posts: [] as Array<TeacherTaggedPost & { globalNote: string; teacherNote: string }>,
    selectedId: '', selectedTitle: '', draftTags: '', allowed: false,
  },
  generation: 0,
  onShow() {
    this.generation++
    const allowed = getSavedAuthResult()?.user.role === 'teacher' && !getReadOnlyContext()
    this.setData({ allowed, posts: [], selectedId: '', selectedTitle: '', draftTags: '', notice: '',
      error: allowed ? '' : '请使用教师本人身份管理自己的资讯标签。' })
    if (allowed) void this.loadPosts()
  },
  onHide() { this.generation++; this.setData({ posts: [], selectedId: '', draftTags: '', busy: false }) },
  onUnload() { this.generation++ },
  async loadPosts() {
    if (!this.data.allowed || getReadOnlyContext()) return
    const owner = getSavedAuthResult()?.user.id, generation = ++this.generation
    const current = () => generation === this.generation && getSavedAuthResult()?.user.id === owner && getSavedAuthResult()?.user.role === 'teacher' && !getReadOnlyContext()
    this.setData({ loading: true, error: '' })
    try {
      const posts = await getTeacherTaggedNews()
      if (current()) this.setData({ posts: posts.map(post => ({ ...post,
        globalNote: post.globalTags.length ? post.globalTags.join('、') : '未分类',
        teacherNote: post.teacherTags.length ? post.teacherTags.join('、') : '尚未设置' })) })
    } catch (error) { if (current()) this.setData({ error: teacherNewsError(error) }) }
    finally { if (current()) this.setData({ loading: false }) }
  },
  onSelect(event: WechatMiniprogram.BaseEvent) {
    if (this.data.busy) return
    const post = this.data.posts.find(item => item.id === event.currentTarget.dataset.id)
    if (post) {
      this.setData({ selectedId: post.id, selectedTitle: post.title, draftTags: post.teacherTags.join('、'), notice: '', error: '' })
      wx.pageScrollTo({ scrollTop: 0, duration: 150 })
    }
  },
  onTagsInput(event: WechatMiniprogram.Input) { this.setData({ draftTags: event.detail.value }) },
  onCancel() { if (!this.data.busy) this.setData({ selectedId: '', selectedTitle: '', draftTags: '' }) },
  async onSave() {
    if (!this.data.allowed || this.data.busy || !this.data.selectedId || getReadOnlyContext()) return
    const tags = [...new Set(this.data.draftTags.split(/[,，、\n]/).map(value => value.trim()).filter(Boolean))]
    if (tags.length > 8 || tags.some(tag => tag.length > 40)) {
      this.setData({ error: '最多8个标签，每个标签不超过40字。' }); return
    }
    const owner = getSavedAuthResult()?.user.id, generation = this.generation, id = this.data.selectedId
    const current = () => generation === this.generation && getSavedAuthResult()?.user.id === owner && getSavedAuthResult()?.user.role === 'teacher' && !getReadOnlyContext()
    this.setData({ busy: true, error: '', notice: '' })
    try {
      await saveTeacherNewsTags(id, tags)
      if (current()) {
        this.setData({ selectedId: '', selectedTitle: '', draftTags: '', notice: tags.length ? '已保存本人标签。' : '已移除本人标签，平台和其他老师的标签不变。' })
        await this.loadPosts()
      }
    } catch (error) { if (current()) this.setData({ error: teacherNewsError(error) }) }
    finally { if (getSavedAuthResult()?.user.id === owner) this.setData({ busy: false }) }
  },
})
