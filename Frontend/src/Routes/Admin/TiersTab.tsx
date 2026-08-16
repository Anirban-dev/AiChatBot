// src/Routes/Admin/TiersTab.tsx
import { useState, useEffect, useCallback } from 'react'
import {
  Layers,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  RefreshCw,
  Cpu,
  UploadCloud,
  Lock,
  Sparkles,
  Clock,
} from 'lucide-react'
import {
  getAdminTiers,
  createAdminTier,
  updateAdminTier,
  deleteAdminTier,
  type TierConfig,
  type WindowPeriod,
} from '../../API/Admin/AdminTiers'

interface Props {
  onExpired: () => void
}

const DEFAULT_TIER_FORM: Omit<TierConfig, '_id' | 'createdAt' | 'updatedAt'> = {
  name: '',
  models: {
    small:    { rpm: 60,  tpm: 80_000,  period: 'hourly' },
    large:    { rpm: 20,  tpm: 30_000,  period: 'hourly' },
    thinking: { rpm: 10,  tpm: 20_000,  period: 'hourly' },
    critiq:   { rpm: 10,  tpm: 20_000,  period: 'hourly' },
  },
  uploads: {
    image: { max: 20, windowSec: 3600,  label: 'image', period: 'hourly' },
    video: { max: 2,  windowSec: 86400, label: 'video', period: 'daily'  },
    other: { max: 10, windowSec: 3600,  label: 'file',  period: 'hourly' },
  },
}

const PERIOD_OPTIONS: { value: WindowPeriod; label: string; short: string }[] = [
  { value: 'hourly',  label: 'Hourly (per hr)',    short: 'hr' },
  { value: 'daily',   label: 'Daily (per day)',    short: 'day' },
  { value: 'weekly',  label: 'Weekly (per week)',  short: 'wk' },
  { value: 'monthly', label: 'Monthly (per month)',short: 'mo' },
]

export const TiersTab = ({ onExpired }: Props) => {
  const [tiers, setTiers] = useState<TierConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [actionId, setActionId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null)

  // Modal / Editor State
  const [isCreating, setIsCreating] = useState(false)
  const [editingTier, setEditingTier] = useState<TierConfig | null>(null)
  const [formData, setFormData] = useState<Omit<TierConfig, '_id' | 'createdAt' | 'updatedAt'>>(DEFAULT_TIER_FORM)

  const showToast = (text: string, ok: boolean) => {
    setToast({ text, ok })
    setTimeout(() => setToast(null), 3500)
  }

  const fetchTiers = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getAdminTiers()
      setTiers(data.tiers || [])
    } catch (err: any) {
      if (err.message?.includes('expired') || err.message?.includes('denied')) {
        onExpired()
      } else {
        showToast(err.message || 'Failed to fetch tiers', false)
      }
    } finally {
      setLoading(false)
    }
  }, [onExpired])

  useEffect(() => {
    fetchTiers()
  }, [fetchTiers])

  const handleOpenCreate = () => {
    setEditingTier(null)
    setFormData(DEFAULT_TIER_FORM)
    setIsCreating(true)
  }

  const handleOpenEdit = (tier: TierConfig) => {
    setIsCreating(false)
    setEditingTier(tier)
    setFormData({
      name: tier.name,
      models: {
        small:    { ...tier.models.small,    period: tier.models.small.period || 'hourly' },
        large:    { ...tier.models.large,    period: tier.models.large.period || 'hourly' },
        thinking: { ...tier.models.thinking, period: tier.models.thinking.period || 'hourly' },
        critiq:   { ...tier.models.critiq,   period: tier.models.critiq.period || 'hourly' },
      },
      uploads: {
        image: { ...tier.uploads.image, period: tier.uploads.image.period || 'hourly' },
        video: { ...tier.uploads.video, period: tier.uploads.video.period || 'daily' },
        other: { ...tier.uploads.other, period: tier.uploads.other.period || 'hourly' },
      },
    })
  }

  const handleCloseModal = () => {
    setIsCreating(false)
    setEditingTier(null)
  }

  const handleSaveTier = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (isCreating) {
        await createAdminTier(formData)
        showToast(`Tier "${formData.name.toLowerCase()}" created successfully`, true)
      } else if (editingTier) {
        await updateAdminTier(editingTier.name, {
          models: formData.models,
          uploads: formData.uploads,
        })
        showToast(`Tier "${editingTier.name}" updated successfully`, true)
      }
      handleCloseModal()
      fetchTiers()
    } catch (err: any) {
      showToast(err.response?.data?.error || err.message || 'Failed to save tier', false)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteTier = async (name: string) => {
    if (name === 'free') {
      showToast('The free tier is protected and cannot be deleted.', false)
      return
    }
    if (
      !window.confirm(
        `Are you sure you want to delete the "${name.toUpperCase()}" tier? All users currently assigned to this tier will automatically be reverted to the FREE tier.`
      )
    ) {
      return
    }

    setActionId(name)
    try {
      const res = await deleteAdminTier(name)
      showToast(res.message || `Tier "${name}" deleted.`, true)
      fetchTiers()
    } catch (err: any) {
      showToast(err.response?.data?.error || err.message || 'Failed to delete tier', false)
    } finally {
      setActionId(null)
    }
  }

  const modelKeys = [
    { key: 'small',    name: 'Small (Fast)',      color: 'bg-emerald-500', text: 'text-emerald-500' },
    { key: 'large',    name: 'Large (Pro)',       color: 'bg-blue-500',    text: 'text-blue-500' },
    { key: 'thinking', name: 'Thinking (Deep)',   color: 'bg-amber-500',   text: 'text-amber-500' },
    { key: 'critiq',   name: 'Critiq (Analysis)', color: 'bg-violet-500',  text: 'text-violet-500' },
  ] as const

  const uploadKeys = [
    { key: 'image', name: 'Images', color: 'bg-pink-500' },
    { key: 'video', name: 'Videos', color: 'bg-red-500' },
    { key: 'other', name: 'Files / Docs', color: 'bg-cyan-500' },
  ] as const

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Toast HUD */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 text-xs px-4 py-3 rounded-xl border font-bold shadow-xl transition-all duration-300 animate-in fade-in slide-in-from-top-2 backdrop-blur-md ${
            toast.ok
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400'
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Layers className="text-indigo-600 dark:text-indigo-400" size={22} />
            Tier & Rate Limit Management
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Configure dynamic tiers with flexible rate limit windows (hourly, daily, weekly, or monthly) for AI models and uploads.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fetchTiers()}
            disabled={loading}
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition disabled:opacity-40 cursor-pointer shadow-xs"
            title="Refresh Tiers"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-900/20 transition cursor-pointer"
          >
            <Plus size={15} />
            Add New Tier
          </button>
        </div>
      </div>

      {/* Tier Cards Grid */}
      {loading && tiers.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map(i => (
            <div
              key={i}
              className="h-72 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse p-6"
            />
          ))}
        </div>
      ) : tiers.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900">
          <Layers className="mx-auto text-slate-300 dark:text-slate-700 mb-3" size={36} />
          <p className="text-slate-500 dark:text-slate-400 font-medium text-sm">No tiers configured.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {tiers.map(tier => {
            const isFree = tier.name === 'free'
            return (
              <div
                key={tier.name}
                className="flex flex-col justify-between rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition"
              >
                <div>
                  {/* Top Bar */}
                  <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-black uppercase tracking-wider px-3 py-1 rounded-lg border ${
                          isFree
                            ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                            : 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-500/20 text-indigo-600 dark:text-indigo-400'
                        }`}
                      >
                        {tier.name}
                      </span>
                      {isFree && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400 dark:text-slate-500">
                          <Lock size={11} /> Default
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEdit(tier)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                        title="Edit Limits"
                      >
                        <Edit2 size={13} />
                      </button>
                      {!isFree && (
                        <button
                          onClick={() => handleDeleteTier(tier.name)}
                          disabled={actionId === tier.name}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition cursor-pointer disabled:opacity-40"
                          title="Delete Tier"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Model Limits Summary */}
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      <Cpu size={13} className="text-indigo-500" />
                      AI Quotas
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {modelKeys.map(m => {
                        const cfg = tier.models[m.key]
                        const period = cfg?.period || 'hourly'
                        const shortPeriod = period === 'hourly' ? 'hr' : period === 'daily' ? 'day' : period === 'weekly' ? 'wk' : 'mo'
                        return (
                          <div
                            key={m.key}
                            className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800/60 text-xs"
                          >
                            <div className="flex items-center justify-between font-bold text-slate-700 dark:text-slate-300 text-[11px]">
                              <span className="flex items-center gap-1.5">
                                <span className={`w-1.5 h-1.5 rounded-full ${m.color}`} />
                                {m.name.split(' ')[0]}
                              </span>
                              <span className="text-[9px] px-1 py-0.5 rounded bg-slate-200/60 dark:bg-slate-800 text-slate-500 font-semibold uppercase">
                                {period}
                              </span>
                            </div>
                            <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 space-y-0.5">
                              <div>{cfg?.rpm ?? 0} req/{shortPeriod}</div>
                              <div>{(cfg?.tpm ?? 0).toLocaleString()} tok/{shortPeriod}</div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Upload Limits Summary */}
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      <UploadCloud size={13} className="text-pink-500" />
                      Upload Limits
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 text-center">
                      {uploadKeys.map(u => {
                        const cfg = tier.uploads[u.key]
                        const period = cfg?.period || (u.key === 'video' ? 'daily' : 'hourly')
                        const shortPeriod = period === 'hourly' ? 'hr' : period === 'daily' ? 'day' : period === 'weekly' ? 'wk' : 'mo'
                        return (
                          <div
                            key={u.key}
                            className="p-2 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800/60"
                          >
                            <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 truncate">
                              {u.name}
                            </div>
                            <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                              {cfg?.max ?? 0}
                            </div>
                            <div className="text-[9px] text-slate-400">/{shortPeriod}</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {/* Footer Meta */}
                {tier.createdAt && (
                  <div className="pt-3 mt-4 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400 flex justify-between">
                    <span>Created {new Date(tier.createdAt).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* CREATE / EDIT MODAL */}
      {(isCreating || editingTier) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 dark:bg-slate-950/70 backdrop-blur-xs" onClick={handleCloseModal} />

          <div className="relative w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl space-y-5 overflow-hidden max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-500">
                  <Sparkles size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                    {isCreating ? 'Create New Tier' : `Edit "${editingTier?.name}" Tier`}
                  </h3>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    Define rate limits, token quotas, and time windows (hourly, daily, weekly, monthly).
                  </p>
                </div>
              </div>
              <button
                onClick={handleCloseModal}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Form Content */}
            <form onSubmit={handleSaveTier} className="space-y-4 overflow-y-auto pr-1 flex-1 custom-scrollbar">
              {/* Tier Name */}
              {isCreating && (
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Tier Name (Slug) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. pro, ultra, team, partner"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Lowercase alphanumeric characters, hyphens, and underscores only.
                  </p>
                </div>
              )}

              {/* AI Models Limits */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  <Cpu size={14} className="text-indigo-500" />
                  AI Model Quotas & Windows
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {modelKeys.map(m => (
                    <div
                      key={m.key}
                      className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200/80 dark:border-slate-800/80 space-y-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                          <span className={`w-2 h-2 rounded-full ${m.color}`} />
                          {m.name}
                        </div>
                        <select
                          value={formData.models[m.key].period || 'hourly'}
                          onChange={e =>
                            setFormData({
                              ...formData,
                              models: {
                                ...formData.models,
                                [m.key]: {
                                  ...formData.models[m.key],
                                  period: e.target.value as WindowPeriod,
                                },
                              },
                            })
                          }
                          className="text-[10px] font-bold px-2 py-1 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 focus:outline-none"
                        >
                          {PERIOD_OPTIONS.map(p => (
                            <option key={p.value} value={p.value}>{p.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">
                            Max Requests
                          </label>
                          <input
                            type="number"
                            min={1}
                            required
                            value={formData.models[m.key].rpm}
                            onChange={e =>
                              setFormData({
                                ...formData,
                                models: {
                                  ...formData.models,
                                  [m.key]: {
                                    ...formData.models[m.key],
                                    rpm: parseInt(e.target.value) || 1,
                                  },
                                },
                              })
                            }
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">
                            Max Tokens
                          </label>
                          <input
                            type="number"
                            min={1}
                            required
                            value={formData.models[m.key].tpm}
                            onChange={e =>
                              setFormData({
                                ...formData,
                                models: {
                                  ...formData.models,
                                  [m.key]: {
                                    ...formData.models[m.key],
                                    tpm: parseInt(e.target.value) || 1,
                                  },
                                },
                              })
                            }
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Upload Limits */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  <UploadCloud size={14} className="text-pink-500" />
                  Media Upload Limits & Windows
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {uploadKeys.map(u => (
                    <div
                      key={u.key}
                      className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200/80 dark:border-slate-800/80 space-y-2"
                    >
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                        <span className={`w-2 h-2 rounded-full ${u.color}`} />
                        {u.name}
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">
                          Window Period
                        </label>
                        <select
                          value={formData.uploads[u.key].period || (u.key === 'video' ? 'daily' : 'hourly')}
                          onChange={e =>
                            setFormData({
                              ...formData,
                              uploads: {
                                ...formData.uploads,
                                [u.key]: {
                                  ...formData.uploads[u.key],
                                  period: e.target.value as WindowPeriod,
                                },
                              },
                            })
                          }
                          className="w-full text-xs font-bold px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none mb-2"
                        >
                          {PERIOD_OPTIONS.map(p => (
                            <option key={p.value} value={p.value}>{p.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">
                          Max Uploads
                        </label>
                        <input
                          type="number"
                          min={1}
                          required
                          value={formData.uploads[u.key].max}
                          onChange={e =>
                            setFormData({
                              ...formData,
                              uploads: {
                                ...formData.uploads,
                                [u.key]: {
                                  ...formData.uploads[u.key],
                                  max: parseInt(e.target.value) || 1,
                                },
                              },
                            })
                          }
                          className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={saving}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-900/20 transition disabled:opacity-50 cursor-pointer"
                >
                  {saving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                  {saving ? 'Saving...' : isCreating ? 'Create Tier' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default TiersTab

