import * as XLSX from 'xlsx'
import { z } from 'zod'
import type { JsonModelProvider } from './ai-provider.js'

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
  stageCode?: string | null
  termStartDate?: string | null
  editedAt?: string | null
}

export const MAX_SCHEDULE_SPREADSHEET_BYTES = 5 * 1024 * 1024
export const MAX_SCHEDULE_IMAGE_BYTES = 5 * 1024 * 1024
export const MAX_SCHEDULE_SHEETS = 20
export const MAX_SCHEDULE_ROWS = 2000
export const MAX_SCHEDULE_COLUMNS = 100
export const MAX_SCHEDULE_COURSES = 500

const DAY_ALIASES: Array<{ index: number; label: string; tokens: string[] }> = [
  { index: 1, label: '周一', tokens: ['周一', '星期一', '礼拜一', '一'] },
  { index: 2, label: '周二', tokens: ['周二', '星期二', '礼拜二', '二'] },
  { index: 3, label: '周三', tokens: ['周三', '星期三', '礼拜三', '三'] },
  { index: 4, label: '周四', tokens: ['周四', '星期四', '礼拜四', '四'] },
  { index: 5, label: '周五', tokens: ['周五', '星期五', '礼拜五', '五'] },
  { index: 6, label: '周六', tokens: ['周六', '星期六', '礼拜六', '六'] },
  { index: 7, label: '周日', tokens: ['周日', '星期日', '星期天', '礼拜日', '礼拜天', '日', '天'] },
]

export const parsedScheduleCourseSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    day: z.string().trim().min(1).max(16),
    dayIndex: z.number().int().min(1).max(7),
    slot: z.string().trim().min(1).max(80),
    startSection: z.number().int().min(1).max(50).nullable(),
    endSection: z.number().int().min(1).max(50).nullable(),
    time: z.string().trim().max(80).nullable(),
    location: z.string().trim().max(160).nullable(),
    teacher: z.string().trim().max(120).nullable(),
    weeks: z.string().trim().max(160).nullable(),
    raw: z.string().max(1000),
  })
  .strict()

export const editableScheduleSchema = z
  .object({
    sourceType: z.enum(['spreadsheet', 'image']),
    stageCode: z.string().regex(/^(freshman|sophomore|junior|senior)-(fall|spring)$/).nullable().optional(),
    courses: z.array(parsedScheduleCourseSchema).max(MAX_SCHEDULE_COURSES),
    warnings: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
    termStartDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    editedAt: z.string().datetime().nullable().optional(),
  })
  .strict()

const schedulePayloadSchema = z.object({
  courses: z.array(parsedScheduleCourseSchema).max(MAX_SCHEDULE_COURSES),
  warnings: z.array(z.string().trim().min(1).max(300)).max(20).optional().default([]),
})

function text(value: unknown) {
  return String(value ?? '').replace(/\r/g, '').trim()
}

function inferDay(value: string) {
  const normalized = value
    .replace(/\s+/g, '')
    .replace(/[：:]/g, '')
    .replace(/^课程表/, '')

  const exact = DAY_ALIASES.find((day) =>
    day.tokens.some((token) => normalized === token),
  )
  if (exact) return exact

  const fullLabel = normalized.match(/(?:星期|礼拜|周)([一二三四五六日天])/)
  if (!fullLabel) return undefined

  const suffix = fullLabel[1]
  return DAY_ALIASES.find((day) =>
    day.tokens.includes(suffix) ||
    day.tokens.some((token) => token.endsWith(suffix)),
  )
}

function looksLikeClockSlot(value: string) {
  return /^\s*\d{1,2}:\d{2}(?:\s*[-~—至]\s*\d{1,2}:\d{2})?\s*$/.test(value)
}

function sectionRange(value: string) {
  if (looksLikeClockSlot(value)) return { start: null, end: null }

  const nums = value.match(/\d+/g)?.map(Number) ?? []
  if (nums.length === 0) return { start: null, end: null }
  return { start: nums[0], end: nums[nums.length - 1] }
}

const WEEK_EXPRESSION =
  /(?:第?\d+(?:[-~—至,，、]\d+)*(?:\[(?:单|双)?周\]|(?:单|双)?周)|单双周|单周|双周|week(?:s)?\s*\d+(?:[-~,]\d+)*)/i

function looksLikeLocation(value: string) {
  const normalized = value.trim()
  return (
    /教室|教学楼|楼|馆|室|校区|实验室|地点|座|科教/.test(normalized) ||
    /^[A-Za-z]\s*座?\s*\d{2,4}(?:[-－]\d+)?$/i.test(normalized) ||
    /^[\p{Script=Han}A-Za-z·_-]{1,20}\d{2,4}(?:[-－]\d+)?$/u.test(normalized)
  )
}

function parseCourseCell(rawValue: string) {
  const lines = rawValue
    .split(/\n|；|;/)
    .map((item) => item.trim())
    .filter(Boolean)

  const name = lines[0] || rawValue.trim()
  let location: string | null = null
  let weeks: string | null = null
  let time: string | null = null
  const teacherParts: string[] = []

  for (const line of lines.slice(1)) {
    if (/\d{1,2}:\d{2}/.test(line) && !time) {
      time = line
      continue
    }

    if (looksLikeLocation(line) && !location) {
      location = line.replace(/^地点[:：]?/, '').trim() || line
      continue
    }

    const weekMatch = line.match(WEEK_EXPRESSION)
    let remainder = line

    if (weekMatch) {
      if (!weeks) weeks = weekMatch[0]
      remainder = line.replace(weekMatch[0], '').trim()
    }

    remainder = remainder
      .replace(/^(?:老师|教师|任课教师|任课)[:：]?/, '')
      .trim()

    if (remainder) teacherParts.push(remainder)
  }

  const teacher = teacherParts.length
    ? teacherParts.join(' ').replace(/\s+/g, ' ').trim()
    : null

  return { name, location, teacher, weeks, time }
}

function canonicalSchedule(
  sourceType: ParsedSchedule['sourceType'],
  payload: unknown,
  errorCode: string,
): ParsedSchedule {
  const parsed = schedulePayloadSchema.safeParse(payload)
  if (!parsed.success) {
    throw new Error(errorCode)
  }

  return {
    sourceType,
    courses: parsed.data.courses.map((course) => ({
      ...course,
      day: DAY_ALIASES[course.dayIndex - 1]?.label ?? course.day,
    })),
    warnings: parsed.data.warnings,
    termStartDate: null,
    editedAt: null,
  }
}

export function normalizeEditableSchedule(value: unknown): ParsedSchedule {
  const parsed = editableScheduleSchema.parse(value)
  return {
    ...parsed,
    courses: parsed.courses.map((course) => ({
      ...course,
      day: DAY_ALIASES[course.dayIndex - 1]?.label ?? course.day,
    })),
    termStartDate: parsed.termStartDate ?? null,
    editedAt: parsed.editedAt ?? null,
  }
}

export function maxScheduleUploadBytes(sourceType: ParsedSchedule['sourceType']) {
  return sourceType === 'image'
    ? MAX_SCHEDULE_IMAGE_BYTES
    : MAX_SCHEDULE_SPREADSHEET_BYTES
}

export function isSupportedScheduleFileName(
  fileName: string,
  sourceType: ParsedSchedule['sourceType'],
) {
  const lower = fileName.toLowerCase()
  if (sourceType === 'image') {
    return ['.jpg', '.jpeg', '.png', '.webp'].some((ext) => lower.endsWith(ext))
  }
  return ['.xlsx', '.xls', '.csv'].some((ext) => lower.endsWith(ext))
}

function safeCloudPathSegment(value: string) {
  return value.replace(/[^0-9A-Za-z._-]/g, '_')
}

export function isOwnedScheduleImportFile(fileID: string, userId: string) {
  if (!fileID.startsWith('cloud://')) return false
  const expected = '/schedule-imports/' + safeCloudPathSegment(userId) + '/'
  return fileID.includes(expected)
}

type DayColumnGroup = {
  dayIndex: number
  day: string
  columns: number[]
}

function mergedColumnsForHeaderCell(
  sheet: XLSX.WorkSheet,
  row: number,
  column: number,
) {
  const merges = (sheet['!merges'] ?? []) as XLSX.Range[]
  const merge = merges.find(
    (range) =>
      row >= range.s.r &&
      row <= range.e.r &&
      column >= range.s.c &&
      column <= range.e.c &&
      range.s.r === row &&
      range.s.c === column,
  )

  if (!merge) return [column]

  const columns: number[] = []
  for (let current = merge.s.c; current <= merge.e.c; current += 1) {
    columns.push(current)
  }
  return columns
}

function detectDayGroups(
  sheet: XLSX.WorkSheet,
  rows: unknown[][],
) {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 30); rowIndex += 1) {
    const row = rows[rowIndex] ?? []
    const byDay = new Map<number, DayColumnGroup>()

    row.forEach((cell, column) => {
      const day = inferDay(text(cell))
      if (!day) return

      const columns = mergedColumnsForHeaderCell(sheet, rowIndex, column)
      const existing = byDay.get(day.index)
      if (existing) {
        existing.columns = [...new Set([...existing.columns, ...columns])]
        return
      }

      byDay.set(day.index, {
        dayIndex: day.index,
        day: day.label,
        columns,
      })
    })

    const groups = [...byDay.values()].sort((left, right) => left.dayIndex - right.dayIndex)
    if (groups.length >= 3) {
      return {
        headerIndex: rowIndex,
        groups,
      }
    }
  }

  return null
}

function detectSlotColumn(
  rows: unknown[][],
  headerIndex: number,
  groups: DayColumnGroup[],
) {
  const minDayColumn = Math.min(...groups.flatMap((group) => group.columns))
  const header = rows[headerIndex] ?? []

  for (let column = 0; column < minDayColumn; column += 1) {
    const label = text(header[column]).replace(/\s+/g, '')
    if (/节次|节数|课节|时间|时段/.test(label)) return column
  }

  return Math.max(0, minDayColumn - 1)
}

function looksLikeSubheader(value: string) {
  const parts = value
    .split(/\n/)
    .map((item) => item.trim())
    .filter(Boolean)

  if (!parts.length) return true

  return parts.every((part) =>
    /^(课程|课程名|课程名称|地点|教室|教师|老师|任课教师|周次|时间|节次|备注)$/.test(part),
  )
}

function combineDayCells(row: unknown[], columns: number[]) {
  const parts = columns
    .map((column) => text(row[column]))
    .filter(Boolean)
  return [...new Set(parts)].join('\n')
}

function parseSheetSchedule(
  sheet: XLSX.WorkSheet,
  rows: unknown[][],
): ParsedScheduleCourse[] | null {
  const header = detectDayGroups(sheet, rows)
  if (!header) return null

  const slotColumn = detectSlotColumn(rows, header.headerIndex, header.groups)
  const courses: ParsedScheduleCourse[] = []
  const seen = new Set<string>()

  for (let rowIndex = header.headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? []
    const slotCandidate = text(row[slotColumn]) || text(row[0])
    const slot = slotCandidate || '第' + (rowIndex - header.headerIndex) + '行'
    const sections = sectionRange(slot)

    for (const group of header.groups) {
      const raw = combineDayCells(row, group.columns)
      if (!raw || /^[-—/\\]+$/.test(raw) || looksLikeSubheader(raw)) continue

      const parsed = parseCourseCell(raw)
      if (!parsed.name) continue

      const key = `${group.dayIndex}|${slot}|${raw}`
      if (seen.has(key)) continue
      seen.add(key)

      courses.push({
        name: parsed.name,
        day: group.day,
        dayIndex: group.dayIndex,
        slot,
        startSection: sections.start,
        endSection: sections.end,
        time: parsed.time ?? (looksLikeClockSlot(slot) ? slot : null),
        location: parsed.location,
        teacher: parsed.teacher,
        weeks: parsed.weeks,
        raw,
      })

      if (courses.length > MAX_SCHEDULE_COURSES) {
        throw new Error('schedule_too_many_courses')
      }
    }
  }

  return courses
}

export function parseSpreadsheetSchedule(buffer: Buffer): ParsedSchedule {
  if (buffer.byteLength > MAX_SCHEDULE_SPREADSHEET_BYTES) {
    throw new Error('schedule_spreadsheet_too_large')
  }

  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    cellDates: false,
    sheetRows: MAX_SCHEDULE_ROWS + 1,
  })

  if (workbook.SheetNames.length > MAX_SCHEDULE_SHEETS) {
    throw new Error('schedule_too_many_sheets')
  }

  if (workbook.SheetNames.length === 0) {
    throw new Error('schedule_spreadsheet_empty')
  }

  let headerFound = false

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue

    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      defval: '',
    })

    if (rows.length === 0) continue
    if (rows.length > MAX_SCHEDULE_ROWS) {
      throw new Error('schedule_too_many_rows')
    }
    if (rows.some((row) => row.length > MAX_SCHEDULE_COLUMNS)) {
      throw new Error('schedule_too_many_columns')
    }

    const courses = parseSheetSchedule(sheet, rows)
    if (courses === null) continue
    headerFound = true

    if (courses.length > 0) {
      return canonicalSchedule(
        'spreadsheet',
        { courses, warnings: [] },
        'schedule_spreadsheet_invalid',
      )
    }
  }

  if (!headerFound) {
    throw new Error('schedule_weekday_header_not_found')
  }

  throw new Error('schedule_spreadsheet_invalid')
}

function mimeFromName(fileName: string) {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  return 'image/jpeg'
}

export async function parseImageSchedule(
  buffer: Buffer,
  fileName: string,
  provider: JsonModelProvider,
): Promise<ParsedSchedule> {
  if (buffer.byteLength > MAX_SCHEDULE_IMAGE_BYTES) {
    throw new Error('schedule_image_too_large')
  }

  if (!provider.isConfigured()) {
    throw new Error('schedule_ai_provider_not_configured')
  }

  const dataUrl =
    'data:' + mimeFromName(fileName) + ';base64,' + buffer.toString('base64')

  const payload = await provider.generateJson({
    system:
      '你是大学课程表图片解析器。只输出一个 JSON 对象，不要 Markdown，不要解释。必须忠于图片；看不清的字段填 null，不要编造。',
    user: [
      {
        type: 'text',
        text:
          '请按以下结构提取课程表：{"courses":[{"name":"课程名","day":"周一","dayIndex":1,"slot":"第1-2节","startSection":1,"endSection":2,"time":null,"location":null,"teacher":null,"weeks":null,"raw":"原始单元格文字"}],"warnings":[]}。',
      },
      {
        type: 'image_url',
        image_url: { url: dataUrl },
      },
    ],
    maxTokens: 3500,
  })

  return canonicalSchedule(
    'image',
    payload,
    'schedule_ai_invalid_payload',
  )
}

export function createManualScheduleFallback(
  sourceType: ParsedSchedule['sourceType'],
  reason: string,
): ParsedSchedule {
  const message =
    reason === 'schedule_ai_provider_not_configured'
      ? '图片自动识别模型尚未配置。已保留一个可手动编辑的课表，你可以直接新增课程。'
      : '自动解析没有可靠识别出课表结构。已进入手动校正模式，你可以直接新增或修改课程。'

  return {
    sourceType,
    courses: [],
    warnings: [message],
    termStartDate: null,
    editedAt: null,
  }
}
