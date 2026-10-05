import assert from 'node:assert/strict'
import test from 'node:test'
import * as XLSX from 'xlsx'
import {
  MAX_SCHEDULE_SPREADSHEET_BYTES,
  createManualScheduleFallback,
  isOwnedScheduleImportFile,
  isSupportedScheduleFileName,
  normalizeEditableSchedule,
  parseImageSchedule,
  parseSpreadsheetSchedule,
} from './schedule-parser.js'

test('parseSpreadsheetSchedule returns canonical courses', () => {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet([
    ['节次', '周一', '周二', '周三', '周四', '周五'],
    ['第1-2节', '高等数学\nA301\n张老师\n1-16周', '', '大学英语', '', ''],
  ])
  XLSX.utils.book_append_sheet(workbook, sheet, '课表')

  const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  const result = parseSpreadsheetSchedule(Buffer.from(bytes))

  assert.equal(result.sourceType, 'spreadsheet')
  assert.equal(result.courses.length, 2)
  assert.deepEqual(
    result.courses.map((course) => [course.dayIndex, course.day, course.name]),
    [
      [1, '周一', '高等数学'],
      [3, '周三', '大学英语'],
    ],
  )
})

test('parseSpreadsheetSchedule rejects oversized input before parsing', () => {
  assert.throws(
    () =>
      parseSpreadsheetSchedule(
        Buffer.alloc(MAX_SCHEDULE_SPREADSHEET_BYTES + 1),
      ),
    /schedule_spreadsheet_too_large/,
  )
})

test('schedule import ownership is scoped to the authenticated user path', () => {
  assert.equal(
    isOwnedScheduleImportFile(
      'cloud://env.bucket/schedule-imports/user-123/123-schedule.xlsx',
      'user-123',
    ),
    true,
  )
  assert.equal(
    isOwnedScheduleImportFile(
      'cloud://env.bucket/schedule-imports/other-user/123-schedule.xlsx',
      'user-123',
    ),
    false,
  )
})

test('schedule import file type must match the declared source type', () => {
  assert.equal(isSupportedScheduleFileName('schedule.xlsx', 'spreadsheet'), true)
  assert.equal(isSupportedScheduleFileName('schedule.csv', 'spreadsheet'), true)
  assert.equal(isSupportedScheduleFileName('schedule.png', 'image'), true)
  assert.equal(isSupportedScheduleFileName('schedule.exe', 'spreadsheet'), false)
  assert.equal(isSupportedScheduleFileName('schedule.xlsx', 'image'), false)
})

test('parseImageSchedule delegates image inference to an injected provider', async () => {
  let called = false
  const provider = {
    provider: 'mock-provider',
    model: 'mock-model',
    isConfigured: () => true,
    async generateJson() {
      called = true
      return {
        courses: [
          {
            name: '机器学习',
            day: '星期二',
            dayIndex: 2,
            slot: '第3-4节',
            startSection: 3,
            endSection: 4,
            time: null,
            location: 'A201',
            teacher: null,
            weeks: '1-16周',
            raw: '机器学习 A201 1-16周',
          },
        ],
        warnings: [],
      }
    },
  }

  const result = await parseImageSchedule(
    Buffer.from('fake-image'),
    'schedule.png',
    provider,
  )

  assert.equal(called, true)
  assert.equal(result.sourceType, 'image')
  assert.equal(result.courses[0]?.day, '周二')
})

test('parseImageSchedule fails explicitly when image AI is not configured', async () => {
  const provider = {
    provider: 'unconfigured',
    model: 'unconfigured',
    isConfigured: () => false,
    async generateJson(): Promise<never> {
      throw new Error('should_not_run')
    },
  }

  await assert.rejects(
    parseImageSchedule(Buffer.from('fake-image'), 'schedule.png', provider),
    /schedule_ai_provider_not_configured/,
  )
})


test('parseSpreadsheetSchedule skips cover sheets and supports merged weekday headers', () => {
  const workbook = XLSX.utils.book_new()
  const cover = XLSX.utils.aoa_to_sheet([
    ['2026 秋季课表'],
    ['姓名', '测试学生'],
  ])
  XLSX.utils.book_append_sheet(workbook, cover, '说明')

  const sheet = XLSX.utils.aoa_to_sheet([
    ['节次', '周一', '', '周二', '', '周三', ''],
    ['', '课程', '地点', '课程', '地点', '课程', '地点'],
    ['第3-4节', '工程热力学', 'A301', '', '', '流体力学', 'B202'],
  ])
  sheet['!merges'] = [
    { s: { r: 0, c: 1 }, e: { r: 0, c: 2 } },
    { s: { r: 0, c: 3 }, e: { r: 0, c: 4 } },
    { s: { r: 0, c: 5 }, e: { r: 0, c: 6 } },
  ]
  XLSX.utils.book_append_sheet(workbook, sheet, '正式课表')

  const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  const result = parseSpreadsheetSchedule(Buffer.from(bytes))

  assert.deepEqual(
    result.courses.map((course) => [
      course.dayIndex,
      course.name,
      course.location,
    ]),
    [
      [1, '工程热力学', 'A301'],
      [3, '流体力学', 'B202'],
    ],
  )
})

test('single-character weekday aliases do not mistake course names for weekday headers', () => {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet([
    ['说明', '高等数学一', '大学物理二'],
    ['节次', '周一', '周二', '周三'],
    ['第1-2节', '线性代数', '', '大学英语'],
  ])
  XLSX.utils.book_append_sheet(workbook, sheet, '课表')

  const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  const result = parseSpreadsheetSchedule(Buffer.from(bytes))

  assert.equal(result.courses.length, 2)
  assert.equal(result.courses[0]?.name, '线性代数')
})

test('editable schedule normalization preserves manual edits and term start date', () => {
  const schedule = normalizeEditableSchedule({
    sourceType: 'spreadsheet',
    courses: [
      {
        name: '工程热力学',
        day: '星期一',
        dayIndex: 1,
        slot: '第1-2节',
        startSection: 1,
        endSection: 2,
        time: null,
        location: 'A301',
        teacher: null,
        weeks: '1-16周',
        raw: '工程热力学',
      },
    ],
    warnings: [],
    termStartDate: '2026-09-07',
    editedAt: '2026-10-05T10:00:00.000Z',
  })

  assert.equal(schedule.courses[0]?.day, '周一')
  assert.equal(schedule.termStartDate, '2026-09-07')
})

test('manual fallback is explicit instead of pretending an image was parsed', () => {
  const fallback = createManualScheduleFallback(
    'image',
    'schedule_ai_provider_not_configured',
  )

  assert.equal(fallback.sourceType, 'image')
  assert.deepEqual(fallback.courses, [])
  assert.match(fallback.warnings[0] ?? '', /手动编辑/)
})
