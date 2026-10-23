import type mysql from 'mysql2/promise'
import type { CommercialConfig } from './commercial-config.js'
import { APPROVED_ASSESSMENT_SKUS } from './commercial-config.js'
import { readControlBox, settingsSchema } from './admin-control-boxes.js'

/** The legacy environment configuration remains the initial policy until a
 * separately migrated and initialized settings box is present. */
export async function loadCommercialConfig(
  pool: mysql.Pool | null, baseline: CommercialConfig,
): Promise<CommercialConfig & { platformPriceConfirmed: boolean; adminSettingsApplied: boolean }> {
  if (!pool) return { ...baseline, platformPriceConfirmed: true, adminSettingsApplied: false }
  let row
  try { row = await readControlBox(pool, 'settings') }
  catch (error) {
    if ((error as { code?: string }).code === 'ER_NO_SUCH_TABLE') {
      return { ...baseline, platformPriceConfirmed: true, adminSettingsApplied: false }
    }
    throw error
  }
  if (!row) return { ...baseline, platformPriceConfirmed: true, adminSettingsApplied: false }
  const raw = typeof row.payload_json === 'string' ? JSON.parse(row.payload_json) : row.payload_json
  const settings = settingsSchema.parse(raw)
  const version = `admin-settings-v${row.version}`
  const guest = settings.guestFree
  const bonus = settings.studentTotalFree - guest
  return {
    creditEnforcementEnabled: baseline.creditEnforcementEnabled,
    freeGrant: guest ? { version, amount: guest } : null,
    studentBonusGrant: bonus ? { version: `${version}:student-bonus`, amount: bonus } : null,
    paymentSkus: baseline.creditEnforcementEnabled
      ? APPROVED_ASSESSMENT_SKUS.map((sku) => ({
        ...sku, amountFen: sku.key === 'assessment-1' ? settings.singleFen : settings.tenFen,
      })) : [],
    platformPriceConfirmed: settings.platformPriceConfirmed,
    adminSettingsApplied: true,
  }
}
