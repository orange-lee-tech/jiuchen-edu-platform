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
})

export type AppEnv = z.infer<typeof envSchema>

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  return envSchema.parse(source)
}
