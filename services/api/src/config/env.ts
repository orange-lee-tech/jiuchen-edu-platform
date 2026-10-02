import { z } from 'zod'

const optionalNonEmptyString = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().min(1).optional(),
)

const optionalPort = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.coerce.number().int().min(1).max(65535).optional(),
)

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
  CLOUDBASE_ENV_ID: optionalNonEmptyString,
  CLOUDBASE_APIKEY: optionalNonEmptyString,
  TENCENTCLOUD_SECRETID: optionalNonEmptyString,
  TENCENTCLOUD_SECRETKEY: optionalNonEmptyString,
  ASSESSMENT_AI_PROVIDER: optionalNonEmptyString,
  ASSESSMENT_AI_BASE_URL: optionalNonEmptyString,
  ASSESSMENT_AI_API_KEY: optionalNonEmptyString,
  ASSESSMENT_AI_MODEL: optionalNonEmptyString,
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
