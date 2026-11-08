import { getSavedAuthResult } from '../../utils/auth'
import {isReadOnly,getReadOnlyContext} from '../../utils/read-only-context'
import { INITIAL_SHELL, loginFor, observeShell, openSlot, shellView } from '../../utils/navigation'
import { createMyGrowthRecord, deleteMyGrowthRecord, friendlyRequestError, getMyAcademicProfile, getMyGrowthProfile, updateMyAcademicProfile, updateMyGrowthRecord,
  type CanonicalGrowthRecord, type GrowthRecordInput, type GrowthRecordType } from '../../utils/request'
import { saveCachedAcademicProfile } from '../../utils/profile-cache'
import { clearGrowthProfileBootstrapCache } from '../../utils/growth-profile-cache'
import { normalizeGrowthRecordInput } from '../../utils/growth-record-form'
import { EMPTY_POSITION_PROFILE, POSITION_PROFILE_FIELDS, positionProfileDirty, positionProfileError, positionProfileForm, positionProfilePatch, type PositionProfileForm } from '../../utils/position-profile-form'


Page({
  data: {
    ...INITIAL_SHELL,
    canEditProfile: false,
    profileLoading: false,
    profileError: '',
    profileForm: { ...EMPTY_POSITION_PROFILE },
    profileDraft: null as PositionProfileForm | null,
    profileNeedsResume: false,
    profileSaving: false,
    profileSaveError: '',
    gradeOptions: ['大一', '大二', '大三', '大四', '大五', '已毕业'],
    expandedDimension: '',
    growthRecords: [] as CanonicalGrowthRecord[],
    dimensionRecords: [] as CanonicalGrowthRecord[],
    growthLoaded: false, growthLoading: false, growthSchemaReady: false, growthError: '',
    growthDraft: null as GrowthRecordInput | null,
    growthEditingId: '', growthSaving: false, growthNeedsResume: false, growthSaveError: '',
    growthTypeOptions: [] as Array<{ key: GrowthRecordType; label: string }>,
    languageOptions: ['大学英语四级', '大学英语六级', '雅思', '托福', '其他语言考试'],
    dimensions: [
      { key: 'profile', title: '学业基础', desc: '绩点、排名与核心课程', status: '查看 / 补充 ›' },
      { key: 'english', title: '英语能力', desc: '四六级、雅思、托福等', status: '查看 / 补充 ›' },
      { key: 'research', title: '科研经历', desc: '项目、论文与导师经历', status: '查看 / 补充 ›' },
      { key: 'competition', title: '竞赛实践', desc: '竞赛、创新创业与作品', status: '查看 / 补充 ›' },
    ],
  },

  stopAuth: undefined as (() => void) | undefined,
  profileOwner: null as string | null,
  detachedProfileDrafts: [] as Array<{ owner: string; draft: PositionProfileForm }>,
  detachedGrowthDrafts: [] as Array<{ owner: string; dimension: string; id: string; draft: GrowthRecordInput }>,
  onShow() {
    this.stopAuth?.()
    this.stopAuth = observeShell((state) => {
      this.setData(shellView(state))
      if (state.phase === 'ready') this.initializePosition()
      else this.setData({ canEditProfile: false, profileLoading: false, profileError: '', profileForm: { ...EMPTY_POSITION_PROFILE } })
    })
  },
  onHide() {
    if (this.profileDraftDirty()) this.setData({ profileNeedsResume: true })
    if (this.data.growthDraft) this.setData({ growthNeedsResume: true })
    this.stopAuth?.()
  },
  profileDraftDirty() {
    return Boolean(this.data.profileDraft && positionProfileDirty(this.data.profileDraft, this.data.profileForm))
  },
  initializePosition() {
    const auth = getSavedAuthResult()
    const canEditProfile =
      Boolean(auth) &&
      ((getReadOnlyContext()?.role||auth?.user.role) === 'user' || (getReadOnlyContext()?.role||auth?.user.role) === 'student')

    const owner = canEditProfile ? `${auth!.user.id}:${auth!.businessIdentity?.businessId || ''}:${getReadOnlyContext()?.id || ''}` : null
    if (owner !== this.profileOwner) {
      const previousOwner = this.profileOwner
      if (previousOwner && this.data.profileDraft && this.profileDraftDirty()) {
        this.detachedProfileDrafts = this.detachedProfileDrafts.filter(item => item.owner !== previousOwner)
        this.detachedProfileDrafts.push({ owner: previousOwner, draft: this.data.profileDraft })
        wx.showModal({ title: '身份已切换', content: '上一身份的未保存资料已隔离，返回该身份后可继续编辑。', showCancel: false })
      }
      if (previousOwner && this.data.growthDraft) {
        this.detachedGrowthDrafts = this.detachedGrowthDrafts.filter(item => item.owner !== previousOwner)
        this.detachedGrowthDrafts.push({ owner: previousOwner, dimension: this.data.expandedDimension, id: this.data.growthEditingId, draft: this.data.growthDraft })
      }
      this.profileOwner = owner
      const detached = this.detachedProfileDrafts.find(item => item.owner === owner)
      const growthDetached = this.detachedGrowthDrafts.find(item => item.owner === owner)
      const growthDimension = growthDetached?.dimension || ''
      const growthTypeOptions = growthDimension === 'research' ? [{ key: 'research' as GrowthRecordType, label: '科研经历' }, { key: 'publication' as GrowthRecordType, label: '论文成果' }]
        : growthDimension ? [{ key: (growthDimension === 'english' ? 'language' : 'competition') as GrowthRecordType, label: growthDimension === 'english' ? '语言考试' : '竞赛经历' }] : []
      this.setData({ profileForm: { ...EMPTY_POSITION_PROFILE }, profileDraft: detached?.draft || null, profileNeedsResume: Boolean(detached), profileLoading: false, profileSaving: false, profileError: '', profileSaveError: '' })
      this.setData({ expandedDimension: growthDimension, growthTypeOptions, growthDraft: growthDetached?.draft || null, growthEditingId: growthDetached?.id || '', growthNeedsResume: Boolean(growthDetached),
        growthRecords: [], dimensionRecords: [], growthLoaded: false, growthLoading: false, growthSaving: false, growthError: '', growthSaveError: '' })
    }
    this.setData({ canEditProfile })
    if (canEditProfile) void this.loadAcademicProfile()
    if (canEditProfile && this.data.expandedDimension) void this.loadGrowthRecords()
  },

  async loadAcademicProfile() {
    const owner = this.profileOwner
    if (!owner || this.data.profileLoading) return
    this.setData({ profileLoading: true, profileError: '' })
    try {
      const profile = await getMyAcademicProfile()
      if (!this.data.canEditProfile ||
        owner !== this.profileOwner) return
      this.setData({ profileForm: positionProfileForm(profile) })
    } catch (error) {
      if (owner === this.profileOwner) this.setData({ profileError: friendlyRequestError(error, '学业资料暂时无法读取，请重试') })
    } finally {
      if (owner === this.profileOwner) this.setData({ profileLoading: false })
    }
  },

  onRetryProfile() { void this.loadAcademicProfile() },

  async loadGrowthRecords() {
    const owner = this.profileOwner, dimension = this.data.expandedDimension
    if (!owner || !dimension || this.data.growthLoading || isReadOnly()) return
    this.setData({ growthLoading: true, growthError: '' })
    try {
      const result = await getMyGrowthProfile()
      if (owner !== this.profileOwner) return
      this.setData({ growthRecords: result.profile.records, dimensionRecords: dimensionRecords(result.profile.records, this.data.expandedDimension),
        growthSchemaReady: result.growthSchemaReady, growthLoaded: true })
    } catch (error) {
      if (owner === this.profileOwner) this.setData({ growthError: friendlyRequestError(error, '成长记录暂时无法读取，请重试') })
    } finally { if (owner === this.profileOwner) this.setData({ growthLoading: false }) }
  },
  onRetryGrowth() { void this.loadGrowthRecords() },
  onNewGrowthRecord() {
    if (isReadOnly() || !this.data.growthSchemaReady) return
    const dimension = this.data.expandedDimension
    const type = dimension === 'english' ? 'language' : dimension === 'research' ? 'research' : 'competition'
    this.setData({ growthDraft: { ...EMPTY_GROWTH_DRAFT, type }, growthEditingId: '', growthNeedsResume: false, growthSaveError: '' })
  },
  onEditGrowthRecord(event: WechatMiniprogram.BaseEvent) {
    if (isReadOnly() || !this.data.growthSchemaReady) return
    const record = this.data.dimensionRecords.find(item => item.id === event.currentTarget.dataset.id)
    if (!record || record.source.type !== 'manual') return
    this.setData({ growthDraft: { type: record.type, title: record.title, organization: record.organization || '', role: record.role || '',
      startDate: record.startDate || '', endDate: record.endDate || '', description: record.description || '', result: record.result || '' },
      growthEditingId: record.id, growthNeedsResume: false, growthSaveError: '' })
  },
  onGrowthInput(event: WechatMiniprogram.Input) {
    const field = String(event.currentTarget.dataset.field) as typeof GROWTH_FIELDS[number]
    if (!this.data.growthDraft || !GROWTH_FIELDS.includes(field)) return
    this.setData({ [`growthDraft.${field}`]: event.detail.value, growthSaveError: '' })
  },
  onGrowthTypeChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const choice = this.data.growthTypeOptions[Number(event.detail.value)]
    if (choice && this.data.growthDraft) this.setData({ 'growthDraft.type': choice.key })
  },
  onLanguageTypeChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const title = this.data.languageOptions[Number(event.detail.value)]
    if (title && this.data.growthDraft) this.setData({ 'growthDraft.title': title, growthSaveError: '' })
  },
  onContinueGrowth() { if (this.data.growthDraft) this.setData({ growthNeedsResume: false }) },
  onCancelGrowth() {
    if (!this.data.growthDraft || this.data.growthSaving) return
    const owner = this.profileOwner, draft = this.data.growthDraft
    wx.showModal({ title: '放弃未保存经历？', content: '当前编辑内容尚未保存。', confirmText: '放弃修改', cancelText: '继续编辑', success: result => {
      if (result.confirm && owner === this.profileOwner && draft === this.data.growthDraft) this.setData({ growthDraft: null, growthEditingId: '', growthNeedsResume: false, growthSaveError: '' })
    } })
  },
  async onSaveGrowth() {
    const draft = this.data.growthDraft, owner = this.profileOwner, id = this.data.growthEditingId
    if (!draft || !owner || isReadOnly() || !this.data.growthSchemaReady || this.data.growthSaving) return
    const input = normalizeGrowthRecordInput(draft)
    if (!input.title || input.title.length > 220) { this.setData({ growthSaveError: '请填写 220 字以内的经历名称。' }); return }
    this.setData({ growthSaving: true, growthSaveError: '' })
    try {
      if (id) await updateMyGrowthRecord(id, input)
      else await createMyGrowthRecord(input)
      if (owner !== this.profileOwner) return
      await clearGrowthProfileBootstrapCache()
      this.detachedGrowthDrafts = this.detachedGrowthDrafts.filter(item => item.owner !== owner)
      this.setData({ growthDraft: null, growthEditingId: '', growthNeedsResume: false })
      await this.loadGrowthRecords()
    } catch (error) {
      if (owner === this.profileOwner) this.setData({ growthSaveError: friendlyRequestError(error, '保存失败，草稿已保留，请重试') })
    } finally { if (owner === this.profileOwner) this.setData({ growthSaving: false }) }
  },
  onDeleteGrowthRecord(event: WechatMiniprogram.BaseEvent) {
    if (isReadOnly() || this.data.growthSaving) return
    const id = String(event.currentTarget.dataset.id || ''), owner = this.profileOwner
    const record = this.data.dimensionRecords.find(item => item.id === id)
    if (!record || record.source.type !== 'manual') return
    wx.showModal({ title: '删除这条经历？', content: '删除后将从成长档案中归档。', confirmText: '删除', success: result => {
      if (!result.confirm || owner !== this.profileOwner) return
      void deleteMyGrowthRecord(id).then(async () => { await clearGrowthProfileBootstrapCache(); await this.loadGrowthRecords() })
        .catch(error => { if (owner === this.profileOwner) this.setData({ growthError: friendlyRequestError(error, '删除失败，请重试') }) })
    } })
  },

  onProfileInput(event: WechatMiniprogram.Input) {
    const field = String(event.currentTarget.dataset.field) as keyof PositionProfileForm
    if (!this.data.profileDraft || !POSITION_PROFILE_FIELDS.includes(field)) return
    this.setData({ [`profileDraft.${field}`]: event.detail.value, profileSaveError: '' })
  },
  onProfileGradeChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const grade = this.data.gradeOptions[Number(event.detail.value)]
    if (grade && this.data.profileDraft) this.setData({ 'profileDraft.currentGrade': grade, profileSaveError: '' })
  },
  onContinueProfile() { if (this.data.profileDraft) this.setData({ profileNeedsResume: false }) },
  onCancelProfile() {
    if (!this.data.profileDraft) return
    const close = () => this.setData({ profileDraft: null, profileNeedsResume: false, profileSaveError: '' })
    if (!this.profileDraftDirty()) { close(); return }
    wx.showModal({ title: '放弃未保存修改？', content: '当前资料修改尚未保存。', confirmText: '放弃修改', cancelText: '继续编辑', success: result => { if (result.confirm) close() } })
  },
  async onSaveProfile() {
    const draft = this.data.profileDraft, owner = this.profileOwner
    if (!draft || !owner || this.data.profileSaving || !this.data.canEditProfile || isReadOnly()) return
    const validationError = positionProfileError(draft)
    if (validationError) { this.setData({ profileSaveError: validationError }); return }
    this.setData({ profileSaving: true, profileSaveError: '' })
    try {
      const saved = await updateMyAcademicProfile(positionProfilePatch(draft))
      if (owner !== this.profileOwner || isReadOnly()) return
      this.detachedProfileDrafts = this.detachedProfileDrafts.filter(item => item.owner !== owner)
      this.setData({ profileForm: positionProfileForm(saved), profileDraft: null, profileNeedsResume: false })
      await Promise.all([saveCachedAcademicProfile(saved), clearGrowthProfileBootstrapCache()])
      wx.showToast({ title: '资料已保存', icon: 'success' })
    } catch (error) {
      if (owner === this.profileOwner) this.setData({ profileSaveError: friendlyRequestError(error, '保存失败，草稿已保留，请重试') })
    } finally {
      if (owner === this.profileOwner) this.setData({ profileSaving: false })
    }
  },

  onUnload() { this.stopAuth?.() },

  onStartAssessment() {
    if(isReadOnly())return
    const auth = getSavedAuthResult()

    if (!auth) {
      loginFor('pages/assessment-form/assessment-form', {}, true)
      return
    }

    if (auth.user.role !== 'user' && auth.user.role !== 'student') {
      wx.showToast({ title: '当前身份不使用 AI 定位', icon: 'none' })
      return
    }

    wx.navigateTo({ url: '/pages/assessment-form/assessment-form' })
  },

  onAssessmentHistory() {
    const auth = getSavedAuthResult()
    if (!auth) {
      loginFor('pages/assessment-history/assessment-history', {}, true)
      return
    }
    wx.navigateTo({ url: '/pages/assessment-history/assessment-history' })
  },

  onProfileCardTap() {
    if(isReadOnly())return
    if (this.data.growthDraft) { wx.showToast({ title: '请先保存或放弃当前经历草稿', icon: 'none' }); return }
    if (this.data.canEditProfile) this.setData({ profileDraft: this.data.profileDraft || { ...this.data.profileForm }, profileNeedsResume: false, profileSaveError: '' })
    else if (getSavedAuthResult()) openSlot('mine')
    else loginFor('pages/position/position', {}, true)
  },

  onDimensionTap(event: WechatMiniprogram.BaseEvent) {
    if(isReadOnly())return
    const auth = getSavedAuthResult()
    if (!auth) {
      loginFor('pages/position/position', {}, true)
      return
    }

    if (auth.user.role !== 'user' && auth.user.role !== 'student') {
      wx.showToast({ title: '当前身份不编辑定位资料', icon: 'none' })
      return
    }

    const key = String(event.currentTarget.dataset.key || '')
    if (key !== 'profile' && this.data.profileDraft) { wx.showToast({ title: '请先保存或放弃当前资料草稿', icon: 'none' }); return }
    if (this.data.growthDraft) { this.setData({ growthNeedsResume: true }); wx.showToast({ title: '请先保存或放弃当前经历草稿', icon: 'none' }); return }
    if (key === 'profile') {
      this.setData({ expandedDimension: '' })
      this.onProfileCardTap()
      return
    }

    if (!['english', 'research', 'competition'].includes(key)) return
    const expandedDimension = this.data.expandedDimension === key ? '' : key
    const growthTypeOptions = expandedDimension === 'research' ? [{ key: 'research' as GrowthRecordType, label: '科研经历' }, { key: 'publication' as GrowthRecordType, label: '论文成果' }]
      : [{ key: (expandedDimension === 'english' ? 'language' : 'competition') as GrowthRecordType, label: expandedDimension === 'english' ? '语言考试' : '竞赛经历' }]
    this.setData({ expandedDimension, growthTypeOptions, dimensionRecords: dimensionRecords(this.data.growthRecords, expandedDimension) })
    if (expandedDimension && !this.data.growthLoaded) void this.loadGrowthRecords()
  },
})
const EMPTY_GROWTH_DRAFT: GrowthRecordInput = { type: 'language', title: '', organization: '', role: '', startDate: '', endDate: '', description: '', result: '' }
const GROWTH_FIELDS = ['title', 'organization', 'role', 'startDate', 'endDate', 'description', 'result'] as const
function dimensionRecords(records: CanonicalGrowthRecord[], dimension: string) {
  const types: GrowthRecordType[] = dimension === 'english' ? ['language'] : dimension === 'research' ? ['research', 'publication'] : ['competition']
  return records.filter(item => types.includes(item.type))
}
