import tcb from '@cloudbase/node-sdk'
import * as XLSX from 'xlsx'

export type ParsedScheduleCourse = {
  name: string
  day: string
  dayIndex: number
  slot: string
  startSection: number | null
  endSection: number | null
  time: string | null
  location: string | null
  teacher: string | null
  weeks: string | null
  raw: string
}

export type ParsedSchedule = {
  sourceType: 'spreadsheet' | 'image'
  courses: ParsedScheduleCourse[]
  warnings: string[]
}

const DAY_ALIASES: Array<{ index: number; label: string; tokens: string[] }> = [
  { index: 1, label: '周一', tokens: ['周一', '星期一', '礼拜一', '一'] },
  { index: 2, label: '周二', tokens: ['周二', '星期二', '礼拜二', '二'] },
  { index: 3, label: '周三', tokens: ['周三', '星期三', '礼拜三', '三'] },
  { index: 4, label: '周四', tokens: ['周四', '星期四', '礼拜四', '四'] },
  { index: 5, label: '周五', tokens: ['周五', '星期五', '礼拜五', '五'] },
  { index: 6, label: '周六', tokens: ['周六', '星期六', '礼拜六', '六'] },
  { index: 7, label: '周日', tokens: ['周日', '星期日', '星期天', '礼拜日', '日', '天'] },
]

function text(value: unknown) {
  return String(value ?? '').replace(/\r/g, '').trim()
}

function inferDay(value: string) {
  const normalized = value.replace(/\s+/g, '')
  return DAY_ALIASES.find((day) =>
    day.tokens.some((token) => normalized === token || normalized.includes(token)),
  )
}

function sectionRange(value: string) {
  const nums = value.match(/\d+/g)?.map(Number) ?? []
  if (nums.length === 0) return { start: null, end: null }
  return { start: nums[0], end: nums[nums.length - 1] }
}

function parseCourseCell(rawValue: string) {
  const lines = rawValue
    .split(/\n|；|;/)
    .map((item) => item.trim())
    .filter(Boolean)

  const name = lines[0] || rawValue.trim()
  let location: string | null = null
  let teacher: string | null = null
  let weeks: string | null = null
  let time: string | null = null

  for (const line of lines.slice(1)) {
    if (/周|week/i.test(line) && !weeks) weeks = line
    else if (/老师|教师|教授|讲师/.test(line) && !teacher) teacher = line
    else if (/教室|楼|馆|室|校区|实验室/.test(line) && !location) location = line
    else if (/\d{1,2}:\d{2}/.test(line) && !time) time = line
  }

  return { name, location, teacher, weeks, time }
}

export function parseSpreadsheetSchedule(buffer: Buffer): ParsedSchedule {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false })
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!firstSheet) {
    throw new Error('schedule_spreadsheet_empty')
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, {
    header: 1,
    raw: false,
    defval: '',
  })

  if (rows.length === 0) {
    throw new Error('schedule_spreadsheet_empty')
  }

  let headerIndex = -1
  let dayColumns: Array<{ column: number; dayIndex: number; day: string }> = []

  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 12); rowIndex += 1) {
    const row = rows[rowIndex] ?? []
    const candidates = row
      .map((cell, column) => ({ column, day: inferDay(text(cell)) }))
      .filter((item) => item.day)

    if (candidates.length >= 3) {
      headerIndex = rowIndex
      dayColumns = candidates.map((item) => ({
        column: item.column,
        dayIndex: item.day!.index,
        day: item.day!.label,
      }))
      break
    }
  }

  if (headerIndex < 0 || dayColumns.length === 0) {
    throw new Error('schedule_weekday_header_not_found')
  }

  const courses: ParsedScheduleCourse[] = []
  for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? []
    const slot = text(row[0]) || `第${rowIndex - headerIndex}行`
    const sections = sectionRange(slot)

    for (const column of dayColumns) {
      const raw = text(row[column.column])
      if (!raw || /^[-—/\\]+$/.test(raw)) continue

      const parsed = parseCourseCell(raw)
      courses.push({
        name: parsed.name,
        day: column.day,
        dayIndex: column.dayIndex,
        slot,
        startSection: sections.start,
        endSection: sections.end,
        time: parsed.time,
        location: parsed.location,
        teacher: parsed.teacher,
        weeks: parsed.weeks,
        raw,
      })
    }
  }

  return {
    sourceType: 'spreadsheet',
    courses,
    warnings:
      courses.length > 0
        ? []
        : ['已识别星期表头，但未检测到课程单元格，请检查表格布局。'],
  }
}

function mimeFromName(fileName: string) {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  return 'image/jpeg'
}

function extractJson(textValue: string) {
  const trimmed = textValue.trim()
  const unfenced = trimmed
    .replace(/^\`\`\`(?:json)?\s*/i, '')
    .replace(/\s*\`\`\`$/, '')
  const start = unfenced.indexOf('{')
  const end = unfenced.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('schedule_ai_invalid_json')
  return JSON.parse(unfenced.slice(start, end + 1)) as unknown
}

export async function parseImageSchedule(
  buffer: Buffer,
  fileName: string,
): Promise<ParsedSchedule> {
  if (buffer.byteLength > 5 * 1024 * 1024) {
    throw new Error('schedule_image_too_large')
  }

  const app = tcb.init({ env: tcb.SYMBOL_CURRENT_ENV })
  const ai = app.ai()
  const model = ai.createModel('cloudbase')
  const dataUrl = `data:${mimeFromName(fileName)};base64,${buffer.toString('base64')}`

  const result = await model.generateText({
    model: 'qwen3.5-plus',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text:
              '这是大学课程表截图。请只输出 JSON，不要解释。格式：{"courses":[{"name":"课程名","day":"周一","dayIndex":1,"slot":"第1-2节","startSection":1,"endSection":2,"time":null,"location":null,"teacher":null,"weeks":null,"raw":"原始单元格文字"}],"warnings":[]}。必须忠于图片；看不清的字段填 null，不要编造。',
          },
          {
            type: 'image_url',
            image_url: { url: dataUrl },
          },
        ],
      },
    ],
  } as never)

  const parsed = extractJson(result.text) as {
    courses?: ParsedScheduleCourse[]
    warnings?: string[]
  }

  return {
    sourceType: 'image',
    courses: Array.isArray(parsed.courses) ? parsed.courses : [],
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
  }
}

export async function downloadCloudFile(fileID: string) {
  const app = tcb.init({ env: tcb.SYMBOL_CURRENT_ENV })
  const result = await app.downloadFile({ fileID })
  if (!result.fileContent) throw new Error('schedule_file_download_failed')
  return Buffer.from(result.fileContent)
}
