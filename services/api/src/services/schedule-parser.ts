import tcb from '@cloudbase/node-sdk'
import * as XLSX from 'xlsx'
import { z } from 'zod'
import type { AppEnv } from '../config/env.js'

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
  { index: 7, label: '周日', tokens: ['周日', '星期日', '星期天', '礼拜日', '日', '天'] },
]

const courseSchema = z.object({
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

const schedulePayloadSchema = z.object({
  courses: z.array(courseSchema).max(MAX_SCHEDULE_COURSES),
  warnings: z.array(z.string().trim().min(1).max(300)).max(20).optional().default([]),
})

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

function createCloudBaseApp(env: AppEnv) {
  return tcb.init({
    env: env.CLOUDBASE_ENV_ID ?? tcb.SYMBOL_CURRENT_ENV,
    ...(env.CLOUDBASE_APIKEY ? { accessKey: env.CLOUDBASE_APIKEY } : {}),
    timeout: 60_000,
  })
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
  if (rows.length > MAX_SCHEDULE_ROWS) {
    throw new Error('schedule_too_many_rows')
  }
  if (rows.some((row) => row.length > MAX_SCHEDULE_COLUMNS)) {
    throw new Error('schedule_too_many_columns')
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
    const slot = text(row[0]) || '第' + (rowIndex - headerIndex) + '行'
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

      if (courses.length > MAX_SCHEDULE_COURSES) {
        throw new Error('schedule_too_many_courses')
      }
    }
  }

  return canonicalSchedule(
    'spreadsheet',
    {
      courses,
      warnings:
        courses.length > 0
          ? []
          : ['已识别星期表头，但未检测到课程单元格，请检查表格布局。'],
    },
    'schedule_spreadsheet_invalid',
  )
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
  env: AppEnv,
): Promise<ParsedSchedule> {
  if (buffer.byteLength > MAX_SCHEDULE_IMAGE_BYTES) {
    throw new Error('schedule_image_too_large')
  }

  const app = createCloudBaseApp(env)
  const ai = app.ai()
  const model = ai.createModel('cloudbase')
  const dataUrl =
    'data:' + mimeFromName(fileName) + ';base64,' + buffer.toString('base64')

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

  return canonicalSchedule(
    'image',
    extractJson(result.text),
    'schedule_ai_invalid_payload',
  )
}

export async function downloadCloudFile(
  fileID: string,
  env: AppEnv,
  sourceType: ParsedSchedule['sourceType'],
) {
  const app = createCloudBaseApp(env)
  const result = await app.downloadFile({ fileID })
  if (!result.fileContent) throw new Error('schedule_file_download_failed')

  const buffer = Buffer.from(result.fileContent)
  if (buffer.byteLength > maxScheduleUploadBytes(sourceType)) {
    throw new Error(
      sourceType === 'image'
        ? 'schedule_image_too_large'
        : 'schedule_spreadsheet_too_large',
    )
  }
  return buffer
}

export async function deleteCloudFile(fileID: string, env: AppEnv) {
  const app = createCloudBaseApp(env)
  const result = await app.deleteFile({ fileList: [fileID] })
  const item = result.fileList?.[0]
  if (item?.code && item.code !== 'SUCCESS') {
    throw new Error('schedule_file_cleanup_failed')
  }
}
