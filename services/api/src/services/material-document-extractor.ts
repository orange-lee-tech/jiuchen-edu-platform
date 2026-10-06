import {
  createHash,
  createHmac,
} from 'node:crypto'
import { inflateRawSync } from 'node:zlib'
import tcb from '@cloudbase/node-sdk'
import type { AppEnv } from '../config/env.js'

const TENCENT_OCR_HOST = 'ocr.tencentcloudapi.com'
const TENCENT_OCR_SERVICE = 'ocr'
const TENCENT_OCR_VERSION = '2018-11-19'
const TENCENT_OCR_ACTION = 'MultimodalDocParse'
const TENCENT_OCR_ENDPOINT = 'https://' + TENCENT_OCR_HOST
const MAX_RESULT_ARCHIVE_BYTES = 6 * 1024 * 1024
const DEFAULT_MAX_PAGES = 20

export type MaterialDocumentKind = 'document' | 'image'

export type MaterialExtractRequest = {
  fileID: string
  fileName: string
  kind: MaterialDocumentKind
  maxPages?: number
  maxBytes?: number
}

export type MaterialExtractResult = {
  text: string
  parser: 'tencent-multimodal-doc-parse'
  warnings: string[]
}

export interface MaterialDocumentExtractor {
  readonly configured: boolean
  extract(input: MaterialExtractRequest): Promise<MaterialExtractResult>
  cleanup(fileID: string): Promise<void>
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

function sha256Hex(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function hmac(
  key: string | Buffer,
  value: string,
): Buffer {
  return createHmac('sha256', key).update(value).digest()
}

function utcDate(timestampSeconds: number) {
  return new Date(timestampSeconds * 1000).toISOString().slice(0, 10)
}

function tencentAuthorization(input: {
  secretId: string
  secretKey: string
  payload: string
  timestamp: number
}) {
  const algorithm = 'TC3-HMAC-SHA256'
  const date = utcDate(input.timestamp)
  const canonicalHeaders =
    'content-type:application/json; charset=utf-8\n' +
    'host:' + TENCENT_OCR_HOST + '\n'
  const signedHeaders = 'content-type;host'
  const canonicalRequest = [
    'POST',
    '/',
    '',
    canonicalHeaders,
    signedHeaders,
    sha256Hex(input.payload),
  ].join('\n')
  const credentialScope =
    date + '/' + TENCENT_OCR_SERVICE + '/tc3_request'
  const stringToSign = [
    algorithm,
    String(input.timestamp),
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n')

  const secretDate = hmac('TC3' + input.secretKey, date)
  const secretService = hmac(secretDate, TENCENT_OCR_SERVICE)
  const secretSigning = hmac(secretService, 'tc3_request')
  const signature = createHmac('sha256', secretSigning)
    .update(stringToSign)
    .digest('hex')

  return (
    algorithm +
    ' Credential=' +
    input.secretId +
    '/' +
    credentialScope +
    ', SignedHeaders=' +
    signedHeaders +
    ', Signature=' +
    signature
  )
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('material_document_parser_timeout')
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

function tencentFileType(fileName: string) {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.pdf')) return 1
  if (lower.endsWith('.doc') || lower.endsWith('.docx')) return 2
  if (
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.png') ||
    lower.endsWith('.webp')
  ) {
    return 7
  }
  return 0
}

type TencentOcrResponse = {
  Response?: {
    ResultUrl?: string
    RequestId?: string
    Error?: {
      Code?: string
      Message?: string
    }
  }
}

async function requestTencentDocumentParse(
  env: AppEnv,
  fileUrl: string,
  fileName: string,
  maxPages: number,
) {
  if (!env.TENCENTCLOUD_SECRETID || !env.TENCENTCLOUD_SECRETKEY) {
    throw new Error('material_document_parser_not_configured')
  }

  const fileType = tencentFileType(fileName)
  if (!fileType) {
    throw new Error('material_document_type_not_supported')
  }

  const body: Record<string, unknown> = {
    FileUrl: fileUrl,
    FileType: fileType,
    ResultType: 2,
    EnableSubImg: false,
    TaskType: 0,
  }
  if (fileType === 1 || fileType === 2) {
    body.PageRange = '1-' + String(maxPages)
  }

  const payload = JSON.stringify(body)
  const timestamp = Math.floor(Date.now() / 1000)
  const authorization = tencentAuthorization({
    secretId: env.TENCENTCLOUD_SECRETID,
    secretKey: env.TENCENTCLOUD_SECRETKEY,
    payload,
    timestamp,
  })

  const response = await fetchWithTimeout(
    TENCENT_OCR_ENDPOINT,
    {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json; charset=utf-8',
        Host: TENCENT_OCR_HOST,
        'X-TC-Action': TENCENT_OCR_ACTION,
        'X-TC-Timestamp': String(timestamp),
        'X-TC-Version': TENCENT_OCR_VERSION,
      },
      body: payload,
    },
    60_000,
  )

  const raw = (await response.json()) as TencentOcrResponse
  const apiError = raw.Response?.Error
  if (!response.ok || apiError) {
    const code = apiError?.Code || 'http_' + String(response.status)
    if (code === 'FailedOperation.UnOpenError') {
      throw new Error('material_document_parser_not_enabled')
    }
    if (code === 'FailedOperation.DownLoadError') {
      throw new Error('material_document_source_download_failed')
    }
    if (code === 'LimitExceeded.TooLargeFileError') {
      throw new Error('material_document_file_too_large')
    }
    if (
      code === 'ResourceUnavailable.InArrears' ||
      code === 'ResourceUnavailable.ResourcePackageRunOut' ||
      code === 'ResourcesSoldOut.ChargeStatusException'
    ) {
      throw new Error('material_document_parser_billing_unavailable')
    }
    throw new Error('material_document_parser_failed:' + code)
  }

  const resultUrl = raw.Response?.ResultUrl
  if (!resultUrl) {
    throw new Error('material_document_result_missing')
  }
  return resultUrl
}

function findEndOfCentralDirectory(buffer: Buffer) {
  const signature = 0x06054b50
  const start = Math.max(0, buffer.length - 65_557)
  for (let offset = buffer.length - 22; offset >= start; offset -= 1) {
    if (buffer.readUInt32LE(offset) === signature) return offset
  }
  throw new Error('material_document_result_invalid')
}

function readZipTextEntry(buffer: Buffer) {
  const eocd = findEndOfCentralDirectory(buffer)
  const entryCount = buffer.readUInt16LE(eocd + 10)
  let offset = buffer.readUInt32LE(eocd + 16)
  let markdown: Buffer | null = null
  let json: Buffer | null = null

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error('material_document_result_invalid')
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const uncompressedSize = buffer.readUInt32LE(offset + 24)
    const fileNameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localHeaderOffset = buffer.readUInt32LE(offset + 42)
    const name = buffer
      .subarray(offset + 46, offset + 46 + fileNameLength)
      .toString('utf8')

    const wanted =
      !name.endsWith('/') &&
      (name.toLowerCase().endsWith('.md') ||
        name.toLowerCase().endsWith('.json'))

    if (wanted) {
      if (uncompressedSize > 3 * 1024 * 1024) {
        throw new Error('material_document_result_too_large')
      }
      if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
        throw new Error('material_document_result_invalid')
      }
      const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26)
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28)
      const dataOffset =
        localHeaderOffset + 30 + localNameLength + localExtraLength
      const compressed = buffer.subarray(
        dataOffset,
        dataOffset + compressedSize,
      )
      const value =
        compressionMethod === 0
          ? Buffer.from(compressed)
          : compressionMethod === 8
            ? inflateRawSync(compressed)
            : null

      if (!value) {
        throw new Error('material_document_result_compression_unsupported')
      }

      if (name.toLowerCase().endsWith('.md') && !markdown) {
        markdown = value
      } else if (name.toLowerCase().endsWith('.json') && !json) {
        json = value
      }
    }

    offset += 46 + fileNameLength + extraLength + commentLength
  }

  const selected = markdown ?? json
  if (!selected) {
    throw new Error('material_document_result_text_missing')
  }

  const text = selected.toString('utf8').trim()
  if (!text) {
    throw new Error('material_document_result_text_empty')
  }
  return text
}

async function downloadResultText(resultUrl: string) {
  const response = await fetchWithTimeout(
    resultUrl,
    { method: 'GET' },
    30_000,
  )
  if (!response.ok) {
    throw new Error('material_document_result_download_failed')
  }

  const contentLength = Number(response.headers.get('content-length') || 0)
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_RESULT_ARCHIVE_BYTES
  ) {
    throw new Error('material_document_result_too_large')
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.byteLength > MAX_RESULT_ARCHIVE_BYTES) {
    throw new Error('material_document_result_too_large')
  }

  return readZipTextEntry(buffer)
}

async function assertRemoteSizeWithinLimit(
  fileUrl: string,
  maxBytes?: number,
) {
  if (!maxBytes) return

  try {
    const response = await fetchWithTimeout(
      fileUrl,
      { method: 'HEAD' },
      5_000,
    )
    if (!response.ok) return
    const contentLength = Number(response.headers.get('content-length') || 0)
    if (
      Number.isFinite(contentLength) &&
      contentLength > 0 &&
      contentLength > maxBytes
    ) {
      throw new Error('material_document_file_too_large')
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'material_document_file_too_large'
    ) {
      throw error
    }
    // Some private CDN links do not support HEAD. In that case the provider
    // still enforces its own file limits without loading the source into ECS.
  }
}

async function temporaryFileUrl(
  env: AppEnv,
  fileID: string,
) {
  const app = createCloudBaseApp(env)
  const result = await app.getTempFileURL({
    fileList: [{ fileID, maxAge: 600 }],
  })

  const record = result as {
    fileList?: Array<{
      code?: string
      tempFileURL?: string
    }>
  }
  const item = record.fileList?.[0]
  if (!item?.tempFileURL || (item.code && item.code !== 'SUCCESS')) {
    throw new Error('material_document_temp_url_failed')
  }
  return item.tempFileURL
}

export function createTencentMaterialDocumentExtractor(
  env: AppEnv,
): MaterialDocumentExtractor {
  const configured = Boolean(
    env.CLOUDBASE_ENV_ID &&
      env.TENCENTCLOUD_SECRETID &&
      env.TENCENTCLOUD_SECRETKEY,
  )

  return {
    configured,

    async extract(input) {
      if (!configured) {
        throw new Error('material_document_parser_not_configured')
      }

      const fileUrl = await temporaryFileUrl(env, input.fileID)
      await assertRemoteSizeWithinLimit(fileUrl, input.maxBytes)
      const maxPages = Math.min(
        Math.max(input.maxPages ?? DEFAULT_MAX_PAGES, 1),
        DEFAULT_MAX_PAGES,
      )
      const resultUrl = await requestTencentDocumentParse(
        env,
        fileUrl,
        input.fileName,
        maxPages,
      )
      const text = await downloadResultText(resultUrl)
      const warnings =
        input.kind === 'document'
          ? [
              '为控制解析成本与资源占用，文档最多读取前 ' +
                String(maxPages) +
                ' 页；请在预填后人工确认关键字段。',
            ]
          : ['图片文字由腾讯云文档解析识别；请在预填后人工确认关键字段。']

      return {
        text,
        parser: 'tencent-multimodal-doc-parse',
        warnings,
      }
    },

    async cleanup(fileID) {
      const app = createCloudBaseApp(env)
      const result = await app.deleteFile({ fileList: [fileID] })
      const item = result.fileList?.[0]
      if (item?.code && item.code !== 'SUCCESS') {
        throw new Error('material_document_source_cleanup_failed')
      }
    },
  }
}

export function createUnconfiguredMaterialDocumentExtractor(): MaterialDocumentExtractor {
  return {
    configured: false,
    async extract() {
      throw new Error('material_document_parser_not_configured')
    },
    async cleanup() {},
  }
}
