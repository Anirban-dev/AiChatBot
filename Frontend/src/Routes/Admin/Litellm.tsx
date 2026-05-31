// src/Routes/Admin/LLMTab.tsx
import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Snowflake, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { clearAdminToken, getLLMEvents, getLLMStatus } from '../../API/Admin'

interface ModelStat {
  tier: string
  success: number
  failure: number
  retries: number
  avg_latency_ms: number | null
  p95_latency_ms: number | null
  cost: number
  prompt_tokens: number
  completion_tokens: number
  cooling_down: boolean
}

interface LLMEvent {
  type: 'success' | 'failure' | 'retry'
  model: string
  tier: string
  latency_ms: number | null
  prompt_tokens: number | null
  completion_tokens: number | null
  cost: number | null
  error: string | null
  timestamp: string
}

interface LLMStatus {
  model_stats: Record<string, ModelStat>
  total_cost: number
  tiers: string[]
}

interface Props {
  onExpired: () => void
}

const TIER_COLORS: Record<string, string> = {
  highllm:    'text-blue-500 dark:text-blue-400',
  lowllm:     'text-emerald-500 dark:text-emerald-400',
  summaryllm: 'text-amber-500 dark:text-amber-400',
  visionllm:  'text-pink-500 dark:text-pink-400',
}

const fmtMs = (ms: number | null) => {
  if (ms == null) return '—'
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`
}
const fmtCost = (c: number | null) => {
  if (c == null) return '—'
  return `$${c.toFixed(4)}`
}
const fmtNum = (n: number | null) => {
  if (n == null) return '—'
  return n.toLocaleString()
}
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

const LLMTab = ({ onExpired }: Props) => {
  const [status, setStatus] = useState<LLMStatus | null>(null)
  const [events, setEvents] = useState<LLMEvent[]>([])
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [loadingEvents, setLoadingEvents] = useState(true)
  const [error, setError] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [tierFilter, setTierFilter] = useState('')
  const [hoursFilter, setHoursFilter] = useState('24')

  const handleError = (err: any) => {
    if (err.message?.includes('expired')) {
      clearAdminToken()
      onExpired()
    } else {
      setError(err.message || 'Failed to load data')
    }
  }

  const fetchStatus = useCallback(async () => {
  setLoadingStatus(true)
  try {
    setStatus(await getLLMStatus())
  } catch (err: any) {
    handleError(err)
  } finally {
    setLoadingStatus(false)
  }
}, [])

  const fetchEvents = useCallback(async () => {
  setLoadingEvents(true)
  try {
    const data = await getLLMEvents(parseInt(hoursFilter), typeFilter, tierFilter)
    setEvents(data.events)
  } catch (err: any) {
    handleError(err)
  } finally {
    setLoadingEvents(false)
  }
}, [hoursFilter, typeFilter, tierFilter])

  useEffect(() => { fetchStatus() }, [fetchStatus])
  useEffect(() => { fetchEvents() }, [fetchEvents])

  const handleRefresh = () => {
    setError('')
    fetchStatus()
    fetchEvents()
  }

  // ── derived top stats ──────────────────────────────────────────────────────
  const topStats = (() => {
    if (!status) return null
    const models = Object.values(status.model_stats)
    const total   = models.reduce((a, m) => a + m.success + m.failure, 0)
    const success = models.reduce((a, m) => a + m.success, 0)
    const rate    = total > 0 ? Math.round((success / total) * 100) : 100
    const lats    = models.filter(m => m.avg_latency_ms).map(m => m.avg_latency_ms as number)
    const avgLat  = lats.length ? Math.round(lats.reduce((a, b) => a + b, 0) / lats.length) : null
    const cooling = models.filter(m => m.cooling_down).length
    return { total, rate, avgLat, cooling }
  })()

  // ── filtered events ────────────────────────────────────────────────────────
  const filteredEvents = events
    .filter(e => !typeFilter || e.type === typeFilter)
    .filter(e => !tierFilter || e.tier === tierFilter)
    .slice(0, 50)

  const allTiers = status ? [...new Set(Object.values(status.model_stats).map(m => m.tier))] : []

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">LLM Health</h2>
        <button
          onClick={handleRefresh}
          disabled={loadingStatus || loadingEvents}
          className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 px-3 py-1.5 rounded-lg transition cursor-pointer disabled:opacity-50"
        >
          <RefreshCw size={13} className={loadingStatus || loadingEvents ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="text-sm text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20 rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {/* Top stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4">
        {[
          { label: 'Total calls',    value: loadingStatus ? '…' : fmtNum(topStats?.total ?? null) },
          { label: 'Success rate',   value: loadingStatus ? '…' : `${topStats?.rate ?? '—'}%` },
          { label: 'Avg latency',    value: loadingStatus ? '…' : fmtMs(topStats?.avgLat ?? null) },
          { label: 'Total cost',     value: loadingStatus ? '…' : `$${(status?.total_cost ?? 0).toFixed(2)}` },
          { label: 'Models cooling', value: loadingStatus ? '…' : String(topStats?.cooling ?? '—'),
            danger: (topStats?.cooling ?? 0) > 0 },
        ].map(c => (
          <div key={c.label} className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{c.label}</p>
            <p className={`text-2xl font-extrabold tracking-tight ${c.danger ? 'text-rose-500' : 'text-slate-950 dark:text-white'}`}>
              {c.value}
            </p>
          </div>
        ))}
      </div>

      {/* Per-model cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {loadingStatus
          ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3 shadow-sm">
                {Array.from({ length: 4 }).map((_, j) => (
                  <div key={j} className="h-3 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                ))}
              </div>
            ))
          : status && Object.entries(status.model_stats).map(([model, s]) => {
              const total   = s.success + s.failure
              const rate    = total > 0 ? Math.round((s.success / total) * 100) : 100
              const isDeg   = !s.cooling_down && rate < 95

              return (
                <div
                  key={model}
                  className={`rounded-2xl border bg-white dark:bg-slate-900 p-5 space-y-4 shadow-sm transition ${
                    s.cooling_down
                      ? 'border-rose-300 dark:border-rose-500/40'
                      : isDeg
                      ? 'border-amber-300 dark:border-amber-500/40'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  {/* Card header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-slate-800 dark:text-slate-200 truncate">{model}</p>
                      <p className={`text-xs font-medium ${TIER_COLORS[s.tier] ?? 'text-slate-400'}`}>{s.tier}</p>
                    </div>
                    <span className={`shrink-0 flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full ${
                      s.cooling_down
                        ? 'bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400'
                        : isDeg
                        ? 'bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400'
                        : 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    }`}>
                      {s.cooling_down
                        ? <><Snowflake size={11} /> cooling</>
                        : isDeg
                        ? <><AlertTriangle size={11} /> degraded</>
                        : <><CheckCircle2 size={11} /> healthy</>}
                    </span>
                  </div>

                  {/* Latency + success rate */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[
                      { label: 'avg latency', value: fmtMs(s.avg_latency_ms) },
                      { label: 'p95 latency', value: fmtMs(s.p95_latency_ms) },
                      { label: 'success',     value: `${rate}%` },
                    ].map(item => (
                      <div key={item.label}>
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{item.value}</p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500">{item.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Success / failure / retry bars */}
                  <div className="space-y-2">
                    {[
                      { label: 'success', count: s.success, color: 'bg-emerald-500', pct: total > 0 ? (s.success / total) * 100 : 100 },
                      { label: 'failure', count: s.failure, color: 'bg-rose-500',    pct: total > 0 ? Math.min((s.failure / total) * 500, 100) : 0 },
                      { label: 'retries', count: s.retries, color: 'bg-amber-500',   pct: total > 0 ? Math.min((s.retries / total) * 500, 100) : 0 },
                    ].map(bar => (
                      <div key={bar.label} className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-400 dark:text-slate-500 w-12 shrink-0">{bar.label}</span>
                        <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div className={`${bar.color} h-full rounded-full`} style={{ width: `${bar.pct.toFixed(1)}%` }} />
                        </div>
                        <span className="text-[11px] text-slate-400 dark:text-slate-500 w-10 text-right shrink-0">
                          {fmtNum(bar.count)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Tokens + cost footer */}
                  <div className="flex justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 dark:text-slate-500">
                    <span>{fmtNum((s.prompt_tokens ?? 0) + (s.completion_tokens ?? 0))} tokens</span>
                    <span>{fmtCost(s.cost)}</span>
                  </div>
                </div>
              )
            })
        }
      </div>

      {/* Events log */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Recent Events</p>

          {/* Filters */}
          {[
            {
              id: 'type', value: typeFilter, onChange: setTypeFilter,
              options: [['', 'All types'], ['success', 'Success'], ['failure', 'Failure'], ['retry', 'Retry']],
            },
            {
              id: 'tier', value: tierFilter, onChange: setTierFilter,
              options: [['', 'All tiers'], ...allTiers.map(t => [t, t])],
            },
            {
              id: 'hours', value: hoursFilter, onChange: setHoursFilter,
              options: [['1', 'Last 1h'], ['6', 'Last 6h'], ['24', 'Last 24h'], ['168', 'Last 7d']],
            },
          ].map(f => (
            <select
              key={f.id}
              value={f.value}
              onChange={e => f.onChange(e.target.value)}
              className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition appearance-none cursor-pointer"
            >
              {f.options.map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          ))}
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-208">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  <th className="px-5 py-3.5 text-left">Type</th>
                  <th className="px-5 py-3.5 text-left">Tier</th>
                  <th className="px-5 py-3.5 text-left">Model</th>
                  <th className="px-5 py-3.5 text-right">Latency</th>
                  <th className="px-5 py-3.5 text-right">Tokens</th>
                  <th className="px-5 py-3.5 text-right">Cost</th>
                  <th className="px-5 py-3.5 text-left">Error</th>
                  <th className="px-5 py-3.5 text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/70">
                {loadingEvents
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 8 }).map((_, j) => (
                          <td key={j} className="px-5 py-3.5">
                            <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : filteredEvents.length > 0
                  ? filteredEvents.map((e, i) => (
                      <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition">
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            e.type === 'success'
                              ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                              : e.type === 'failure'
                              ? 'bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400'
                              : 'bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400'
                          }`}>
                            {e.type === 'success'
                              ? <CheckCircle2 size={10} />
                              : e.type === 'failure'
                              ? <XCircle size={10} />
                              : <RefreshCw size={10} />}
                            {e.type}
                          </span>
                        </td>
                        <td className={`px-5 py-3.5 text-xs font-medium ${TIER_COLORS[e.tier] ?? 'text-slate-400'}`}>
                          {e.tier}
                        </td>
                        <td className="px-5 py-3.5 font-mono text-[11px] text-slate-400 dark:text-slate-500 max-w-40 truncate">
                          {e.model}
                        </td>
                        <td className="px-5 py-3.5 text-right text-xs font-semibold text-slate-700 dark:text-slate-300">
                          {fmtMs(e.latency_ms)}
                        </td>
                        <td className="px-5 py-3.5 text-right text-xs text-slate-500 dark:text-slate-400">
                          {e.prompt_tokens != null
                            ? fmtNum((e.prompt_tokens ?? 0) + (e.completion_tokens ?? 0))
                            : '—'}
                        </td>
                        <td className="px-5 py-3.5 text-right text-xs text-slate-500 dark:text-slate-400">
                          {fmtCost(e.cost)}
                        </td>
                        <td className="px-5 py-3.5 text-xs text-rose-500 dark:text-rose-400 max-w-40 truncate" title={e.error ?? ''}>
                          {e.error ?? '—'}
                        </td>
                        <td className="px-5 py-3.5 text-right text-[11px] text-slate-400 dark:text-slate-500 whitespace-nowrap">
                          {fmtTime(e.timestamp)}
                        </td>
                      </tr>
                    ))
                  : (
                      <tr>
                        <td colSpan={8} className="text-center py-12 text-slate-400 dark:text-slate-600 font-medium">
                          No events match the current filters.
                        </td>
                      </tr>
                    )
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  )
}

export default LLMTab