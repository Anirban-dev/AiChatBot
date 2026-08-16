// src/Routes/Admin/AiProvidersTab.tsx
import { useState, useEffect, useCallback } from 'react'
import { Plus, X, Edit2, Trash2, RefreshCw, Check, Cpu, Power, Globe, KeyRound, Layers } from 'lucide-react'
import {
  getAdminAiProviders,
  createAdminAiProvider,
  updateAdminAiProvider,
  deleteAdminAiProvider,
  reloadAdminAiProviders,
  PROVIDER_PRESETS,
  type AiProvider,
  type AiTierKey,
  type AiTierMeta,
  type AiProviderInput,
} from '../../API/Admin/AdminAiProviders'

interface Props {
  onExpired: () => void
}

function errMsg(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { response?: { data?: { error?: string } }; message?: string }
    return e.response?.data?.error || e.message || 'Something went wrong.'
  }
  return 'Something went wrong.'
}

const MODE_SLOTS: AiTierKey[] = ['small', 'large', 'thinking', 'critiq']

const initialForm = (tier: AiTierKey): AiProviderInput => ({
  tier,
  provider: 'openai',
  model: '',
  api_base: '',
  api_key: '',
  enabled: true,
  priority: 0,
})

const DEFAULT_PRESET_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  groq: 'https://api.groq.com/openai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  huggingface: 'https://api-inference.huggingface.co/v1',
  anthropic: 'https://api.anthropic.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  moonshot: 'https://api.moonshot.cn/v1',
  deepinfra: 'https://api.deepinfra.com/v1/openai',
  mistral: 'https://api.mistral.ai/v1',
  together: 'https://api.together.xyz/v1',
  fireworks: 'https://api.fireworks.ai/inference/v1',
  custom: '',
}

const TIER_META: Record<AiTierKey, { label: string; desc: string; icon: string; color: string }> = {
  small:      { label: 'Chat — Small',        desc: 'Fast conversational replies (no tools)', icon: '✦', color: 'text-emerald-500' },
  large:      { label: 'Tools — Large',       desc: 'Agentic mode with tool calling',        icon: '⚡', color: 'text-blue-500' },
  thinking:   { label: 'Reason — Thinking',   desc: 'Deep reasoning with native thinking',   icon: '🧠', color: 'text-amber-500' },
  critiq:     { label: 'Critiq — Review',     desc: 'Multi-agent orchestrator + workers',    icon: '🧐', color: 'text-violet-500' },
  summaryllm: { label: 'Summarization',       desc: 'Session summarization & state',         icon: '📝', color: 'text-cyan-500' },
  visionllm:  { label: 'Vision',              desc: 'Image understanding',                   icon: '👁', color: 'text-pink-500' },
  speechllm:  { label: 'Speech (ASR)',        desc: 'Speech-to-text transcription',          icon: '🎙', color: 'text-orange-500' },
  'free-embed': { label: 'Embeddings',          desc: 'Document vector embeddings',            icon: '🧲', color: 'text-slate-500' },
}

export const AiProvidersTab = ({ onExpired }: Props) => {
  const [providers, setProviders] = useState<AiProvider[]>([])
  const [tiers, setTiers] = useState<AiTierMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [actionId, setActionId] = useState<string | null>(null)
  const [reloading, setReloading] = useState(false)
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<AiProviderInput>(initialForm('small'))

  const showToast = (text: string, ok: boolean) => {
    setToast({ text, ok })
    setTimeout(() => setToast(null), 3500)
  }

  const fetchProviders = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getAdminAiProviders()
      setProviders(data.providers || [])
      setTiers(data.tiers || [])
    } catch (err) {
      const msg = errMsg(err).toLowerCase()
      if (msg.includes('expired') || msg.includes('unauthorized') || msg.includes('denied')) {
        onExpired()
      } else {
        showToast(errMsg(err), false)
      }
    } finally {
      setLoading(false)
    }
  }, [onExpired])

  useEffect(() => {
    fetchProviders()
  }, [fetchProviders])

  const handleOpenCreate = (tier: AiTierKey = 'small') => {
    setEditingId(null)
    setForm(initialForm(tier))
    setShowForm(true)
  }

  const handleOpenEdit = (p: AiProvider) => {
    setEditingId(p._id)
    setForm({
      tier: p.tier,
      provider: p.provider || 'openai',
      model: p.model,
      api_base: p.api_base || '',
      api_key: '',
      enabled: p.enabled,
      priority: p.priority ?? 0,
    })
    setShowForm(true)
  }

  const handleClose = () => {
    setShowForm(false)
    setEditingId(null)
  }

  const handleProviderChange = (value: string) => {
    setForm(f => ({
      ...f,
      provider: value,
      model: '',
      api_base: DEFAULT_PRESET_URLS[value] ?? '',
    }))
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.model.trim()) {
      showToast('Model name is required.', false)
      return
    }
    setSaving(true)
    try {
      if (editingId) {
        const res = await updateAdminAiProvider(editingId, form)
        showToast(res.reload?.applied ? `${res.message} (applied live)` : `${res.message} — AI engine did not reload`, res.reload?.applied)
      } else {
        const res = await createAdminAiProvider(form)
        showToast(res.reload?.applied ? `${res.message} (applied live)` : `${res.message} — AI engine did not reload`, res.reload?.applied)
      }
      handleClose()
      fetchProviders()
    } catch (err) {
      showToast(errMsg(err), false)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (p: AiProvider) => {
    if (!window.confirm(`Delete the provider for tier ${p.tier} (${p.model})? The change will be applied to the running AI engine.`)) return
    setActionId(p._id)
    try {
      const res = await deleteAdminAiProvider(p._id)
      showToast(res.message || 'Provider deleted.', true)
      fetchProviders()
    } catch (err) {
      showToast(errMsg(err), false)
    } finally {
      setActionId(null)
    }
  }

  const handleReload = async () => {
    setReloading(true)
    try {
      const res = await reloadAdminAiProviders()
      showToast(res.applied ? 'AI router reloaded successfully.' : `Reload failed: ${res.error || 'engine unreachable'}`, res.applied)
    } catch (err) {
      showToast(errMsg(err), false)
    } finally {
      setReloading(false)
    }
  }

  const toggleEnabled = async (p: AiProvider) => {
    setActionId(p._id)
    try {
      await updateAdminAiProvider(p._id, {
        tier: p.tier,
        provider: p.provider || 'openai',
        model: p.model,
        api_base: p.api_base || '',
        api_key: '',
        enabled: !p.enabled,
        priority: p.priority ?? 0,
      })
      fetchProviders()
    } catch (err) {
      showToast(errMsg(err), false)
    } finally {
      setActionId(null)
    }
  }

  const liveTiers = MODE_SLOTS.map(key => ({
    key,
    meta: TIER_META[key],
    list: providers.filter(p => p.tier === key && p.enabled),
    all: providers.filter(p => p.tier === key),
  }))

  const auxTiers = (tiers.filter(t => t.key !== 'small' && t.key !== 'large' && t.key !== 'thinking' && t.key !== 'critiq') as AiTierMeta[])

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-fade-in">
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 text-xs px-4 py-3 rounded-xl border font-bold shadow-xl transition-all duration-300 backdrop-blur-md ${
            toast.ok
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400'
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Layers className="text-indigo-600 dark:text-indigo-400" size={22} />
            AI Provider Configuration
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Add the URL and API key for each AI service. Every change is applied live to the engine — no restart needed.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleReload}
            disabled={reloading}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition disabled:opacity-50 cursor-pointer shadow-xs"
          >
            <RefreshCw size={14} className={reloading ? 'animate-spin' : ''} />
            Reload Now
          </button>
          <button
            onClick={() => handleOpenCreate()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-900/20 transition cursor-pointer"
          >
            <Plus size={15} />
            Add New API
          </button>
        </div>
      </div>

      {loading && providers.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-44 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse p-5" />
          ))}
        </div>
      ) : providers.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900">
          <KeyRound className="mx-auto text-slate-300 dark:text-slate-700 mb-3" size={36} />
          <p className="text-slate-500 dark:text-slate-400 font-medium text-sm">No AI providers configured yet.</p>
          <button
            onClick={() => handleOpenCreate()}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs cursor-pointer"
          >
            <Plus size={14} /> Add your first API key
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* ── Chat Modes (fixed 4) ── */}
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">
              <Cpu size={13} className="text-indigo-500" />
              Chat Modes (fixed tiers)
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {liveTiers.map(({ key, meta, list, all }) => (
                <div key={key} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className={`w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center ${meta.color}`}>
                        {meta.icon}
                      </span>
                      <div>
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">{meta.label}</div>
                        <div className="text-[10px] text-slate-400">{meta.desc}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-black ${list.length ? 'text-emerald-500' : 'text-rose-400'}`}>{list.length}</div>
                      <div className="text-[9px] text-slate-400 uppercase tracking-wider">active</div>
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {all.length === 0 ? (
                      <div className="text-[11px] text-slate-400 italic">No APIs configured for this mode — add one to enable it.</div>
                    ) : (
                      all.map(p => (
                        <div key={p._id} className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800/60">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className={`inline-block h-2 w-2 rounded-full ${p.enabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">{TIER_META[p.tier].label}</span>
                            </div>
                            <div className="text-[10px] text-slate-400 truncate">{p.model}{p.api_base ? ` · ${p.api_base}` : ''}</div>
                          </div>
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button onClick={() => toggleEnabled(p)} disabled={actionId === p._id} title={p.enabled ? 'Disable' : 'Enable'}
                              className={`p-1.5 rounded-lg transition cursor-pointer disabled:opacity-40 ${p.enabled ? 'text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                              <Power size={12} />
                            </button>
                            <button onClick={() => handleOpenEdit(p)} title="Edit"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer">
                              <Edit2 size={12} />
                            </button>
                            <button onClick={() => handleDelete(p)} disabled={actionId === p._id} title="Delete"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition cursor-pointer disabled:opacity-40">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <button
                    onClick={() => handleOpenCreate(key)}
                    className="mt-3 w-full flex items-center justify-center gap-1.5 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl py-2 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition cursor-pointer"
                  >
                    <Plus size={12} /> Add API for {meta.label.split(' ')[0]}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* ── Auxiliary Tiers ── */}
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">
              <Globe size={13} className="text-cyan-500" />
              Supporting Services (summary, vision, speech, embeddings)
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              {auxTiers.map(tier => {
                const meta = TIER_META[tier.key]
                const list = providers.filter(p => p.tier === tier.key)
                return (
                  <div key={tier.key} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
                    <div className="flex items-center gap-2.5">
                      <span className={`w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center ${meta.color}`}>{meta.icon}</span>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{meta.label}</div>
                        <div className={`text-[10px] font-black ${list.some(p => p.enabled) ? 'text-emerald-500' : 'text-rose-400'}`}>
                          {list.some(p => p.enabled) ? `${list.filter(p => p.enabled).length} active` : 'not configured'}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 space-y-1.5">
                      {list.length === 0 ? (
                        <div className="text-[10px] text-slate-400 italic">No API set.</div>
                      ) : (
                        list.map(p => (
                          <div key={p._id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800/60">
                            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 truncate">{TIER_META[p.tier].label}</span>
                            <div className="flex items-center gap-0.5 shrink-0">
                              <button onClick={() => toggleEnabled(p)} disabled={actionId === p._id} title={p.enabled ? 'Disable' : 'Enable'}
                                className={`p-1 rounded transition cursor-pointer disabled:opacity-40 ${p.enabled ? 'text-emerald-500' : 'text-slate-400'}`}>
                                <Power size={11} />
                              </button>
                              <button onClick={() => handleOpenEdit(p)} title="Edit"
                                className="p-1 rounded text-slate-400 hover:text-indigo-600 transition cursor-pointer">
                                <Edit2 size={11} />
                              </button>
                              <button onClick={() => handleDelete(p)} disabled={actionId === p._id} title="Delete"
                                className="p-1 rounded text-slate-400 hover:text-rose-600 transition cursor-pointer disabled:opacity-40">
                                <Trash2 size={11} />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    <button
                      onClick={() => handleOpenCreate(tier.key)}
                      className="mt-3 w-full flex items-center justify-center gap-1 text-[10px] font-bold text-cyan-600 dark:text-cyan-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-lg py-1.5 hover:bg-cyan-50 dark:hover:bg-cyan-500/10 transition cursor-pointer"
                    >
                      <Plus size={11} /> Add
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Create / Edit Modal ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="absolute inset-0 bg-slate-900/50 dark:bg-slate-950/70 backdrop-blur-xs" onClick={handleClose} />
          <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-500">
                  <KeyRound size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                    {editingId ? 'Edit API Provider' : 'Add AI API'}
                  </h3>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {editingId ? 'Update the URL and key. Leave key blank to keep the current one.' : 'Register a new endpoint for one of the fixed tiers.'}
                  </p>
                </div>
              </div>
              <button onClick={handleClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 overflow-y-auto pr-1 flex-1 custom-scrollbar">
              {/* Tier selector */}
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Target Tier / Mode *</label>
                <select
                  value={form.tier}
                  onChange={e => setForm({ ...form, tier: e.target.value as AiTierKey })}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                >
                  {tiers.length ? tiers.map(t => (
                    <option key={t.key} value={t.key}>{TIER_META[t.key]?.label ?? t.label}{t.type === 'mode' ? ' (Chat Mode)' : ''}</option>
                  )) : (Object.keys(TIER_META) as AiTierKey[]).map(k => (
                    <option key={k} value={k}>{TIER_META[k].label}</option>
                  ))}
                </select>
              </div>

              {/* Display name */}

              {/* Provider preset */}
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Provider Format</label>
                <select
                  value={form.provider}
                  onChange={e => handleProviderChange(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                >
                  {PROVIDER_PRESETS.map(p => (
                    <option key={p.value} value={p.value}>{p.value}</option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  Select the provider used to prefix the model name. Pick “custom” and type the full litellm model string to override.
                </p>
              </div>

              {/* Model */}
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Model ID *</label>
                <input
                  type="text"
                  required
                  placeholder={PROVIDER_PRESETS.find(p => p.value === form.provider)?.placeholder ?? 'model-id'}
                  value={form.model}
                  onChange={e => setForm({ ...form, model: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  {form.provider === 'custom' ? 'Full litellm model string (e.g. openai/my-model, groq/llama-3.1-8b-instant).' : `Will be sent as "${form.provider}/${form.model || '…'}".`}
                </p>
              </div>

              {/* Base URL */}
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  API Base URL <span className="normal-case font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="https://api.provider.com/v1"
                  value={form.api_base}
                  onChange={e => setForm({ ...form, api_base: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              {/* API key */}
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  API Key {editingId ? <span className="normal-case font-normal">(blank = keep current)</span> : '*'}
                </label>
                <input
                  type="password"
                  placeholder={editingId ? '•••••••• (unchanged)' : 'sk-…'}
                  value={form.api_key}
                  onChange={e => setForm({ ...form, api_key: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              {/* Priority + enabled */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Priority (failover)</label>
                  <input
                    type="number"
                    min={0}
                    value={form.priority}
                    onChange={e => setForm({ ...form, priority: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <p className="text-[9px] text-slate-400 mt-1">Lower = tried first.</p>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2.5 cursor-pointer pb-2">
                    <input type="checkbox" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} className="accent-indigo-600 h-4 w-4" />
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Enabled</span>
                  </label>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
                <button type="button" onClick={handleClose} disabled={saving} className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-900/20 transition disabled:opacity-50 cursor-pointer">
                  {saving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                  {saving ? 'Applying…' : editingId ? 'Save & Apply' : 'Add & Apply'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default AiProvidersTab
