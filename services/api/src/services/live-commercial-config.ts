import type mysql from 'mysql2/promise'
import type { AppEnv } from '../config/env.js'
import type { CommercialConfig } from './commercial-config.js'
import { FIXED_ASSESSMENT_SKUS } from './commercial-config.js'
import { readControlBox, settingsSchema } from './admin-control-boxes.js'
import { readActiveCreditPlan } from './credit-plans.js'

/** The legacy environment configuration remains the initial policy until a
 * separately migrated and initialized settings box is present. */
export async function loadCommercialConfig(
  pool: mysql.Pool | null, baseline: CommercialConfig, env: AppEnv,
): Promise<CommercialConfig & { platformPriceConfirmed: boolean; adminSettingsApplied: boolean }> {
  if (!pool) return { ...baseline, platformPriceConfirmed: baseline.fixedCatalogConfirmed === true, adminSettingsApplied: false }
  let activePlan: Awaited<ReturnType<typeof readActiveCreditPlan>> | null = null
  try { activePlan = await readActiveCreditPlan(pool, env) }
  catch (error) {
    if ((error as { code?: string }).code !== 'ER_NO_SUCH_TABLE') throw error
  }
  let row
  try { row = await readControlBox(pool, 'settings') }
  catch (error) {
    if ((error as { code?: string }).code === 'ER_NO_SUCH_TABLE') {
      return activePlan?.initialized ? { ...baseline,
        paymentSkus: activePlan.skus,
        platformPriceConfirmed: baseline.fixedCatalogConfirmed === true,
        adminSettingsApplied: false } :
        { ...baseline, platformPriceConfirmed: baseline.fixedCatalogConfirmed === true, adminSettingsApplied: false }
    }
    throw error
  }
  if (!row && !activePlan?.initialized) return { ...baseline, platformPriceConfirmed: baseline.fixedCatalogConfirmed === true, adminSettingsApplied: false }
  if (!row) return { ...baseline,
    paymentSkus: activePlan!.skus,
    platformPriceConfirmed: baseline.fixedCatalogConfirmed === true,
    adminSettingsApplied: false }
  const raw = typeof row.payload_json === 'string' ? JSON.parse(row.payload_json) : row.payload_json
  const settings = settingsSchema.parse(raw)
  const version = `admin-settings-v${row.version}`
  const guest = settings.guestFree
  const bonus = settings.studentTotalFree - guest
  return {
    creditEnforcementEnabled: baseline.creditEnforcementEnabled,
    fixedCatalogConfirmed: baseline.fixedCatalogConfirmed,
    freeGrant: guest ? { version, amount: guest } : null,
    studentBonusGrant: bonus ? { version: `${version}:student-bonus`, amount: bonus } : null,
    paymentSkus: activePlan?.initialized ? activePlan.skus :
      baseline.creditEnforcementEnabled
      ? FIXED_ASSESSMENT_SKUS : [],
    platformPriceConfirmed: baseline.fixedCatalogConfirmed === true,
    adminSettingsApplied: true,
  }
}
