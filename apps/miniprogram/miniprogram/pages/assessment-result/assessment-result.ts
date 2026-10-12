import { getSavedAuthResult, refreshAuthResult } from '../../utils/auth'
import { authorizePage } from '../../utils/navigation'
import {
  getMyAssessment,
  type AssessmentEvidence,
  type AssessmentOutput,
  type AssessmentRecord,
} from '../../utils/request'
import { copyConsultationAndOpen } from '../../utils/customer-service'
import {
  buildAssessmentReportBaseFilename,
  buildAssessmentReportDocx,
  buildAssessmentReportMarkdown,
  buildAssessmentReportPlainText,
  formatAssessmentDate,
  writeAssessmentReportFile,
  type AssessmentReportExportContext,
  type AssessmentReportReference,
} from '../../utils/assessment-report-export'

import { buildAssessmentConsultation } from '../../utils/consultation-payload'
import { layoutAssessmentImage, drawReportStrip, REPORT_TILE_HEIGHT } from '../../utils/assessment-image'
import { ReportPngEncoder } from '../../utils/report-png'

const TIER_VIEW = {
  reach: { label: '冲刺', tone: 'reach' },
  match: { label: '匹配', tone: 'match' },
  conservative: { label: '稳妥', tone: 'conservative' },
  insufficient_data: { label: '信息不足', tone: 'insufficient' },
} as const

type CitationView = {
  index: number
  ref: string
}

type ResultView = AssessmentOutput & {
  strengths: Array<AssessmentOutput['strengths'][number] & {
    citations: CitationView[]
  }>
  risks: Array<AssessmentOutput['risks'][number] & {
    citations: CitationView[]
  }>
  targetAssessments: Array<AssessmentOutput['targetAssessments'][number] & {
    tierLabel: string
    tierTone: string
    citations: CitationView[]
  }>
  recommendedActions: Array<AssessmentOutput['recommendedActions'][number] & {
    priorityLabel: string
  }>
}

function buildReferences(
  output: AssessmentOutput,
  evidence: AssessmentEvidence[],
): AssessmentReportReference[] {
  const evidenceByRef = new Map(evidence.map((item) => [item.ref, item]))
  const similarByRef = new Map(
    output.similarCases.map((item) => [item.evidenceRef, item]),
  )
  const orderedRefs: string[] = []
  const seen = new Set<string>()

  const addRefs = (refs: string[]) => {
    refs.forEach((ref) => {
      const item = evidenceByRef.get(ref)
      if (!item || item.kind !== 'case' || seen.has(ref)) return
      seen.add(ref)
      orderedRefs.push(ref)
    })
  }

  output.strengths.forEach((item) => addRefs(item.evidenceRefs))
  output.risks.forEach((item) => addRefs(item.evidenceRefs))
  output.targetAssessments.forEach((item) => addRefs(item.evidenceRefs))
  output.similarCases.forEach((item) => addRefs([item.evidenceRef]))

  return orderedRefs.map((ref, index) => {
    const item = evidenceByRef.get(ref)!
    const similar = similarByRef.get(ref)

    return {
      index: index + 1,
      ref,
      caseId: similar?.caseId || item.sourceId || '',
      title: item.title,
      metaLabel: [item.sourceLabel, item.year ? String(item.year) : '']
        .filter(Boolean)
        .join(' · '),
      excerpt: item.excerpt || '',
      similarityReason: similar?.similarityReason || '',
      resultSummary: similar?.resultSummary || '',
      sourceType: item.sourceType,
    }
  })
}

function citationViews(
  refs: string[],
  references: AssessmentReportReference[],
): CitationView[] {
  const indexByRef = new Map(references.map((item) => [item.ref, item.index]))
  return refs
    .map((ref) => {
      const index = indexByRef.get(ref)
      return typeof index === 'number' ? { index, ref } : null
    })
    .filter((item): item is CitationView => Boolean(item))
}

function buildResultView(
  output: AssessmentOutput,
  references: AssessmentReportReference[],
): ResultView {
  return {
    ...output,
    strengths: output.strengths.map((item) => ({
      ...item,
      citations: citationViews(item.evidenceRefs, references),
    })),
    risks: output.risks.map((item) => ({
      ...item,
      citations: citationViews(item.evidenceRefs, references),
    })),
    targetAssessments: output.targetAssessments.map((target) => ({
      ...target,
      tierLabel: TIER_VIEW[target.tier].label,
      tierTone: TIER_VIEW[target.tier].tone,
      citations: citationViews(target.evidenceRefs, references),
    })),
    recommendedActions: output.recommendedActions.map((action) => ({
      ...action,
      priorityLabel:
        action.priority === 'high'
          ? '优先'
          : action.priority === 'medium'
            ? '重要'
            : '建议',
    })),
  }
}

type ShareFileApi = {
  shareFileMessage?: (options: {
    filePath: string
    fileName?: string
    success?: () => void
    fail?: (error: { errMsg?: string }) => void
  }) => void
}

Page({
  data: {
    loading: true,
    exporting: false,
    consulting: false,
    ownerUserId: '',
    error: '',
    displayName: '用户',
    assessmentDate: '',
    assessment: null as AssessmentRecord | null,
    output: null as ResultView | null,
    references: [] as AssessmentReportReference[],
    selectedReference: null as AssessmentReportReference | null,
    exportCanvasHeight: REPORT_TILE_HEIGHT,
  },

  onLoad(query: Record<string, string | undefined>) {
    authorizePage('pages/assessment-result/assessment-result', query, () => this.initializeResult(query))
  },
  initializeResult(query: Record<string, string | undefined>) {
    const auth = getSavedAuthResult()
    if (!auth) {
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }

    this.setData({
      displayName: auth.user.displayName || '用户',
    })

    const id = query.id ? decodeURIComponent(query.id) : ''
    if (!id) {
      this.setData({ loading: false, error: '缺少评估记录 ID' })
      return
    }
    void this.loadResult(id)
  },

  async loadResult(id: string) {
    try {
      const owner=getSavedAuthResult()?.user.id
      const assessment = await getMyAssessment(id)
      if(!owner || getSavedAuthResult()?.user.id!==owner) throw new Error('账号已变化')
      if (assessment.status !== 'succeeded' || !assessment.output) {
        this.setData({ error: '该评估尚未生成可查看的报告' })
        return
      }

      const references = buildReferences(
        assessment.output,
        assessment.evidence ?? [],
      )
      const output = buildResultView(assessment.output, references)

      this.setData({
        assessment,
        ownerUserId: owner,
        output,
        references,
        assessmentDate: formatAssessmentDate(
          assessment.completedAt || assessment.updatedAt,
        ),
      })
    } catch (error) {
      console.info('Assessment result load failed.', error)
      this.setData({ error: '评估报告加载失败，请稍后重试' })
    } finally {
      this.setData({ loading: false })
    }
  },

  reportExportContext(): AssessmentReportExportContext | null {
    if (!this.data.assessment?.output || getSavedAuthResult()?.user.id!==this.data.ownerUserId) return null
    return {
      assessment: this.data.assessment,
      displayName: this.data.displayName,
      references: this.data.references,
    }
  },

  onReferenceTap(event: WechatMiniprogram.BaseEvent) {
    const index = Number(event.currentTarget.dataset.index)
    const reference = this.data.references.find((item) => item.index === index)
    if (!reference) return
    this.setData({ selectedReference: reference })
  },

  onCloseReference() {
    this.setData({ selectedReference: null })
  },

  onStopTap() {
    // Keep the reference sheet open when the sheet itself is tapped.
  },

  async onCustomerServiceTap() {
    if(this.data.consulting)return
    const context=this.reportExportContext()
    if(!context)return
    this.setData({consulting:true})
    try {
      const auth=await refreshAuthResult()
      const current=()=>getSavedAuthResult()?.user.id===auth?.user.id && getSavedAuthResult()?.session.token===auth?.session.token && this.data.assessment?.id===context.assessment.id && Boolean(this.reportExportContext())
      if(!auth||!current())throw new Error('账号或报告已变化')
      await copyConsultationAndOpen(buildAssessmentConsultation(context,
        auth.businessIdentity?.status==='claimed'?auth.businessIdentity.businessId:'尚未绑定'),
        {title:'九辰 AI 评估咨询',path:'/pages/assessment-result/assessment-result?id='+encodeURIComponent(context.assessment.id)},current)
    } catch {wx.showToast({title:'咨询信息准备失败，请重试',icon:'none'})}
    finally {this.setData({consulting:false})}
  },

  onCopyReport() {
    const context = this.reportExportContext()
    if (!context) return

    wx.setClipboardData({
      data: buildAssessmentReportPlainText(context),
      success() {
        wx.showToast({ title: '已复制标准格式报告', icon: 'success' })
      },
      fail() {
        wx.showToast({ title: '复制失败，请稍后重试', icon: 'none' })
      },
    })
  },

  onDownloadReport() {
    if (this.data.exporting) return

    wx.showActionSheet({
      itemList: [
        'Markdown（.md）',
        '纯文本（.txt）',
        '导出图片（摘要图）',
        '导出长图（完整报告）',
        'Word（.docx）',
      ],
      success: (result) => {
        if (result.tapIndex === 0) void this.exportTextFile('md')
        if (result.tapIndex === 1) void this.exportTextFile('txt')
        if (result.tapIndex === 2) void this.exportImageReport('summary')
        if (result.tapIndex === 3) void this.exportImageReport('long')
        if (result.tapIndex === 4) void this.exportWordFile()
      },
    })
  },

  async exportTextFile(kind: 'md' | 'txt') {
    if(this.data.exporting)return
    const context = this.reportExportContext()
    if (!context) return

    try {
      this.setData({ exporting: true })
      wx.showLoading({ title: '正在生成文件' })
      const baseName = buildAssessmentReportBaseFilename(context)
      const fileName = `${baseName}.${kind}`
      const content =
        kind === 'md'
          ? buildAssessmentReportMarkdown(context)
          : buildAssessmentReportPlainText(context)
      const filePath = await writeAssessmentReportFile(fileName, content)
      wx.hideLoading()
      this.presentGeneratedFile(filePath, fileName, false)
    } catch (error) {
      wx.hideLoading()
      console.error('Assessment text export failed.', error)
      wx.showToast({ title: '文件生成失败，请稍后重试', icon: 'none' })
    } finally {
      this.setData({ exporting: false })
    }
  },

  async exportWordFile() {
    if(this.data.exporting)return
    const context = this.reportExportContext()
    if (!context) return

    try {
      this.setData({ exporting: true })
      wx.showLoading({ title: '正在生成 Word' })
      const baseName = buildAssessmentReportBaseFilename(context)
      const fileName = `${baseName}.docx`
      const data = buildAssessmentReportDocx(context)
      const filePath = await writeAssessmentReportFile(fileName, data)
      wx.hideLoading()
      this.presentGeneratedFile(filePath, fileName, true)
    } catch (error) {
      wx.hideLoading()
      console.error('Assessment Word export failed.', error)
      wx.showToast({ title: 'Word 生成失败，请稍后重试', icon: 'none' })
    } finally {
      this.setData({ exporting: false })
    }
  },

  presentGeneratedFile(
    filePath: string,
    fileName: string,
    canOpenDocument: boolean,
  ) {
    const shareApi = wx as unknown as ShareFileApi
    const itemList = canOpenDocument
      ? ['打开文件', '发送 / 保存文件']
      : ['发送 / 保存文件']

    wx.showActionSheet({
      itemList,
      success: (result) => {
        if (canOpenDocument && result.tapIndex === 0) {
          wx.openDocument({
            filePath,
            fileType: 'docx',
            showMenu: true,
            fail(error) {
              console.info('Failed to open exported Word document.', error)
              wx.showToast({ title: '文件已生成，可选择发送保存', icon: 'none' })
            },
          })
          return
        }

        if (!shareApi.shareFileMessage) {
          wx.showToast({ title: '文件已生成，当前微信版本不支持文件发送', icon: 'none' })
          return
        }

        shareApi.shareFileMessage({
          filePath,
          fileName,
          fail(error) {
            console.info('Failed to share exported report file.', error)
            wx.showToast({ title: '文件已生成，但发送失败', icon: 'none' })
          },
        })
      },
    })
  },

  async exportImageReport(kind: 'summary'|'long') {
    if(this.data.exporting)return
    const context=this.reportExportContext()
    if(!context)return
    this.setData({exporting:true})
    let filePath=''
    try {
      wx.showLoading({title:'正在生成图片'})
      const auth=await refreshAuthResult()
      if(!auth || !this.reportExportContext() || auth.user.id!==this.data.ownerUserId) throw new Error('账号已变化，请重试')
      const userId=auth.businessIdentity?.status==='claimed' ? auth.businessIdentity.businessId : ''
      if(!userId)throw new Error('缺少可展示的用户编号，请先绑定学员身份')
      const isCurrent=()=>getSavedAuthResult()?.user.id===auth.user.id && getSavedAuthResult()?.session.token===auth.session.token && this.data.assessment?.id===context.assessment.id
      const measureContext=wx.createCanvasContext('reportExportCanvas',this)
      const layout=layoutAssessmentImage(context,userId,kind,(text,size)=>{
        measureContext.setFontSize(size);return measureContext.measureText(text).width
      })
      const encoder=new ReportPngEncoder(layout.width,layout.height)
      const manager=wx.getFileSystemManager()
      filePath=wx.env.USER_DATA_PATH+'/jiuchen-report-'+Date.now()+'.png'
      const write=(bytes:Uint8Array,append=false)=>new Promise<void>((resolve,reject)=>{
        const options={filePath,data:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer,
          success:()=>resolve(),fail:(error:{errMsg?:string})=>reject(new Error(error.errMsg||'图片写入失败'))}
        if(append)manager.appendFile(options);else manager.writeFile(options)
      })
      await write(encoder.header())
      for(let offset=0;offset<layout.height;offset+=REPORT_TILE_HEIGHT){
        if(!isCurrent())throw new Error('账号或报告已变化，请重试')
        const height=Math.min(REPORT_TILE_HEIGHT,layout.height-offset)
        const pixels=await this.renderImageStrip(layout,userId,offset,height)
        await write(encoder.strip(pixels,height),true)
      }
      await write(encoder.finish(),true)
      if(!isCurrent())throw new Error('账号或报告已变化，请重试')
      wx.hideLoading()
      await new Promise<void>((resolve,reject)=>wx.saveImageToPhotosAlbum({filePath,
        success:()=>resolve(),fail:()=>reject(new Error('图片已生成，但相册保存失败，请检查相册权限后重试'))}))
      wx.showToast({title:kind==='long'?'完整长图已保存':'摘要图已保存',icon:'success'})
    } catch(error) {
      wx.hideLoading()
      wx.showModal({title:'图片导出未完成',content:error instanceof Error?error.message:'请重试',showCancel:false})
    } finally {
      if(filePath)wx.getFileSystemManager().unlink({filePath,fail:()=>{}})
      this.setData({exporting:false})
    }
  },

  renderImageStrip(layout: ReturnType<typeof layoutAssessmentImage>,userId:string,offset:number,height:number) {
    return new Promise<Uint8ClampedArray>((resolve,reject)=>{
      this.setData({exportCanvasHeight:height},()=>{
        const ctx=wx.createCanvasContext('reportExportCanvas',this)
        drawReportStrip(ctx,layout,userId,offset,height)
        ctx.draw(false,()=>wx.canvasGetImageData({canvasId:'reportExportCanvas',x:0,y:0,width:layout.width,height,
          success:result=>resolve(result.data),fail:error=>reject(new Error(error.errMsg||'画布读取失败'))},this))
      })
    })
  },

  onViewHistory() {
    const pages = getCurrentPages()
    const previous = pages[pages.length - 2]

    if (previous?.route === 'pages/assessment-history/assessment-history') {
      wx.navigateBack()
      return
    }

    wx.redirectTo({ url: '/pages/assessment-history/assessment-history' })
  },
})
