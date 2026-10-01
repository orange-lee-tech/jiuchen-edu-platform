import tcb from '@cloudbase/node-sdk'
import type { AppEnv } from '../config/env.js'
import {
  maxScheduleUploadBytes,
  type ParsedSchedule,
} from './schedule-parser.js'

export interface ScheduleStorageProvider {
  download(
    fileID: string,
    sourceType: ParsedSchedule['sourceType'],
  ): Promise<Buffer>
  delete(fileID: string): Promise<void>
}

function createCloudBaseApp(env: AppEnv) {
  const credentials =
    env.TENCENTCLOUD_SECRETID && env.TENCENTCLOUD_SECRETKEY
      ? {
          secretId: env.TENCENTCLOUD_SECRETID,
          secretKey: env.TENCENTCLOUD_SECRETKEY,
        }
      : env.CLOUDBASE_APIKEY
        ? { accessKey: env.CLOUDBASE_APIKEY }
        : {}

  return tcb.init({
    env: env.CLOUDBASE_ENV_ID ?? tcb.SYMBOL_CURRENT_ENV,
    ...credentials,
    timeout: 60_000,
  })
}

export class CloudBaseScheduleStorageProvider
  implements ScheduleStorageProvider
{
  constructor(private readonly env: AppEnv) {}

  async download(
    fileID: string,
    sourceType: ParsedSchedule['sourceType'],
  ) {
    const app = createCloudBaseApp(this.env)
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

  async delete(fileID: string) {
    const app = createCloudBaseApp(this.env)
    const result = await app.deleteFile({ fileList: [fileID] })
    const item = result.fileList?.[0]
    if (item?.code && item.code !== 'SUCCESS') {
      throw new Error('schedule_file_cleanup_failed')
    }
  }
}

export function createScheduleStorageProvider(env: AppEnv) {
  return new CloudBaseScheduleStorageProvider(env)
}
