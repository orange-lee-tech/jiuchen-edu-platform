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

export function getCachedAcademicProfile(): Promise<AcademicProfile | null> {
  return new Promise((resolve) => {
    wx.getStorage({
      key: key(),
      success(result) {
        const value = result.data
        resolve(
          value && typeof value === 'object'
            ? (value as AcademicProfile)
            : null,
        )
      },
      fail() {
        resolve(null)
      },
    })
  })
}

export function saveCachedAcademicProfile(profile: AcademicProfile): Promise<void> {
  return new Promise((resolve) => {
    wx.setStorage({
      key: key(),
      data: profile,
      complete() {
        resolve()
      },
    })
  })
}

export function clearCachedAcademicProfile(): Promise<void> {
  return new Promise((resolve) => {
    wx.removeStorage({
      key: key(),
      complete() {
        resolve()
      },
    })
  })
}
