import { getSavedAuthResult } from '../../utils/auth'
import {
  createScheduleImport,
  type ParsedSchedule,
} from '../../utils/request'

const MAX_SPREADSHEET_BYTES = 5 * 1024 * 1024
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

function safeName(value: string) {
  return value.replace(/[^0-9A-Za-z._-]/g, '_')
}

function uploadCloudFile(filePath: string, fileName: string): Promise<string> {
  const auth = getSavedAuthResult()
  if (!auth) return Promise.reject(new Error('请先登录'))
  const identity = auth.user.id
  const cloudPath = `schedule-imports/${safeName(identity)}/${Date.now()}-${safeName(fileName)}`

  return new Promise((resolve, reject) => {
    wx.cloud.uploadFile({
      cloudPath,
      filePath,
      success(result) {
        resolve(result.fileID)
      },
      fail(error) {
        reject(new Error(error.errMsg || '文件上传失败'))
      },
    })
  })
}

Page({
  data: {
    parsing: false,
    fileName: '',
    schedule: null as ParsedSchedule | null,
  },

  onChooseSpreadsheet() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['xlsx', 'xls', 'csv'],
      success: (result) => {
        const file = result.tempFiles[0]
        if (!file) return
        void this.uploadAndParse(
          file.path,
          file.name || 'schedule.xlsx',
          'spreadsheet',
          file.size ?? 0,
        )
      },
    })
  },

  onChooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (result) => {
        const file = result.tempFiles[0]
        if (!file) return
        const extension = file.tempFilePath.toLowerCase().includes('.png') ? 'png' : 'jpg'
        void this.uploadAndParse(
          file.tempFilePath,
          `schedule.${extension}`,
          'image',
          file.size ?? 0,
        )
      },
    })
  },

  async uploadAndParse(
    filePath: string,
    fileName: string,
    sourceType: 'spreadsheet' | 'image',
    fileSize = 0,
  ) {
    try {
      const maxBytes = sourceType === 'image' ? MAX_IMAGE_BYTES : MAX_SPREADSHEET_BYTES
      if (fileSize > maxBytes) {
        throw new Error(sourceType === 'image' ? '图片不能超过 5MB' : '课表文件不能超过 5MB')
      }
      this.setData({ parsing: true, fileName, schedule: null })
      const fileID = await uploadCloudFile(filePath, fileName)
      const result = await createScheduleImport({ fileID, fileName, sourceType })
      this.setData({ schedule: result.schedule })
      wx.showToast({ title: `识别到 ${result.schedule.courses.length} 门课程`, icon: 'success' })
    } catch (error) {
      wx.showModal({
        title: '课表解析失败',
        content: error instanceof Error ? error.message : '请检查文件后重试',
        showCancel: false,
      })
    } finally {
      this.setData({ parsing: false })
    }
  },
})
