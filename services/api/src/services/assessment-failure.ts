import { ZodError } from 'zod'
import { ControlError } from './admin-control-boxes.js'
import {
  JsonModelProviderHttpError,
  JsonModelProviderInvalidJsonError,
  JsonModelProviderTimeoutError,
  JsonModelProviderTruncatedError,
} from './ai-provider.js'

export type AssessmentFailureCategory =
  | 'authentication' | 'model_unavailable' | 'quota_limited'
  | 'connection' | 'timeout' | 'invalid_json' | 'invalid_schema'
  | 'truncated' | 'internal'

const transportCodes = new Set([
  'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH',
  'ENETUNREACH', 'ETIMEDOUT', 'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'DEPTH_ZERO_SELF_SIGNED_CERT', 'ERR_TLS_CERT_ALTNAME_INVALID',
  'ERR_INVALID_IP_ADDRESS',
])

export function classifyAssessmentFailure(error: unknown): {
  category: AssessmentFailureCategory; reachable: boolean; httpStatus: number | null
} {
  if (error instanceof ControlError &&
      ['assessment_api_dns_failed', 'assessment_api_url_forbidden',
        'assessment_api_url_invalid'].includes(error.code)) {
    return { category: 'connection', reachable: false, httpStatus: null }
  }
  if (error instanceof JsonModelProviderHttpError) {
    const code = error.providerCode
    const category: AssessmentFailureCategory =
      error.status === 401 || error.status === 403 ? 'authentication' :
      error.status === 429 || error.status === 402 ? 'quota_limited' :
      ['model_not_found', 'model_not_exist', 'invalid_model', 'model_unavailable'].includes(code ?? '')
        ? 'model_unavailable' :
      error.status === 404 ? 'connection' : 'internal'
    return { category, reachable: true, httpStatus: error.status }
  }
  if (error instanceof JsonModelProviderTimeoutError) {
    return { category: 'timeout', reachable: false, httpStatus: null }
  }
  if (error instanceof JsonModelProviderTruncatedError) {
    return { category: 'truncated', reachable: true, httpStatus: null }
  }
  if (error instanceof JsonModelProviderInvalidJsonError) {
    return { category: 'invalid_json', reachable: true, httpStatus: null }
  }
  if (error instanceof ZodError) {
    return { category: 'invalid_schema', reachable: true, httpStatus: null }
  }
  const cause = error instanceof Error ? (error as Error & { cause?: unknown }).cause : null
  const code = (cause && typeof cause === 'object' && 'code' in cause) ? cause.code :
    (error && typeof error === 'object' && 'code' in error) ? error.code : null
  if (typeof code === 'string' && transportCodes.has(code)) {
    return { category: code === 'ETIMEDOUT' ? 'timeout' : 'connection', reachable: false, httpStatus: null }
  }
  return { category: 'internal', reachable: false, httpStatus: null }
}
