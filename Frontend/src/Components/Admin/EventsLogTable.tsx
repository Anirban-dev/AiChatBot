// src/components/Admin/EventsLogTable.tsx
import { CheckCircle2, XCircle, RefreshCw, SlidersHorizontal } from 'lucide-react'

export interface LLMEvent {
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

interface EventsLogTableProps {
  loading: boolean
  events: LLMEvent[]
  allTiers: string[]
  typeFilter: string
  tierFilter: string
  hoursFilter: string
  onTypeChange: (v: string) => void
  onTierChange: (v: string) => void
  onHoursChange: (v: string) => void
}

const TIER_COLORS: Record<string, string> = {
  highllm:    'text-blue-500 dark:text-blue-400',
  lowllm:     'text-emerald-500 dark:text-emerald-400',
  summaryllm: 'text-amber-500 dark:text-amber-400',
  visionllm:  'text-pink-500 dark:text-pink-400',
}

const fmtMs = (ms: number | null) => (ms == null ? '—' : ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`)
const fmtCost = (c: number | null) => (c == null ? '—' : `$${c.toFixed(4)}`)
const fmtNum = (n: number | null) => (n == null ? '—' : n.toLocaleString())
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

export const EventsLogTable = ({
  loading,
  events,
  allTiers,
  typeFilter,
  tierFilter,
  hoursFilter,
  onTypeChange,
  onTierChange,
  onHoursChange,
}: EventsLogTableProps) => {
  return (
    <div className="space-y-3">
      {/* Segment Context Query Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-200">
          <SlidersHorizontal size={14} className="text-indigo-500" />
          <span>Recent Execution Trace Log</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {[
            { value: typeFilter, onChange: onTypeChange, options: [['', 'All Types'], ['success', 'Success'], ['failure', 'Failure'], ['retry', 'Retry']] },
            { value: tierFilter, onChange: onTierChange, options: [['', 'All Tiers'], ...allTiers.filter(Boolean).map(t => [t, t.toUpperCase()])] },
            { value: hoursFilter, onChange: onHoursChange, options: [['1', 'Last 1h'], ['6', 'Last 6h'], ['24', 'Last 24h'], ['168', 'Last 7d']] },
          ].map((f, idx) => (
            <select
              key={idx}
              value={f.value}
              onChange={e => f.onChange(e.target.value)}
              className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 transition cursor-pointer"
            >
              {f.options.map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          ))}
        </div>
      </div>

      {/* Records Output Matrix Layer */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-4xl border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                <th className="px-5 py-3.5 text-left">Type</th>
                <th className="px-5 py-3.5 text-left">Tier</th>
                <th className="px-5 py-3.5 text-left">Model Architecture Identity</th>
                <th className="px-5 py-3.5 text-right">Latency</th>
                <th className="px-5 py-3.5 text-right">Payload Tokens</th>
                <th className="px-5 py-3.5 text-right">Cost</th>
                <th className="px-5 py-3.5 text-left">Trace Error Response</th>
                <th className="px-5 py-3.5 text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-5 py-3.5">
                        <div className="h-3.5 bg-slate-100 dark:bg-slate-800/80 rounded animate-pulse w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : events.length > 0 ? (
                events.map((e, i) => (
                  <tr key={i} className="hover:bg-slate-50/40 dark:hover:bg-slate-800/10 transition">
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${
                        e.type === 'success'
                          ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                          : e.type === 'failure'
                          ? 'bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400'
                          : 'bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400'
                      }`}>
                        {e.type === 'success' ? (
                          <CheckCircle2 size={10} />
                        ) : e.type === 'failure' ? (
                          <XCircle size={10} />
                        ) : (
                          <RefreshCw size={10} />
                        )}
                        {e.type}
                      </span>
                    </td>
                    <td className={`px-5 py-3.5 text-xs font-bold uppercase tracking-wider ${TIER_COLORS[e.tier] ?? 'text-slate-400'}`}>
                      {e.tier}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-500 dark:text-slate-400 max-w-xs truncate">
                      {e.model}
                    </td>
                    <td className="px-5 py-3.5 text-right text-xs font-bold text-slate-700 dark:text-slate-300">
                      {fmtMs(e.latency_ms)}
                    </td>
                    <td className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 dark:text-slate-400">
                      {e.prompt_tokens != null ? fmtNum(e.prompt_tokens + (e.completion_tokens ?? 0)) : '—'}
                    </td>
                    <td className="px-5 py-3.5 text-right text-xs font-mono font-medium text-slate-600 dark:text-slate-400">
                      {fmtCost(e.cost)}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-rose-500 dark:text-rose-400 max-w-xs truncate font-medium" title={e.error ?? ''}>
                      {e.error ?? '—'}
                    </td>
                    <td className="px-5 py-3.5 text-right text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap font-medium">
                      {fmtTime(e.timestamp)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-400 dark:text-slate-600 font-semibold text-xs uppercase tracking-wider">
                    No tracing records match your query filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}