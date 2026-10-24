import type mysql from 'mysql2/promise'
import type { AppEnv } from '../config/env.js'
import { readControlBox, unsealKey } from './admin-control-boxes.js'
import { readActiveAssessmentKey, validateAssessmentApiUrl } from './assessment-key-objects.js'
import { secureAssessmentModelFetch } from './assessment-key-objects.js'
import { createAssessmentAIProvider } from './ai-provider.js'
import { createAssessmentRuntimeFromEnv, type AssessmentRuntime } from './assessment-runtime.js'

export function createVaultAssessmentRuntime(env: AppEnv, pool: mysql.Pool | null) {
  const baseline = createAssessmentRuntimeFromEnv(env)
  let vaultPresent = false
  let vaultUsable = false
  let activeProviderName = baseline.provider.provider
  let activeModel = baseline.provider.model
  const runtime: AssessmentRuntime = {
    retriever: baseline.retriever,
    provider: {
      get provider() { return activeProviderName },
      get model() { return activeModel },
      isConfigured() { return vaultPresent ? vaultUsable : baseline.provider.isConfigured() },
      async analyze(input) {
        const provider = await activeProvider()
        return provider.analyze(input)
      },
      async repair(input) {
        const provider = await activeProvider()
        if (!provider.repair) throw new Error('assessment_repair_not_available')
        return provider.repair(input)
      },
    },
  }
  async function activeProvider() {
    if (!pool) return baseline.provider
    try {
      const active = await readActiveAssessmentKey(pool, env)
      if (active.initialized) {
        if (!active.config) throw new Error('assessment_key_disabled')
        await validateAssessmentApiUrl(active.config.apiBaseUrl ?? '')
        const activeEnv = { ...env,
          ASSESSMENT_AI_PROVIDER: active.config.provider,
          ASSESSMENT_AI_BASE_URL: active.config.apiBaseUrl,
          ASSESSMENT_AI_MODEL: active.config.model,
          ASSESSMENT_AI_TEMPERATURE: active.config.temperature,
          ASSESSMENT_AI_API_KEY: active.config.apiKey,
        }
        return createAssessmentRuntimeFromEnv(activeEnv,
          createAssessmentAIProvider(activeEnv, secureAssessmentModelFetch)).provider
      }
    } catch (error) {
      if ((error as { code?: string }).code !== 'ER_NO_SUCH_TABLE') throw error
    }
    if (!vaultPresent) return baseline.provider
    const row = await readControlBox(pool, 'assessment_key')
    if (!row?.encrypted_secret || !env.ADMIN_AI_KEY_ENCRYPTION_KEY) {
      throw new Error('assessment_key_vault_unavailable')
    }
    const key = unsealKey(row.encrypted_secret, env.ADMIN_AI_KEY_ENCRYPTION_KEY)
    return createAssessmentRuntimeFromEnv({ ...env, ASSESSMENT_AI_API_KEY: key }).provider
  }
  async function refresh() {
    if (!pool) return
    try {
      const active = await readActiveAssessmentKey(pool, env)
      if (active.initialized) {
        vaultPresent = true
        vaultUsable = Boolean(active.config)
        activeProviderName = active.config?.provider ?? baseline.provider.provider
        activeModel = active.config?.model ?? baseline.provider.model
        return
      }
    } catch (error) {
      if ((error as { code?: string }).code !== 'ER_NO_SUCH_TABLE') throw error
    }
    try {
      const row = await readControlBox(pool, 'assessment_key')
      vaultPresent = Boolean(row)
      vaultUsable = Boolean(row?.encrypted_secret && env.ADMIN_AI_KEY_ENCRYPTION_KEY)
    } catch (error) {
      if ((error as { code?: string }).code !== 'ER_NO_SUCH_TABLE') throw error
    }
  }
  return { runtime, refresh }
}
