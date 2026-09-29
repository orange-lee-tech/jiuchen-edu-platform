import {
  getSavedAuthResult,
  type BootstrapResult,
} from './auth'
import type { AcademicProfile } from './request'

const PREFIX = 'jiuchen-academic-profile'

function cacheIdentity(auth: BootstrapResult | null) {
  if (!auth) return 'anonymous'
  return auth.businessIdentity?.businessId || auth.user.id
}

function key() {
  return `${PREFIX}:${cacheIdentity(getSavedAuthResult())}`
}

export function getCachedAcademicProfile(): AcademicProfile | null {
  const value = wx.getStorageSync(key())
  if (!value || typeof value !== 'object') return null
  return value as AcademicProfile
}

export function saveCachedAcademicProfile(profile: AcademicProfile) {
  wx.setStorageSync(key(), profile)
}

export function clearCachedAcademicProfile() {
  wx.removeStorageSync(key())
}
