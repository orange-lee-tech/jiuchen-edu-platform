export const ASSESSMENT_CREDIT_COST = 1
export const CREDIT_POLICY_VERSION = 'credit-policy-v1'

export type AssessmentChargeOutcome =
  | 'consume'
  | 'release'
  | 'keep_held'

export function assessmentChargeOutcome(input: {
  runtimeSucceeded: boolean
  resultPersisted: boolean
  terminalFailure: boolean
}): AssessmentChargeOutcome {
  if (input.runtimeSucceeded && input.resultPersisted) return 'consume'
  if (input.terminalFailure) return 'release'
  return 'keep_held'
}

export function freeGrantIdempotencyKey(
  userId: string,
  grantVersion: string,
) {
  return `free-assessment:${grantVersion}:${userId}`
}

export function assessmentDebitIdempotencyKey(assessmentId: string) {
  return `assessment-debit:${assessmentId}`
}

export function paymentGrantIdempotencyKey(outTradeNo: string) {
  return `payment-grant:${outTradeNo}`
}

export function validateCreditAmount(value: number) {
  return Number.isInteger(value) && value > 0
}

export function validateAmountFen(value: number) {
  return Number.isInteger(value) && value > 0
}
