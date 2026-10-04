import { z } from 'zod'
import type { AppEnv } from '../config/env.js'

const skuSchema = z.object({
  key: z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{1,63}$/),
  description: z.string().trim().min(1).max(120),
  amountFen: z.number().int().positive(),
  creditAmount: z.number().int().positive(),
}).strict()

export type CreditSku = z.infer<typeof skuSchema>

export type CommercialConfig = {
  creditEnforcementEnabled: boolean
  freeGrant: {
    version: string
    amount: number
  } | null
  paymentSkus: readonly CreditSku[]
}

function parsePaymentSkus(raw: string | undefined): CreditSku[] {
  if (!raw) return []

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(raw)
  } catch {
    throw new Error('invalid_credit_payment_skus_json')
  }

  const parsed = z.array(skuSchema).max(50).safeParse(parsedJson)
  if (!parsed.success) {
    throw new Error('invalid_credit_payment_skus_json')
  }

  const seen = new Set<string>()
  for (const sku of parsed.data) {
    if (seen.has(sku.key)) throw new Error('duplicate_credit_payment_sku_key')
    seen.add(sku.key)
  }

  return parsed.data
}

export function createCommercialConfig(env: AppEnv): CommercialConfig {
  const hasGrantVersion = Boolean(env.CREDIT_FREE_GRANT_VERSION)
  const hasGrantAmount = typeof env.CREDIT_FREE_GRANT_AMOUNT === 'number'

  if (hasGrantVersion !== hasGrantAmount) {
    throw new Error('incomplete_credit_free_grant_config')
  }

  return {
    creditEnforcementEnabled: env.CREDIT_ENFORCEMENT_ENABLED ?? false,
    freeGrant:
      env.CREDIT_FREE_GRANT_VERSION && env.CREDIT_FREE_GRANT_AMOUNT
        ? {
            version: env.CREDIT_FREE_GRANT_VERSION,
            amount: env.CREDIT_FREE_GRANT_AMOUNT,
          }
        : null,
    paymentSkus: parsePaymentSkus(env.CREDIT_PAYMENT_SKUS_JSON),
  }
}

export function findCreditSku(
  config: CommercialConfig,
  key: string,
): CreditSku | null {
  return config.paymentSkus.find((sku) => sku.key === key) ?? null
}
