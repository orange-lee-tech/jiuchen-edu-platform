import { z } from 'zod'
import type { AppEnv } from '../config/env.js'
import type { UserRole } from '../domain/auth-policy.js'

const skuSchema = z.object({
  key: z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{1,63}$/),
  description: z.string().trim().min(1).max(120),
  amountFen: z.number().int().positive(),
  creditAmount: z.number().int().positive(),
}).strict()

export type CreditSku = z.infer<typeof skuSchema>
export type PlannedCreditSku = CreditSku & { planId?: string; planVersion?: number }

export const FIXED_ASSESSMENT_SKUS: readonly CreditSku[] = Object.freeze([
  { key: 'JC000', description: 'AI评估临时支付测试', amountFen: 10, creditAmount: 2 },
  { key: 'JC001', description: 'AI评估体验包', amountFen: 190, creditAmount: 1 },
  { key: 'JC002', description: 'AI评估五次包', amountFen: 890, creditAmount: 5 },
  { key: 'JC003', description: 'AI评估十次包', amountFen: 1690, creditAmount: 10 },
])

// Only AI evaluations may be sold; canonical WeChat payment description.
export const APPROVED_ASSESSMENT_SKUS: readonly CreditSku[] = Object.freeze([
  { key: 'assessment-1', description: '小程序AI评估费用', amountFen: 190, creditAmount: 1 },
  { key: 'assessment-10', description: '小程序AI评估费用', amountFen: 1690, creditAmount: 10 },
])
export const GUEST_FREE_COUNT = 1
export const STUDENT_TOTAL_FREE_COUNT = 5
export type FreeGrant = { version: string; amount: number }

export type CommercialConfig = {
  creditEnforcementEnabled: boolean
  fixedCatalogConfirmed?: boolean
  freeGrant: FreeGrant | null
  studentBonusGrant: FreeGrant | null
  paymentSkus: readonly PlannedCreditSku[]
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

  const enabled = env.CREDIT_ENFORCEMENT_ENABLED ?? false
  const freeGrant = env.CREDIT_FREE_GRANT_VERSION && env.CREDIT_FREE_GRANT_AMOUNT
    ? { version: env.CREDIT_FREE_GRANT_VERSION, amount: env.CREDIT_FREE_GRANT_AMOUNT }
    : null
  const configuredSkus = parsePaymentSkus(env.CREDIT_PAYMENT_SKUS_JSON)

  // Fail closed, before payment initiation, on an unapproved fee/quota.
  if (enabled) {
    if (!freeGrant || freeGrant.amount !== GUEST_FREE_COUNT) {
      throw new Error('approved_guest_free_grant_required')
    }
    if (configuredSkus.length > 0 && ![APPROVED_ASSESSMENT_SKUS, FIXED_ASSESSMENT_SKUS].some((catalog) =>
      configuredSkus.length === catalog.length && catalog.every((sku) => configuredSkus.some((item) =>
        item.key === sku.key &&
        item.description === sku.description &&
        item.amountFen === sku.amountFen &&
        item.creditAmount === sku.creditAmount
      ))
    )) throw new Error('unapproved_assessment_payment_sku')
  }

  return {
    creditEnforcementEnabled: enabled,
    fixedCatalogConfirmed: env.WECHAT_VIRTUAL_PAY_FIXED_CATALOG_CONFIRMED === true,
    freeGrant,
    // Grant one to everyone; upgrading an account to student adds four.
    // Distinct stable versions prevent student upgrades from yielding six credits.
    studentBonusGrant: freeGrant?.amount === GUEST_FREE_COUNT
      ? { version: `${freeGrant.version}:student-bonus`, amount: STUDENT_TOTAL_FREE_COUNT - GUEST_FREE_COUNT }
      : null,
    paymentSkus: enabled ? FIXED_ASSESSMENT_SKUS : [],
  }
}

export function findCreditSku(
  config: CommercialConfig,
  key: string,
): PlannedCreditSku | null {
  return config.paymentSkus.find((sku) => sku.key === key) ?? null
}

export function freeGrantsForRole(config: Pick<CommercialConfig, 'freeGrant' | 'studentBonusGrant'>, role: UserRole): FreeGrant[] {
  if (role !== 'user' && role !== 'student') return []
  return [config.freeGrant, role === 'student' ? config.studentBonusGrant : null]
    .filter((grant): grant is FreeGrant => grant !== null)
}
