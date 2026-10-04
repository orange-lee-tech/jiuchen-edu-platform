import {
  getSavedAuthResult,
  type BootstrapResult,
} from './auth'
import type { GrowthProfileBootstrap } from './request'

const PREFIX = 'jiuchen-growth-profile-bootstrap'
const VERSION = 1
const FRESH_MS = 2 * 60 * 1000
const MAX_STALE_MS = 24 * 60 * 60 * 1000

type CacheEnvelope = {
  version: number
  savedAt: number
  data: GrowthProfileBootstrap
}

let memory: CacheEnvelope | null = null

function cacheIdentity(auth: BootstrapResult | null) {
  if (!auth) return 'anonymous'
  return auth.businessIdentity?.businessId || auth.user.id
}

function key() {
  return `${PREFIX}:v${VERSION}:${cacheIdentity(getSavedAuthResult())}`
}

function getStorage<T>(storageKey: string): Promise<T | null> {
  return new Promise((resolve) => {
    wx.getStorage({
      key: storageKey,
      success(result) {
        resolve((result.data ?? null) as T | null)
      },
      fail() {
        resolve(null)
      },
    })
  })
}

function setStorage(storageKey: string, data: unknown): Promise<void> {
  return new Promise((resolve) => {
    wx.setStorage({
      key: storageKey,
      data,
      complete() {
        resolve()
      },
    })
  })
}

function removeStorage(storageKey: string): Promise<void> {
  return new Promise((resolve) => {
    wx.removeStorage({
      key: storageKey,
      complete() {
        resolve()
      },
    })
  })
}

export async function getCachedGrowthProfileBootstrap(): Promise<{
  data: GrowthProfileBootstrap
  fresh: boolean
} | null> {
  const now = Date.now()
  const envelope =
    memory && memory.version === VERSION
      ? memory
      : await getStorage<CacheEnvelope>(key())

  if (!envelope || envelope.version !== VERSION) return null

  const age = now - envelope.savedAt
  if (age < 0 || age > MAX_STALE_MS) {
    memory = null
    void removeStorage(key())
    return null
  }

  memory = envelope
  return {
    data: envelope.data,
    fresh: age <= FRESH_MS,
  }
}

export async function saveGrowthProfileBootstrap(data: GrowthProfileBootstrap) {
  const envelope: CacheEnvelope = {
    version: VERSION,
    savedAt: Date.now(),
    data,
  }
  memory = envelope
  await setStorage(key(), envelope)
}

export async function clearGrowthProfileBootstrapCache() {
  memory = null
  await removeStorage(key())
}
