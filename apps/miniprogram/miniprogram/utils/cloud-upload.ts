import { getSavedAuthResult } from './auth'

function safeSegment(value: string) {
  return value.replace(/[^0-9A-Za-z._-]/g, '_')
}

export function uploadAuthenticatedCloudFile(input: {
  namespace: 'schedule-imports' | 'assessment-imports'
  filePath: string
  fileName: string
}): Promise<string> {
  const auth = getSavedAuthResult()
  if (!auth) return Promise.reject(new Error('请先登录'))

  const cloudPath =
    input.namespace +
    '/' +
    safeSegment(auth.user.id) +
    '/' +
    String(Date.now()) +
    '-' +
    safeSegment(input.fileName)

  return new Promise((resolve, reject) => {
    wx.cloud.uploadFile({
      cloudPath,
      filePath: input.filePath,
      success(result) {
        resolve(result.fileID)
      },
      fail(error) {
        reject(new Error(error.errMsg || '文件上传失败'))
      },
    })
  })
}
