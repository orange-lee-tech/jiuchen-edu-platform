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
  let selectedProvider: typeof baseline.provider | null = null
  let selectedSource: ReturnType<NonNullable<AssessmentRuntime['diagnostics']>> = {
    source: 'environment', objectId: null, version: null,
    provider: activeProviderName, model: activeModel,
  }
  const runtime: AssessmentRuntime = {
    retriever: baseline.retriever,
    diagnostics: () => ({ ...selectedSource }),
    provider: {
      get provider() { return activeProviderName },
      get model() { return activeModel },
      isConfigured() { return vaultPresent ? vaultUsable : baseline.provider.isConfigured() },
      async prepare() { selectedProvider = await activeProvider() },
      async analyze(input) {
        const provider = selectedProvider ?? await activeProvider()
        selectedProvider = provider
        return provider.analyze(input)
      },
      async repair(input) {
        const provider = selectedProvider ?? await activeProvider()
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
        if (!active.config) {
          selectedSource = { source: 'disabled', objectId: null, version: active.version,
            provider: null, model: null }
          throw new Error('assessment_key_disabled')
        }
        selectedSource = { source: 'admin_vault', objectId: active.objectId,
          version: active.version, provider: active.config.provider ?? null,
          model: active.config.model ?? null }
        activeProviderName = active.config.provider ?? baseline.provider.provider
        activeModel = active.config.model ?? baseline.provider.model
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
    if (!vaultPresent) {
      selectedSource = { source: 'environment', objectId: null, version: null,
        provider: baseline.provider.provider, model: baseline.provider.model }
      return baseline.provider
    }
    const row = await readControlBox(pool, 'assessment_key')
    if (!row?.encrypted_secret || !env.ADMIN_AI_KEY_ENCRYPTION_KEY) {
      throw new Error('assessment_key_vault_unavailable')
    }
    const key = unsealKey(row.encrypted_secret, env.ADMIN_AI_KEY_ENCRYPTION_KEY)
    selectedSource = { source: 'legacy_control', objectId: null, version: null,
      provider: baseline.provider.provider, model: baseline.provider.model }
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
        selectedSource = active.config ? {
          source: 'admin_vault', objectId: active.objectId, version: active.version,
          provider: active.config.provider ?? null, model: active.config.model ?? null,
        } : { source: 'disabled', objectId: null, version: active.version,
          provider: null, model: null }
        return
      }
    } catch (error) {
      if ((error as { code?: string }).code !== 'ER_NO_SUCH_TABLE') throw error
    }
    try {
      const row = await readControlBox(pool, 'assessment_key')
      vaultPresent = Boolean(row)
      vaultUsable = Boolean(row?.encrypted_secret && env.ADMIN_AI_KEY_ENCRYPTION_KEY)
      selectedSource = row ? { source: 'legacy_control', objectId: null, version: null,
        provider: baseline.provider.provider, model: baseline.provider.model } :
        { source: 'environment', objectId: null, version: null,
          provider: baseline.provider.provider, model: baseline.provider.model }
    } catch (error) {
      if ((error as { code?: string }).code !== 'ER_NO_SUCH_TABLE') throw error
    }
  }
  return { runtime, refresh }
}
