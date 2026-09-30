import assert from 'node:assert/strict'
import test from 'node:test'
import * as XLSX from 'xlsx'
import {
  MAX_SCHEDULE_SPREADSHEET_BYTES,
  isOwnedScheduleImportFile,
  isSupportedScheduleFileName,
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
