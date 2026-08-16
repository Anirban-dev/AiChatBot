import { useState, useEffect } from 'react'
import { X, Gauge, Check, RefreshCw, RotateCcw, Cpu, UploadCloud } from 'lucide-react'
import { UsageBar } from './UsageBar'
import type { AdminUser, UpdateUserLimitsPayload, WindowPeriod } from '../../API/Admin/AdminUsers'
import { updateUserLimits, getUserLimits } from '../../API/Admin/AdminUsers'

interface LimitsModalProps {
  user: AdminUser | null
  onClose: () => void
  onSaved: () => void
  showToast: (text: string, ok: boolean) => void
}

type TabType = 'models' | 'uploads'

const DEFAULT_FALLBACK = {
  models: {
    small:    { rpm: 30,  tpm: 40_000, period: 'hourly' as WindowPeriod },
    large:    { rpm: 10,  tpm: 15_000, period: 'hourly' as WindowPeriod },
    thinking: { rpm: 5,   tpm: 10_000, period: 'hourly' as WindowPeriod },
    critiq:   { rpm: 5,   tpm: 10_000, period: 'hourly' as WindowPeriod },
  },
  uploads: {
    image: { max: 10, period: 'hourly' as WindowPeriod },
    video: { max: 1,  period: 'daily'  as WindowPeriod },
    other: { max: 5,  period: 'hourly' as WindowPeriod },
  }
}

export const LimitsModal = ({ user, onClose, onSaved, showToast }: LimitsModalProps) => {
  const [activeTab, setActiveTab] = useState<TabType>('models')
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [tierDefaults, setTierDefaults] = useState<any>(DEFAULT_FALLBACK)

  // Model limits state: small, large, thinking, critiq
  const [modelInputs, setModelInputs] = useState({
    small:    { rpm: '', tpm: '', period: 'hourly' as WindowPeriod },
    large:    { rpm: '', tpm: '', period: 'hourly' as WindowPeriod },
    thinking: { rpm: '', tpm: '', period: 'hourly' as WindowPeriod },
    critiq:   { rpm: '', tpm: '', period: 'hourly' as WindowPeriod },
  })

  // Upload limits state: image, video, other
  const [uploadInputs, setUploadInputs] = useState({
    image: { max: '', period: 'hourly' as WindowPeriod },
    video: { max: '', period: 'daily' as WindowPeriod },
    other: { max: '', period: 'hourly' as WindowPeriod },
  })

  useEffect(() => {
    if (user) {
      // Initialize with existing limits
      const m = user.limits.models || DEFAULT_FALLBACK.models
      setModelInputs({
        small:    { rpm: String(m.small?.rpm ?? DEFAULT_FALLBACK.models.small.rpm),       tpm: String(m.small?.tpm ?? DEFAULT_FALLBACK.models.small.tpm),       period: m.small?.period || 'hourly' },
        large:    { rpm: String(m.large?.rpm ?? DEFAULT_FALLBACK.models.large.rpm),       tpm: String(m.large?.tpm ?? DEFAULT_FALLBACK.models.large.tpm),       period: m.large?.period || 'hourly' },
        thinking: { rpm: String(m.thinking?.rpm ?? DEFAULT_FALLBACK.models.thinking.rpm), tpm: String(m.thinking?.tpm ?? DEFAULT_FALLBACK.models.thinking.tpm), period: m.thinking?.period || 'hourly' },
        critiq:   { rpm: String(m.critiq?.rpm ?? DEFAULT_FALLBACK.models.critiq.rpm),     tpm: String(m.critiq?.tpm ?? DEFAULT_FALLBACK.models.critiq.tpm),     period: m.critiq?.period || 'hourly' },
      })

      const u = user.limits.uploads || DEFAULT_FALLBACK.uploads
      setUploadInputs({
        image: { max: String(u.image?.max ?? DEFAULT_FALLBACK.uploads.image.max), period: u.image?.period || 'hourly' },
        video: { max: String(u.video?.max ?? DEFAULT_FALLBACK.uploads.video.max), period: u.video?.period || 'daily' },
        other: { max: String(u.other?.max ?? DEFAULT_FALLBACK.uploads.other.max), period: u.other?.period || 'hourly' },
      })

      // Fetch dynamic defaults from backend
      getUserLimits(user.id)
        .then((res: any) => {
          if (res?.tierDefaults) {
            setTierDefaults(res.tierDefaults)
          }
        })
        .catch(() => {})
    }
  }, [user])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  if (!user) return null

  const tier = user.tier || 'free'
  const { limits: l } = user

  const handleApplyOverrides = async () => {
    setSaving(true)
    try {
      const payload: UpdateUserLimitsPayload = {
        modelLimits: {
          small: {
            rpm: parseInt(modelInputs.small.rpm) || tierDefaults?.models?.small?.rpm || DEFAULT_FALLBACK.models.small.rpm,
            tpm: parseInt(modelInputs.small.tpm) || tierDefaults?.models?.small?.tpm || DEFAULT_FALLBACK.models.small.tpm,
            period: modelInputs.small.period,
          },
          large: {
            rpm: parseInt(modelInputs.large.rpm) || tierDefaults?.models?.large?.rpm || DEFAULT_FALLBACK.models.large.rpm,
            tpm: parseInt(modelInputs.large.tpm) || tierDefaults?.models?.large?.tpm || DEFAULT_FALLBACK.models.large.tpm,
            period: modelInputs.large.period,
          },
          thinking: {
            rpm: parseInt(modelInputs.thinking.rpm) || tierDefaults?.models?.thinking?.rpm || DEFAULT_FALLBACK.models.thinking.rpm,
            tpm: parseInt(modelInputs.thinking.tpm) || tierDefaults?.models?.thinking?.tpm || DEFAULT_FALLBACK.models.thinking.tpm,
            period: modelInputs.thinking.period,
          },
          critiq: {
            rpm: parseInt(modelInputs.critiq.rpm) || tierDefaults?.models?.critiq?.rpm || DEFAULT_FALLBACK.models.critiq.rpm,
            tpm: parseInt(modelInputs.critiq.tpm) || tierDefaults?.models?.critiq?.tpm || DEFAULT_FALLBACK.models.critiq.tpm,
            period: modelInputs.critiq.period,
          },
        },
        uploadLimits: {
          image: { max: parseInt(uploadInputs.image.max) || tierDefaults?.uploads?.image?.max || DEFAULT_FALLBACK.uploads.image.max, period: uploadInputs.image.period },
          video: { max: parseInt(uploadInputs.video.max) || tierDefaults?.uploads?.video?.max || DEFAULT_FALLBACK.uploads.video.max, period: uploadInputs.video.period },
          other: { max: parseInt(uploadInputs.other.max) || tierDefaults?.uploads?.other?.max || DEFAULT_FALLBACK.uploads.other.max, period: uploadInputs.other.period },
        }
      }

      await updateUserLimits(user.id, payload)
      showToast('Custom multi-tier limits applied successfully', true)
      onSaved()
      onClose()
    } catch (err: any) {
      showToast(err.message || 'Failed to update user limits', false)
    } finally {
      setSaving(false)
    }
  }

  const handleClearOverrides = async () => {
    if (!window.confirm(`Clear all custom overrides and revert ${user.email} to default ${tier.toUpperCase()} limits?`)) return
    setClearing(true)
    try {
      await updateUserLimits(user.id, { clear: true })
      showToast(`Reverted to standard ${tier.toUpperCase()} limits`, true)
      onSaved()
      onClose()
    } catch (err: any) {
      showToast(err.message || 'Failed to reset overrides', false)
    } finally {
      setClearing(false)
    }
  }

  const modelKeys = [
    { key: 'small',    name: 'Small (Fast)',     color: 'bg-emerald-500', text: 'text-emerald-500' },
    { key: 'large',    name: 'Large (Pro)',      color: 'bg-blue-500',    text: 'text-blue-500' },
    { key: 'thinking', name: 'Thinking (Deep)',  color: 'bg-amber-500',   text: 'text-amber-500' },
    { key: 'critiq',   name: 'Critiq (Analysis)',color: 'bg-violet-500',  text: 'text-violet-500' },
  ] as const

  const uploadCategories = [
    { key: 'image', name: 'Images', color: 'bg-pink-500' },
    { key: 'video', name: 'Videos', color: 'bg-red-500' },
    { key: 'other', name: 'Files / Docs', color: 'bg-cyan-500' },
  ] as const

  const PERIOD_OPTIONS: { value: WindowPeriod; label: string }[] = [
    { value: 'hourly',  label: 'Hourly (per hr)' },
    { value: 'daily',   label: 'Daily (per day)' },
    { value: 'weekly',  label: 'Weekly (per week)' },
    { value: 'monthly', label: 'Monthly (per month)' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/50 dark:bg-slate-950/70 backdrop-blur-xs" onClick={onClose} />

      {/* Modal Container */}
      <div className="relative w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl space-y-5 overflow-hidden max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-500">
              <Gauge size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                  Rate Limit & Quota Configuration
                </h3>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 text-indigo-600 dark:text-indigo-400">
                  {tier} tier
                </span>
                {l.isOverridden && (
                  <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500">
                    Custom Override Active
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate max-w-md">
                {user.email}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer">
            <X size={16} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-100 dark:border-slate-800/80 gap-4 shrink-0">
          <button
            onClick={() => setActiveTab('models')}
            className={`flex items-center gap-2 pb-2.5 text-xs font-bold uppercase tracking-wider transition cursor-pointer border-b-2 ${
              activeTab === 'models'
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
            }`}
          >
            <Cpu size={14} />
            AI Model Tiers (4 Modes)
          </button>
          <button
            onClick={() => setActiveTab('uploads')}
            className={`flex items-center gap-2 pb-2.5 text-xs font-bold uppercase tracking-wider transition cursor-pointer border-b-2 ${
              activeTab === 'uploads'
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
            }`}
          >
            <UploadCloud size={14} />
            Upload Limits (Image / Video / Other)
          </button>
        </div>

        {/* Scrollable Content Area */}
        <div className="space-y-4 overflow-y-auto pr-1 flex-1 custom-scrollbar">

          {/* TAB 1: AI MODEL TIERS */}
          {activeTab === 'models' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {modelKeys.map(m => {
                  const limit = l.models?.[m.key] || tierDefaults.models[m.key]
                  const usage = l.modelsUsage?.[m.key] || { rpmUsed: 0, tpmUsed: 0 }
                  const def = tierDefaults.models[m.key]
                  const period = limit.period || 'hourly'
                  const shortPeriod = period === 'hourly' ? 'hr' : period === 'daily' ? 'day' : period === 'weekly' ? 'wk' : 'mo'

                  return (
                    <div
                      key={m.key}
                      className="p-4 rounded-xl bg-slate-50/70 dark:bg-slate-950/40 border border-slate-200/80 dark:border-slate-800/70 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${m.color}`} />
                          {m.name}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">
                          Tier: {def.rpm}/{shortPeriod} · {def.tpm.toLocaleString()} tok
                        </span>
                      </div>

                      {/* Usage progress bar */}
                      <div className="space-y-1.5 text-[11px]">
                        <div className="flex justify-between text-slate-500 dark:text-slate-400">
                          <span>Requests ({period})</span>
                          <span className="font-bold text-slate-700 dark:text-slate-300">
                            {usage.rpmUsed} / {limit.rpm}
                          </span>
                        </div>
                        <UsageBar used={usage.rpmUsed} total={limit.rpm} color={m.color} />

                        <div className="flex justify-between text-slate-500 dark:text-slate-400 pt-1">
                          <span>Tokens ({period})</span>
                          <span className="font-bold text-slate-700 dark:text-slate-300">
                            {usage.tpmUsed.toLocaleString()} / {limit.tpm.toLocaleString()}
                          </span>
                        </div>
                        <UsageBar used={usage.tpmUsed} total={limit.tpm} color="bg-indigo-400" />
                      </div>

                      {/* Manual Override inputs for this model */}
                      <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800/50 space-y-2">
                        <div>
                          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                            Window Period
                          </label>
                          <select
                            value={modelInputs[m.key].period}
                            onChange={e => setModelInputs({
                              ...modelInputs,
                              [m.key]: { ...modelInputs[m.key], period: e.target.value as WindowPeriod }
                            })}
                            className="w-full px-2 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none"
                          >
                            {PERIOD_OPTIONS.map(p => (
                              <option key={p.value} value={p.value}>{p.label}</option>
                            ))}
                          </select>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                              Max Requests
                            </label>
                            <input
                              type="number"
                              min={1}
                              value={modelInputs[m.key].rpm}
                              onChange={e => setModelInputs({
                                ...modelInputs,
                                [m.key]: { ...modelInputs[m.key], rpm: e.target.value }
                              })}
                              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                              Max Tokens
                            </label>
                            <input
                              type="number"
                              min={1}
                              value={modelInputs[m.key].tpm}
                              onChange={e => setModelInputs({
                                ...modelInputs,
                                [m.key]: { ...modelInputs[m.key], tpm: e.target.value }
                              })}
                              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* TAB 2: UPLOAD LIMITS */}
          {activeTab === 'uploads' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                {uploadCategories.map(cat => {
                  const limit = l.uploads?.[cat.key] || tierDefaults.uploads[cat.key]
                  const used = l.uploadsUsage?.[cat.key]?.used ?? 0
                  const def = tierDefaults.uploads[cat.key]
                  const period = limit.period || (cat.key === 'video' ? 'daily' : 'hourly')
                  const shortPeriod = period === 'hourly' ? 'hr' : period === 'daily' ? 'day' : period === 'weekly' ? 'wk' : 'mo'

                  return (
                    <div
                      key={cat.key}
                      className="p-4 rounded-xl bg-slate-50/70 dark:bg-slate-950/40 border border-slate-200/80 dark:border-slate-800/70 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${cat.color}`} />
                          {cat.name}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          per {shortPeriod}
                        </span>
                      </div>

                      <div className="space-y-1.5 text-[11px]">
                        <div className="flex justify-between text-slate-500 dark:text-slate-400">
                          <span>Usage ({period})</span>
                          <span className="font-bold text-slate-700 dark:text-slate-300">
                            {used} / {limit.max}
                          </span>
                        </div>
                        <UsageBar used={used} total={limit.max} color={cat.color} />
                        <p className="text-[9px] text-slate-400">Tier Default: {def.max} / {shortPeriod}</p>
                      </div>

                      <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800/50 space-y-2">
                        <div>
                          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                            Window Period
                          </label>
                          <select
                            value={uploadInputs[cat.key].period}
                            onChange={e => setUploadInputs({
                              ...uploadInputs,
                              [cat.key]: { ...uploadInputs[cat.key], period: e.target.value as WindowPeriod }
                            })}
                            className="w-full px-2 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none"
                          >
                            {PERIOD_OPTIONS.map(p => (
                              <option key={p.value} value={p.value}>{p.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                            Max Uploads
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={uploadInputs[cat.key].max}
                            onChange={e => setUploadInputs({
                              ...uploadInputs,
                              [cat.key]: { ...uploadInputs[cat.key], max: e.target.value }
                            })}
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

        </div>

        {/* Action Controls */}
        <div className="flex gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800/80 shrink-0">
          <button
            onClick={handleApplyOverrides}
            disabled={saving || clearing}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold transition disabled:opacity-50 cursor-pointer shadow-xs"
          >
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
            {saving ? 'Saving...' : 'Apply Multi-Tier Limits'}
          </button>
          {l.isOverridden && (
            <button
              onClick={handleClearOverrides}
              disabled={saving || clearing}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-rose-500 hover:border-rose-200 transition disabled:opacity-50 text-xs font-bold cursor-pointer"
            >
              {clearing ? <RefreshCw size={14} className="animate-spin" /> : <RotateCcw size={14} />}
              Reset to Tier Defaults
            </button>
          )}
        </div>
      </div>
    </div>
  )
}