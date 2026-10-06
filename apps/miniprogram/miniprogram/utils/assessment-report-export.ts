import type {
  AssessmentRecord,
} from './request'

export type AssessmentReportReference = {
  index: number
  ref: string
  caseId: string
  title: string
  metaLabel: string
  excerpt: string
  similarityReason: string
  resultSummary: string
  sourceType: 'jiuchen' | 'external' | 'official' | 'internal'
}

export type AssessmentReportExportContext = {
  assessment: AssessmentRecord
  displayName: string
  references: AssessmentReportReference[]
}

const CHINESE_NUMBERS = [
  '一',
  '二',
  '三',
  '四',
  '五',
  '六',
  '七',
  '八',
  '九',
  '十',
  '十一',
  '十二',
  '十三',
  '十四',
  '十五',
  '十六',
  '十七',
  '十八',
  '十九',
  '二十',
]

function chineseNumber(index: number) {
  return CHINESE_NUMBERS[index] || String(index + 1)
}

function citationSuffix(
  refs: string[],
  references: AssessmentReportReference[],
) {
  const indexByRef = new Map(references.map((item) => [item.ref, item.index]))
  const indexes = refs
    .map((ref) => indexByRef.get(ref))
    .filter((value): value is number => typeof value === 'number')

  const unique = [...new Set(indexes)].sort((left, right) => left - right)
  return unique.map((index) => `[${index}]`).join('')
}

export function formatAssessmentDate(value: string | null | undefined) {
  const parsed = value ? new Date(value) : new Date()
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed

  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}

function safeDisplayName(value: string) {
  const trimmed = value.trim()
  return trimmed && trimmed !== '微信用户' ? trimmed : '用户'
}

function safeFilePart(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '')
}

export function buildAssessmentReportBaseFilename(
  context: AssessmentReportExportContext,
) {
  const name =
    safeFilePart(safeDisplayName(context.displayName)).slice(0, 24) || '用户'
  const date = formatAssessmentDate(
    context.assessment.completedAt || context.assessment.updatedAt,
  )
  return `${name}${date}评估`
}

function targetLabel(
  tier: 'reach' | 'match' | 'conservative' | 'insufficient_data',
) {
  if (tier === 'reach') return '冲刺'
  if (tier === 'match') return '匹配'
  if (tier === 'conservative') return '稳妥'
  return '信息不足'
}

function compactReferenceText(value: string, max = 220) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length > max
    ? normalized.slice(0, max).trimEnd() + '…'
    : normalized
}

function priorityLabel(priority: 'high' | 'medium' | 'low') {
  if (priority === 'high') return '优先'
  if (priority === 'medium') return '重要'
  return '建议'
}

function pushFindingSection(
  lines: string[],
  title: string,
  findings: Array<{
    title: string
    detail: string
    evidenceRefs: string[]
  }>,
  references: AssessmentReportReference[],
) {
  lines.push(title)

  if (!findings.length) {
    lines.push('（一）暂无明确结论', '')
    return
  }

  findings.forEach((finding, index) => {
    lines.push(
      `（${chineseNumber(index)}）${finding.title}`,
      `1. ${finding.detail}${citationSuffix(finding.evidenceRefs, references)}`,
      '',
    )
  })
}

export function buildAssessmentReportPlainText(
  context: AssessmentReportExportContext,
) {
  const { assessment, references } = context
  const output = assessment.output

  if (!output) return ''

  const lines: string[] = [
    '九辰保研评估报告',
    `姓名：${safeDisplayName(context.displayName)}`,
    `评估日期：${formatAssessmentDate(assessment.completedAt || assessment.updatedAt)}`,
    `当前背景：${assessment.input.profile.university} · ${assessment.input.profile.major}`,
    assessment.model.name ? `评估模型：${assessment.model.name}` : '',
    '',
  ]

  pushFindingSection(lines, '一、优势', output.strengths, references)
  pushFindingSection(lines, '二、风险', output.risks, references)

  lines.push('三、目标评估')
  output.targetAssessments.forEach((target, index) => {
    const program = target.programName ? ` · ${target.programName}` : ''
    lines.push(
      `（${chineseNumber(index)}）${target.schoolName}${program}（${targetLabel(target.tier)}）`,
      `1. 判断：${target.rationale}${citationSuffix(target.evidenceRefs, references)}`,
    )

    if (target.gapItems.length) {
      lines.push('2. 关键差距：')
      target.gapItems.forEach((item, gapIndex) => {
        lines.push(`（${gapIndex + 1}）${item}`)
      })
    }

    if (target.actions.length) {
      lines.push('3. 针对性动作：')
      target.actions.forEach((item, actionIndex) => {
        lines.push(`（${actionIndex + 1}）${item}`)
      })
    }

    lines.push('')
  })

  lines.push('四、推荐行动')
  if (!output.recommendedActions.length) {
    lines.push('（一）暂无额外行动建议。', '')
  } else {
    output.recommendedActions.forEach((action, index) => {
      lines.push(
        `（${chineseNumber(index)}）${action.title}（${priorityLabel(action.priority)}）`,
        `1. ${action.rationale}`,
      )
      if (action.timeframe) lines.push(`2. 建议周期：${action.timeframe}`)
      lines.push('')
    })
  }

  lines.push(
    '五、联系老师',
    '（一）人工咨询',
    '1. 可携带本次评估结果联系九辰老师，重点确认目标梯度、关键差距与下一阶段执行安排。',
    '2. 咨询时建议同时说明目标院校、时间窗口和当前最希望解决的问题。',
    '',
  )

  lines.push('六、参考案例')
  if (!references.length) {
    lines.push('当前正文没有直接引用可展示的案例。')
  } else {
    references.forEach((reference) => {
      lines.push(
        `[${reference.index}] ${reference.title}${reference.metaLabel ? `（${reference.metaLabel}）` : ''}`,
      )
      if (reference.similarityReason) {
        lines.push(`1. 与本次判断的关联：${reference.similarityReason}`)
      }
      if (reference.resultSummary) {
        lines.push(`2. 结果参照：${reference.resultSummary}`)
      }
      if (reference.excerpt) {
        lines.push(`3. 案例摘要：${compactReferenceText(reference.excerpt)}`)
      }
      lines.push('')
    })
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}


export function buildAssessmentReportMarkdown(
  context: AssessmentReportExportContext,
) {
  const { assessment, references } = context
  const output = assessment.output
  if (!output) return ''

  const lines = [
    '# 九辰保研评估报告',
    '',
    `- 姓名：${safeDisplayName(context.displayName)}`,
    `- 评估日期：${formatAssessmentDate(assessment.completedAt || assessment.updatedAt)}`,
    `- 当前背景：${assessment.input.profile.university} · ${assessment.input.profile.major}`,
    assessment.model.name ? `- 评估模型：${assessment.model.name}` : '',
    '',
    '## 一、优势',
    '',
  ].filter(Boolean)

  if (!output.strengths.length) lines.push('暂无明确优势结论。', '')
  output.strengths.forEach((item, index) => {
    lines.push(
      `### （${chineseNumber(index)}）${item.title}`,
      '',
      `${item.detail}${citationSuffix(item.evidenceRefs, references)}`,
      '',
    )
  })

  lines.push('## 二、风险', '')
  if (!output.risks.length) lines.push('暂无明确风险结论。', '')
  output.risks.forEach((item, index) => {
    lines.push(
      `### （${chineseNumber(index)}）${item.title}`,
      '',
      `${item.detail}${citationSuffix(item.evidenceRefs, references)}`,
      '',
    )
  })

  lines.push('## 三、目标评估', '')
  output.targetAssessments.forEach((target, index) => {
    const program = target.programName ? ` · ${target.programName}` : ''
    lines.push(
      `### （${chineseNumber(index)}）${target.schoolName}${program}（${targetLabel(target.tier)}）`,
      '',
      `**判断：** ${target.rationale}${citationSuffix(target.evidenceRefs, references)}`,
      '',
    )
    if (target.gapItems.length) {
      lines.push('**关键差距：**', '')
      target.gapItems.forEach((item) => lines.push(`- ${item}`))
      lines.push('')
    }
    if (target.actions.length) {
      lines.push('**针对性动作：**', '')
      target.actions.forEach((item) => lines.push(`- ${item}`))
      lines.push('')
    }
  })

  lines.push('## 四、推荐行动', '')
  if (!output.recommendedActions.length) lines.push('暂无额外行动建议。', '')
  output.recommendedActions.forEach((item, index) => {
    lines.push(
      `### （${chineseNumber(index)}）${item.title}（${priorityLabel(item.priority)}）`,
      '',
      item.rationale,
      '',
    )
    if (item.timeframe) lines.push(`建议周期：${item.timeframe}`, '')
  })

  lines.push(
    '## 五、联系老师',
    '',
    '可携带本次评估结果联系九辰老师，重点确认目标梯度、关键差距和下一阶段执行安排。',
    '',
    '## 六、参考案例',
    '',
  )

  if (!references.length) {
    lines.push('当前正文没有直接引用可展示的案例。')
  } else {
    references.forEach((reference) => {
      lines.push(
        `### [${reference.index}] ${reference.title}`,
        '',
        reference.metaLabel ? `来源：${reference.metaLabel}` : '',
        reference.similarityReason
          ? `与本次判断的关联：${reference.similarityReason}`
          : '',
        reference.resultSummary
          ? `结果参照：${reference.resultSummary}`
          : '',
        reference.excerpt ? `案例摘要：${compactReferenceText(reference.excerpt)}` : '',
        '',
      )
    })
  }

  return lines.filter((line, index, all) =>
    line !== '' || index === 0 || all[index - 1] !== ''
  ).join('\n').trim()
}

function utf8Bytes(value: string) {
  const bytes: number[] = []

  for (let index = 0; index < value.length; index += 1) {
    let code = value.charCodeAt(index)

    if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00)
        index += 1
      }
    }

    if (code <= 0x7f) {
      bytes.push(code)
    } else if (code <= 0x7ff) {
      bytes.push(
        0xc0 | (code >> 6),
        0x80 | (code & 0x3f),
      )
    } else if (code <= 0xffff) {
      bytes.push(
        0xe0 | (code >> 12),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      )
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      )
    }
  }

  return new Uint8Array(bytes)
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff

  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }

  return (crc ^ 0xffffffff) >>> 0
}

function writeUint16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true)
}

function writeUint32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value >>> 0, true)
}

function concatBytes(parts: Uint8Array[]) {
  const size = parts.reduce((total, part) => total + part.length, 0)
  const merged = new Uint8Array(size)
  let offset = 0

  for (const part of parts) {
    merged.set(part, offset)
    offset += part.length
  }

  return merged
}

function zipStore(entries: Array<{ name: string; data: Uint8Array }>) {
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let localOffset = 0

  entries.forEach((entry) => {
    const name = utf8Bytes(entry.name)
    const checksum = crc32(entry.data)

    const localHeader = new Uint8Array(30)
    const localView = new DataView(localHeader.buffer)
    writeUint32(localView, 0, 0x04034b50)
    writeUint16(localView, 4, 20)
    writeUint16(localView, 6, 0x0800)
    writeUint16(localView, 8, 0)
    writeUint16(localView, 10, 0)
    writeUint16(localView, 12, 0)
    writeUint32(localView, 14, checksum)
    writeUint32(localView, 18, entry.data.length)
    writeUint32(localView, 22, entry.data.length)
    writeUint16(localView, 26, name.length)
    writeUint16(localView, 28, 0)

    localParts.push(localHeader, name, entry.data)

    const centralHeader = new Uint8Array(46)
    const centralView = new DataView(centralHeader.buffer)
    writeUint32(centralView, 0, 0x02014b50)
    writeUint16(centralView, 4, 20)
    writeUint16(centralView, 6, 20)
    writeUint16(centralView, 8, 0x0800)
    writeUint16(centralView, 10, 0)
    writeUint16(centralView, 12, 0)
    writeUint16(centralView, 14, 0)
    writeUint32(centralView, 16, checksum)
    writeUint32(centralView, 20, entry.data.length)
    writeUint32(centralView, 24, entry.data.length)
    writeUint16(centralView, 28, name.length)
    writeUint16(centralView, 30, 0)
    writeUint16(centralView, 32, 0)
    writeUint16(centralView, 34, 0)
    writeUint16(centralView, 36, 0)
    writeUint32(centralView, 38, 0)
    writeUint32(centralView, 42, localOffset)

    centralParts.push(centralHeader, name)
    localOffset += localHeader.length + name.length + entry.data.length
  })

  const local = concatBytes(localParts)
  const central = concatBytes(centralParts)
  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)

  writeUint32(endView, 0, 0x06054b50)
  writeUint16(endView, 4, 0)
  writeUint16(endView, 6, 0)
  writeUint16(endView, 8, entries.length)
  writeUint16(endView, 10, entries.length)
  writeUint32(endView, 12, central.length)
  writeUint32(endView, 16, local.length)
  writeUint16(endView, 20, 0)

  return concatBytes([local, central, end])
}

function xmlEscape(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function paragraphStyle(line: string, index: number) {
  if (index === 0) return 'Title'
  if (/^[一二三四五六七八九十]+、/.test(line)) return 'Heading1'
  if (/^（[一二三四五六七八九十]+）/.test(line)) return 'Heading2'
  return 'Normal'
}

export function buildAssessmentReportDocx(
  context: AssessmentReportExportContext,
) {
  const plainText = buildAssessmentReportPlainText(context)
  const lines = plainText.split(/\r?\n/)

  const paragraphs = lines.map((line, index) => {
    if (!line) return '<w:p/>'
    const style = paragraphStyle(line, index)
    return (
      '<w:p>' +
      '<w:pPr><w:pStyle w:val="' + style + '"/></w:pPr>' +
      '<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Microsoft YaHei"/></w:rPr>' +
      '<w:t xml:space="preserve">' + xmlEscape(line) + '</w:t></w:r>' +
      '</w:p>'
    )
  }).join('')

  const documentXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:body>' +
    paragraphs +
    '<w:sectPr>' +
    '<w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/>' +
    '</w:sectPr>' +
    '</w:body></w:document>'

  const stylesXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/><w:spacing w:after="320"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="Heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="260" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="Heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="160" w:after="80"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>' +
    '</w:styles>'

  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '</Types>'

  const rootRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships>'

  const documentRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '</Relationships>'

  const archive = zipStore([
    { name: '[Content_Types].xml', data: utf8Bytes(contentTypes) },
    { name: '_rels/.rels', data: utf8Bytes(rootRels) },
    { name: 'word/document.xml', data: utf8Bytes(documentXml) },
    { name: 'word/_rels/document.xml.rels', data: utf8Bytes(documentRels) },
    { name: 'word/styles.xml', data: utf8Bytes(stylesXml) },
  ])

  return archive.buffer as ArrayBuffer
}

export function writeAssessmentReportFile(
  fileName: string,
  data: string | ArrayBuffer,
) {
  const filePath = `${wx.env.USER_DATA_PATH}/${safeFilePart(fileName)}`
  const manager = wx.getFileSystemManager()

  return new Promise<string>((resolve, reject) => {
    const success = () => resolve(filePath)
    const fail = (error: { errMsg?: string }) => {
      reject(new Error(error.errMsg || 'report_file_write_failed'))
    }

    if (typeof data === 'string') {
      manager.writeFile({
        filePath,
        data,
        encoding: 'utf8',
        success,
        fail,
      })
      return
    }

    manager.writeFile({
      filePath,
      data,
      success,
      fail,
    })
  })
}
