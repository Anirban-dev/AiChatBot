// src/services/limits.ts — canonical tier/limit helpers (shared across routes)
import { TierConfig, ITierConfig } from '../models/tier'
import { User } from '../models/user'
import { redis } from '../utils/redis'
import { getWindowStamp, WindowPeriod } from '../utils/windowHelper'

export interface ModelLimitConfig { rpm: number; tpm: number; period?: WindowPeriod }
export interface UploadLimitConfig { max: number; windowSec: number; label: string; period?: WindowPeriod }
export interface TierFullConfig {
  models: { small: ModelLimitConfig; large: ModelLimitConfig; thinking: ModelLimitConfig; critiq: ModelLimitConfig }
  uploads: { image: UploadLimitConfig; video: UploadLimitConfig; other: UploadLimitConfig }
}

export async function getTierConfig(tierName: string): Promise<TierFullConfig> {
  const cacheKey = `tier_config:${tierName}`
  const cached = await redis.get(cacheKey)
  if (cached) { try { return JSON.parse(cached) } catch {} }
  const doc = await TierConfig.findOne({ name: tierName }).lean() as ITierConfig | null
  if (doc) {
    const config: TierFullConfig = { models: doc.models as any, uploads: doc.uploads as any }
    await redis.set(cacheKey, JSON.stringify(config), 'EX', 60)
    return config
  }
  const free = await TierConfig.findOne({ name: 'free' }).lean() as ITierConfig | null
  const fallback: TierFullConfig = free
    ? { models: free.models as any, uploads: free.uploads as any }
    : {
        models: {
          small: { rpm: 30, tpm: 40_000, period: 'hourly' },
          large: { rpm: 10, tpm: 15_000, period: 'hourly' },
          thinking: { rpm: 5, tpm: 10_000, period: 'hourly' },
          critiq: { rpm: 5, tpm: 10_000, period: 'hourly' },
        },
        uploads: {
          image: { max: 10, windowSec: 3600, label: 'image', period: 'hourly' },
          video: { max: 1, windowSec: 86400, label: 'video', period: 'daily' },
          other: { max: 5, windowSec: 3600, label: 'file', period: 'hourly' },
        },
      }
  await redis.set(cacheKey, JSON.stringify(fallback), 'EX', 60)
  return fallback
}

export async function getEffectiveUserLimits(userId: string, tier: string) {
  const user = await User.findById(userId).select('tier modelLimits uploadLimits')
  const defaultTierConfig = await getTierConfig(tier)
  if (!user) return { models: defaultTierConfig.models, uploads: defaultTierConfig.uploads, isOverridden: false }
  const u = user as any
  let isOverridden = false
  const models = {
    small: { rpm: u.modelLimits?.small?.rpm ?? defaultTierConfig.models.small.rpm, tpm: u.modelLimits?.small?.tpm ?? defaultTierConfig.models.small.tpm, period: u.modelLimits?.small?.period ?? defaultTierConfig.models.small.period ?? 'hourly' },
    large: { rpm: u.modelLimits?.large?.rpm ?? defaultTierConfig.models.large.rpm, tpm: u.modelLimits?.large?.tpm ?? defaultTierConfig.models.large.tpm, period: u.modelLimits?.large?.period ?? defaultTierConfig.models.large.period ?? 'hourly' },
    thinking: { rpm: u.modelLimits?.thinking?.rpm ?? defaultTierConfig.models.thinking.rpm, tpm: u.modelLimits?.thinking?.tpm ?? defaultTierConfig.models.thinking.tpm, period: u.modelLimits?.thinking?.period ?? defaultTierConfig.models.thinking.period ?? 'hourly' },
    critiq: { rpm: u.modelLimits?.critiq?.rpm ?? defaultTierConfig.models.critiq.rpm, tpm: u.modelLimits?.critiq?.tpm ?? defaultTierConfig.models.critiq.tpm, period: u.modelLimits?.critiq?.period ?? defaultTierConfig.models.critiq.period ?? 'hourly' },
  } as TierFullConfig['models']
  for (const m of ['small','large','thinking','critiq'] as const) {
    if (models[m].rpm !== defaultTierConfig.models[m].rpm || models[m].tpm !== defaultTierConfig.models[m].tpm || models[m].period !== defaultTierConfig.models[m].period) isOverridden = true
  }
  const uploads = {
    image: { max: u.uploadLimits?.image?.max ?? defaultTierConfig.uploads.image.max, windowSec: defaultTierConfig.uploads.image.windowSec, label: defaultTierConfig.uploads.image.label, period: u.uploadLimits?.image?.period ?? defaultTierConfig.uploads.image.period ?? 'hourly' },
    video: { max: u.uploadLimits?.video?.max ?? defaultTierConfig.uploads.video.max, windowSec: defaultTierConfig.uploads.video.windowSec, label: defaultTierConfig.uploads.video.label, period: u.uploadLimits?.video?.period ?? defaultTierConfig.uploads.video.period ?? 'daily' },
    other: { max: u.uploadLimits?.other?.max ?? defaultTierConfig.uploads.other.max, windowSec: defaultTierConfig.uploads.other.windowSec, label: defaultTierConfig.uploads.other.label, period: u.uploadLimits?.other?.period ?? defaultTierConfig.uploads.other.period ?? 'hourly' },
  } as TierFullConfig['uploads']
  for (const cat of ['image','video','other'] as const) {
    if (uploads[cat].max !== defaultTierConfig.uploads[cat].max || uploads[cat].period !== defaultTierConfig.uploads[cat].period) isOverridden = true
  }
  return { models, uploads, isOverridden }
}

export async function getDetailedUserUsage(userId: string, userTier: string = 'free', effective?: Awaited<ReturnType<typeof getEffectiveUserLimits>>) {
  const limits = effective ?? (await getEffectiveUserLimits(userId, userTier))
  const now = new Date()
  const modelKeys = ['small','large','thinking','critiq'] as const
  const uploadKeys = ['image','video','other'] as const
  const modelResults = await Promise.all(modelKeys.map(async m => {
    const period = limits.models[m].period || 'hourly'
    const stamp = getWindowStamp(now, period as WindowPeriod)
    const [tpmRaw, rpmRaw] = await Promise.all([redis.get(`usage:tpm:${userId}:${m}:${stamp}`), redis.get(`usage:rpm:${userId}:${m}:${stamp}`)])
    return { key: m, tpmUsed: parseInt(tpmRaw ?? '0',10)||0, rpmUsed: parseInt(rpmRaw ?? '0',10)||0 }
  }))
  const uploadResults = await Promise.all(uploadKeys.map(async cat => {
    const period = limits.uploads[cat].period || (cat==='video'?'daily':'hourly')
    const stamp = getWindowStamp(now, period as WindowPeriod)
    const usedRaw = await redis.get(`rl:upload:${cat}:${userId}:${stamp}`)
    return { key: cat, used: parseInt(usedRaw ?? '0',10)||0 }
  }))
  const modelsUsage: Record<string,{rpmUsed:number;tpmUsed:number}> = {}
  for (const r of modelResults) modelsUsage[r.key] = { rpmUsed: r.rpmUsed, tpmUsed: r.tpmUsed }
  const uploadsUsage: Record<string,{used:number}> = {}
  for (const r of uploadResults) uploadsUsage[r.key] = { used: r.used }
  const sumModelTpm = Object.values(modelsUsage).reduce((a,b)=>a+b.tpmUsed,0)
  const sumModelRpm = Object.values(modelsUsage).reduce((a,b)=>a+b.rpmUsed,0)
  return { models: modelsUsage, uploads: uploadsUsage, totalTpmUsed: sumModelTpm, totalRpmUsed: sumModelRpm }
}
