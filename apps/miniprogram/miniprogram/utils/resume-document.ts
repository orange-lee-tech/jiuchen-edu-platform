import { runtimeConfig } from '../config/runtime'
import { clearApiSessionToken, getApiSessionToken } from './session'

export type ResumeDocumentTarget = 'general' | 'technical' | 'academic'

function requestResumeBuffer(target: ResumeDocumentTarget): Promise<ArrayBuffer> {
  if (runtimeConfig.apiTransport === 'cloudrun') {
    return Promise.reject(
      new Error('CloudRun 调试传输暂不支持文档下载，请使用 ECS 测试链路'),
    )
  }

  const sessionToken = getApiSessionToken()
  if (!sessionToken) {
    return Promise.reject(new Error('登录已失效，请重新登录'))
  }

  const url =
    `${runtimeConfig.apiBaseUrl}/me/resume-artifacts/docx?target=${encodeURIComponent(target)}`

  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: 'GET',
      responseType: 'arraybuffer',
      header: {
        Authorization: `Bearer ${sessionToken}`,
      },
      success(response) {
        if (sessionToken !== getApiSessionToken()) {
          reject(new Error('登录账号已变化，请重新打开简历'))
          return
        }
        if (
          response.statusCode >= 200 &&
          response.statusCode < 300 &&
          response.data instanceof ArrayBuffer
        ) {
          resolve(response.data)
          return
        }

        if (response.statusCode === 401) {
          clearApiSessionToken(sessionToken)
          reject(new Error('登录已失效，请重新登录'))
          return
        }

        reject(new Error('简历文件生成失败，请稍后重试'))
      },
      fail(error) {
        reject(new Error(error.errMsg || '简历文件下载失败，请检查网络'))
      },
    })
  })
}

function writeResumeFile(
  target: ResumeDocumentTarget,
  buffer: ArrayBuffer,
): Promise<string> {
  const path = `${wx.env.USER_DATA_PATH}/jiuchen-resume-${target}.docx`
  const fileSystem = wx.getFileSystemManager()

  return new Promise((resolve, reject) => {
    fileSystem.writeFile({
      filePath: path,
      data: buffer,
      success() {
        resolve(path)
      },
      fail(error) {
        reject(new Error(error.errMsg || '简历文件写入失败'))
      },
    })
  })
}

function openDocument(path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    wx.openDocument({
      filePath: path,
      fileType: 'docx',
      showMenu: true,
      success() {
        resolve()
      },
      fail(error) {
        reject(new Error(error.errMsg || '无法打开 DOCX 文件'))
      },
    })
  })
}

export async function openResumeDocx(target: ResumeDocumentTarget) {
  const buffer = await requestResumeBuffer(target)
  const path = await writeResumeFile(target, buffer)
  await openDocument(path)
}
