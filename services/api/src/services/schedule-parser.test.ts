import assert from 'node:assert/strict'
import test from 'node:test'
import * as XLSX from 'xlsx'
import {
  MAX_SCHEDULE_SPREADSHEET_BYTES,
  isOwnedScheduleImportFile,
  isSupportedScheduleFileName,
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
