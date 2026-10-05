import { getSavedAuthResult } from '../../utils/auth'
import {
  getMyAssessment,
  getProducts,
  type AssessmentEvidence,
  type AssessmentOutput,
  type AssessmentRecord,
  type ProductSummary,
} from '../../utils/request'
import { openWechatCustomerService } from '../../utils/customer-service'
import {
  buildAssessmentReportBaseFilename,
  buildAssessmentReportDocx,
  buildAssessmentReportMarkdown,
  buildAssessmentReportPlainText,
  formatAssessmentDate,
  writeAssessmentReportFile,
  type AssessmentReportExportContext,
  type AssessmentReportReference,
  type AssessmentServiceRecommendation,
} from '../../utils/assessment-report-export'

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

type RecommendationCandidate = {
  product: ProductSummary
  score: number
  needs: string[]
}

type RecommendationView = AssessmentServiceRecommendation & {
  matchedNeedsLabel: string
}

const NEED_RULES = [
  {
    label: '科研与论文产出',
    reportKeywords: ['科研', '论文', '发表', '专利', '实验室', '研究经历'],
    productKeywords: ['科研', '论文', '发表', '研究'],
    weight: 5,
  },
  {
    label: '竞赛与创新项目',
    reportKeywords: ['竞赛', '比赛', '挑战杯', '互联网+', '创新创业'],
    productKeywords: ['竞赛', '比赛', '创新创业', '科技作品'],
    weight: 4,
  },
  {
    label: '英语能力',
    reportKeywords: ['英语', '六级', '四级', 'cet', '雅思', '托福'],
    productKeywords: ['英语', '六级', '四级', '雅思', '托福'],
    weight: 3,
  },
  {
    label: '绩点与排名',
    reportKeywords: ['绩点', 'gpa', '排名', '成绩'],
    productKeywords: ['绩点', 'gpa', '课程', '成绩'],
    weight: 3,
  },
  {
    label: '申请与面试准备',
    reportKeywords: ['面试', '夏令营', '预推免', '文书', '简历', '申请'],
    productKeywords: ['面试', '夏令营', '预推免', '文书', '简历', '申请'],
    weight: 3,
  },
] as const

const ELITE_TARGET_KEYWORDS = [
  '清华',
  '北京大学',
  '北大',
  '复旦',
  '上海交通',
  '上交',
  '浙江大学',
  '浙大',
  '南京大学',
  '南大',
  '中国科学技术大学',
  '中科大',
]

function compactText(value: unknown) {
  return String(value ?? '').toLocaleLowerCase('zh-CN')
}

function productSearchText(product: ProductSummary) {
  return compactText(
    [
      product.productName,
      product.title,
      JSON.stringify(product.product),
      JSON.stringify(product.highlights),
    ].join(' '),
  )
}

function reportSearchText(assessment: AssessmentRecord) {
  const output = assessment.output
  return compactText(
    JSON.stringify({
      risks: output?.risks ?? [],
      targets: output?.targetAssessments ?? [],
      actions: output?.recommendedActions ?? [],
      inputTargets: assessment.input.targets,
    }),
  )
}

function hasAny(text: string, keywords: readonly string[]) {
  return keywords.some((keyword) => text.includes(keyword.toLocaleLowerCase('zh-CN')))
}

function buildServiceRecommendation(
  products: ProductSummary[],
  assessment: AssessmentRecord,
): RecommendationView | null {
  if (!assessment.output || !products.length) return null

  const reportText = reportSearchText(assessment)
  const targetText = compactText(
    assessment.input.targets.map((target) => target.schoolName).join(' '),
  )
  const hasEliteTarget = hasAny(targetText, ELITE_TARGET_KEYWORDS)
  const reachCount = assessment.output.targetAssessments.filter(
    (target) => target.tier === 'reach',
  ).length
  const stableCount = assessment.output.targetAssessments.filter(
    (target) => target.tier === 'match' || target.tier === 'conservative',
  ).length

  const candidates: RecommendationCandidate[] = products.map((product) => {
    const searchable = productSearchText(product)
    const needs: string[] = []
    let score = 0

    for (const rule of NEED_RULES) {
      if (
        hasAny(reportText, rule.reportKeywords) &&
        hasAny(searchable, rule.productKeywords)
      ) {
        score += rule.weight
        needs.push(rule.label)
      }
    }

    if (hasEliteTarget && /清北|华五/.test(searchable)) {
      score += 8
      needs.push('高目标院校专项准备')
    }

    if (reachCount > 0 && searchable.includes('跃升')) {
      score += 5
      needs.push('冲刺目标能力提升')
    }

    if (stableCount > 0 && searchable.includes('稳录')) {
      score += 3
      needs.push('目标稳妥落地')
    }

    return {
      product,
      score,
      needs: [...new Set(needs)],
    }
  })

  const best = candidates.sort((left, right) => right.score - left.score)[0]
  if (!best || best.score < 3) return null

  const matchedNeeds = best.needs.slice(0, 3)
  const needText = matchedNeeds.length
    ? matchedNeeds.join('、')
    : '本次评估识别出的关键提升需求'

  return {
    documentKey: best.product.documentKey,
    name: best.product.productName,
    matchedNeeds,
    matchedNeedsLabel: matchedNeeds.join('、') || '本次评估识别出的关键提升需求',
    reason:
      `本次评估的主要需求集中在${needText}；在当前九辰服务方案库中，「${best.product.productName}」的公开服务描述与这些问题匹配度最高。最终是否适用仍建议结合时间窗口和现有材料与老师确认。`,
  }
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

function wrapImageLine(line: string, maxUnits = 25) {
  if (!line) return ['']

  const lines: string[] = []
  let current = ''
  let units = 0

  for (const char of line) {
    const charUnits = /[\u0000-\u00ff]/.test(char) ? 0.55 : 1
    if (units + charUnits > maxUnits && current) {
      lines.push(current)
      current = char
      units = charUnits
    } else {
      current += char
      units += charUnits
    }
  }

  if (current) lines.push(current)
  return lines
}

function imageVisualLines(text: string) {
  return text.split(/\r?\n/).flatMap((line) => wrapImageLine(line))
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size))
  }
  return result
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
    error: '',
    displayName: '用户',
    assessmentDate: '',
    assessment: null as AssessmentRecord | null,
    output: null as ResultView | null,
    references: [] as AssessmentReportReference[],
    recommendation: null as RecommendationView | null,
    selectedReference: null as AssessmentReportReference | null,
    exportCanvasHeight: 1600,
  },

  onLoad(query: Record<string, string | undefined>) {
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
      const assessment = await getMyAssessment(id)
      if (assessment.status !== 'succeeded' || !assessment.output) {
        this.setData({ error: '该评估尚未生成可查看的报告' })
        return
      }

      const references = buildReferences(
        assessment.output,
        assessment.evidence ?? [],
      )
      const output = buildResultView(assessment.output, references)

      let recommendation: RecommendationView | null = null
      try {
        const products = await getProducts()
        recommendation = buildServiceRecommendation(products, assessment)
      } catch (error) {
        console.info(
          'Product recommendation source unavailable; report remains usable.',
          error,
        )
      }

      this.setData({
        assessment,
        output,
        references,
        recommendation,
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
    if (!this.data.assessment?.output) return null
    return {
      assessment: this.data.assessment,
      displayName: this.data.displayName,
      references: this.data.references,
      recommendation: this.data.recommendation,
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

  onServiceDetailTap() {
    const recommendation = this.data.recommendation
    if (!recommendation) return
    wx.navigateTo({
      url: `/pages/product-detail/product-detail?documentKey=${encodeURIComponent(recommendation.documentKey)}`,
    })
  },

  onCustomerServiceTap() {
    openWechatCustomerService()
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
        '图片',
        'Word（.docx）',
      ],
      success: (result) => {
        if (result.tapIndex === 0) void this.exportTextFile('md')
        if (result.tapIndex === 1) void this.exportTextFile('txt')
        if (result.tapIndex === 2) void this.exportImageReport()
        if (result.tapIndex === 3) void this.exportWordFile()
      },
    })
  },

  async exportTextFile(kind: 'md' | 'txt') {
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

  async exportImageReport() {
    const context = this.reportExportContext()
    if (!context) return

    const text = buildAssessmentReportPlainText(context)
    const pages = chunks(imageVisualLines(text), 38)

    try {
      this.setData({ exporting: true })
      wx.showLoading({ title: '正在生成图片' })

      for (let index = 0; index < pages.length; index += 1) {
        const tempPath = await this.renderImagePage(
          pages[index],
          index + 1,
          pages.length,
        )
        await new Promise<void>((resolve, reject) => {
          wx.saveImageToPhotosAlbum({
            filePath: tempPath,
            success() {
              resolve()
            },
            fail(error) {
              reject(new Error(error.errMsg || 'save_image_failed'))
            },
          })
        })
      }

      wx.hideLoading()
      wx.showToast({
        title: pages.length > 1 ? `已保存 ${pages.length} 张报告图` : '报告图片已保存',
        icon: 'success',
      })
    } catch (error) {
      wx.hideLoading()
      console.info('Assessment image export failed.', error)
      wx.showModal({
        title: '图片保存失败',
        content: '请检查相册权限后重试。长报告会自动拆分为多张图片，不会缩小到难以阅读。',
        showCancel: false,
      })
    } finally {
      this.setData({ exporting: false })
    }
  },

  renderImagePage(
    lines: string[],
    pageNumber: number,
    totalPages: number,
  ) {
    const width = 750
    const lineHeight = 38
    const top = 72
    const bottom = 72
    const footerHeight = 48
    const visualHeight = lines.reduce(
      (total, line) =>
        total +
        lineHeight +
        (/^[一二三四五六七八九十]+、/.test(line) ? 10 : 0),
      0,
    )
    const height = Math.max(
      900,
      top + visualHeight + bottom + footerHeight,
    )

    return new Promise<string>((resolve, reject) => {
      this.setData({ exportCanvasHeight: height }, () => {
        const context = wx.createCanvasContext('reportExportCanvas', this)
        context.setFillStyle('#ffffff')
        context.fillRect(0, 0, width, height)
        context.setTextBaseline('top')

        let y = top
        lines.forEach((line) => {
          const isSection = /^[一二三四五六七八九十]+、/.test(line)
          const isSubsection = /^（[一二三四五六七八九十]+）/.test(line)
          context.setFillStyle(isSection ? '#20242b' : '#4e5662')
          context.setFontSize(isSection ? 32 : isSubsection ? 28 : 25)
          context.fillText(line || ' ', 50, y)
          y += lineHeight + (isSection ? 10 : 0)
        })

        context.setFillStyle('#8a9099')
        context.setFontSize(20)
        context.fillText(
          `九辰保研 · 第 ${pageNumber} / ${totalPages} 页`,
          50,
          height - 52,
        )

        context.draw(false, () => {
          wx.canvasToTempFilePath(
            {
              canvasId: 'reportExportCanvas',
              x: 0,
              y: 0,
              width,
              height,
              destWidth: width * 2,
              destHeight: height * 2,
              fileType: 'png',
              quality: 1,
              success(result) {
                resolve(result.tempFilePath)
              },
              fail(error) {
                reject(new Error(error.errMsg || 'report_canvas_export_failed'))
              },
            },
            this,
          )
        })
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
