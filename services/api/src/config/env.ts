import { z } from 'zod'

const optionalNonEmptyString = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().min(1).optional(),
)

const optionalPort = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.coerce.number().int().min(1).max(65535).optional(),
)

const optionalNumber = (min: number, max: number) =>
  z.preprocess(
    (value) =>
      typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.coerce.number().min(min).max(max).optional(),
  )

const optionalPositiveInteger = z.preprocess(
  (value) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.coerce.number().int().positive().optional(),
)

const optionalBoolean = z.preprocess((value) => {
  if (typeof value !== 'string') return value
  const normalized = value.trim().toLowerCase()
  if (!normalized) return undefined
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return value
}, z.boolean().optional())

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: optionalNonEmptyString,
  DB_HOST: optionalNonEmptyString,
  DB_PORT: optionalPort,
  DB_USER: optionalNonEmptyString,
  DB_PASSWORD: optionalNonEmptyString,
  DB_NAME: optionalNonEmptyString,
  WECHAT_APP_ID: optionalNonEmptyString,
  WECHAT_APP_SECRET: optionalNonEmptyString,
  WECHAT_OA_APP_ID: optionalNonEmptyString,
  WECHAT_OA_APP_SECRET: optionalNonEmptyString,
  NEWS_V2_ENABLED: optionalBoolean,
  WECHAT_PAY_MCH_ID: optionalNonEmptyString,
  WECHAT_PAY_API_V3_KEY: optionalNonEmptyString,
  WECHAT_PAY_MERCHANT_SERIAL_NO: optionalNonEmptyString,
  WECHAT_PAY_PRIVATE_KEY_PEM: optionalNonEmptyString,
  WECHAT_PAY_PLATFORM_SERIAL_NO: optionalNonEmptyString,
  WECHAT_PAY_PLATFORM_CERT_PEM: optionalNonEmptyString,
  WECHAT_PAY_NOTIFY_URL: optionalNonEmptyString,
  WECHAT_VIRTUAL_PAY_ENABLED: optionalBoolean,
  WECHAT_VIRTUAL_PAY_PRODUCTION_APPROVED: optionalBoolean,
  WECHAT_VIRTUAL_PAY_APP_KEY: optionalNonEmptyString,
  WECHAT_VIRTUAL_PAY_OFFER_ID: optionalNonEmptyString,
  WECHAT_VIRTUAL_PAY_PRODUCT_ONE: optionalNonEmptyString,
  WECHAT_VIRTUAL_PAY_PRODUCT_FIVE: optionalNonEmptyString,
  WECHAT_VIRTUAL_PAY_PRODUCT_TEN: optionalNonEmptyString,
  WECHAT_VIRTUAL_PAY_PRODUCT_TEST: optionalNonEmptyString,
  WECHAT_VIRTUAL_PAY_TEST_SKU_ENABLED: optionalBoolean,
  WECHAT_VIRTUAL_PAY_TEST_USER_IDS: optionalNonEmptyString,
  WECHAT_VIRTUAL_PAY_FIXED_CATALOG_CONFIRMED: optionalBoolean,
  WECHAT_VIRTUAL_PAY_ENV: z.enum(['sandbox','production']).optional(),
  CLOUDBASE_ENV_ID: optionalNonEmptyString,
  CLOUDBASE_APIKEY: optionalNonEmptyString,
  TENCENTCLOUD_SECRETID: optionalNonEmptyString,
  TENCENTCLOUD_SECRETKEY: optionalNonEmptyString,
  CREDIT_ENFORCEMENT_ENABLED: optionalBoolean,
  CREDIT_FREE_GRANT_VERSION: optionalNonEmptyString,
  CREDIT_FREE_GRANT_AMOUNT: optionalPositiveInteger,
  CREDIT_PAYMENT_SKUS_JSON: optionalNonEmptyString,
  AI_SUPPLIER_BALANCE_FEN: optionalPositiveInteger,
  AI_SUPPLIER_BALANCE_OBSERVED_AT: optionalNonEmptyString,
  AI_COST_ESTIMATE_FEN_PER_RUN: optionalPositiveInteger,
  AI_SUPPLIER_ALERT_DAYS: optionalNumber(1,90),
  ADMIN_AI_KEY_ENCRYPTION_KEY: optionalNonEmptyString,
  ASSESSMENT_AI_PROVIDER: optionalNonEmptyString,
  ASSESSMENT_AI_BASE_URL: optionalNonEmptyString,
  ASSESSMENT_AI_API_KEY: optionalNonEmptyString,
  ASSESSMENT_AI_MODEL: optionalNonEmptyString,
  ASSESSMENT_AI_TEMPERATURE: optionalNumber(0, 2),
  ASSESSMENT_AI_JSON_MODE: optionalBoolean,
  ASSESSMENT_AI_RESPONSE_FORMAT: z.enum(['json_object', 'json_schema']).optional(),
  ASSESSMENT_AI_EXTRA_BODY_JSON: optionalNonEmptyString,
  ASSESSMENT_CASE_DATA_ROOT: optionalNonEmptyString,
  SCHEDULE_AI_PROVIDER: optionalNonEmptyString,
  SCHEDULE_AI_BASE_URL: optionalNonEmptyString,
  SCHEDULE_AI_API_KEY: optionalNonEmptyString,
  SCHEDULE_AI_MODEL: optionalNonEmptyString,
  CUSTOMER_AI_PROVIDER: optionalNonEmptyString,
  CUSTOMER_AI_BASE_URL: optionalNonEmptyString,
  CUSTOMER_AI_API_KEY: optionalNonEmptyString,
  CUSTOMER_AI_MODEL: optionalNonEmptyString,
})

export type AppEnv = z.infer<typeof envSchema>

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  return envSchema.parse(source)
}
