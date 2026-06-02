// src/components/Admin/ModelCard.tsx
import { Snowflake, AlertTriangle, CheckCircle2 } from 'lucide-react'

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

export interface ModelStat {
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

interface ModelCardProps {
  modelName: string
  stats: ModelStat
}

const TIER_COLORS: Record<string, string> = {
  highllm:    'text-blue-500 dark:text-blue-400',
  lowllm:     'text-emerald-500 dark:text-emerald-400',
  summaryllm: 'text-amber-500 dark:text-amber-400',
  visionllm:  'text-pink-500 dark:text-pink-400',
}

const fmtNum = (n: number | null) => (n == null ? '—' : n.toLocaleString())
const fmtMs = (ms: number | null) => {
  if (ms == null) return '—'
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`
}

export const ModelCard = ({ modelName, stats }: ModelCardProps) => {
  const total = stats.success + stats.failure
  const rate = total > 0 ? Math.round((stats.success / total) * 100) : 100
  const isDegraded = !stats.cooling_down && rate < 95

  const performanceBars = [
    { label: 'success', count: stats.success, color: 'bg-emerald-500', pct: total > 0 ? (stats.success / total) * 100 : 100 },
    { label: 'failure', count: stats.failure, color: 'bg-rose-500', pct: total > 0 ? Math.min((stats.failure / total) * 500, 100) : 0 },
    { label: 'retries', count: stats.retries, color: 'bg-amber-500', pct: total > 0 ? Math.min((stats.retries / total) * 500, 100) : 0 },
  ]

  return (
    <div className={`rounded-2xl border bg-white dark:bg-slate-900 p-5 space-y-4 shadow-xs transition duration-200 ${
      stats.cooling_down
        ? 'border-rose-300 dark:border-rose-500/40 ring-1 ring-rose-500/5'
        : isDegraded
        ? 'border-amber-300 dark:border-amber-500/40 ring-1 ring-amber-500/5'
        : 'border-slate-200 dark:border-slate-800'
    }`}>
      {/* Upper Status Metadata Row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-sm text-slate-800 dark:text-slate-200 truncate">{modelName}</p>
          <p className={`text-[10px] font-bold uppercase tracking-wider mt-0.5 ${TIER_COLORS[stats.tier] ?? 'text-slate-400'}`}>
            {stats.tier}
          </p>
        </div>
        <span className={`shrink-0 flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wide ${
          stats.cooling_down
            ? 'bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400'
            : isDegraded
            ? 'bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400'
            : 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
        }`}>
          {stats.cooling_down ? (
            <><Snowflake size={11} /> cooling</>
          ) : isDegraded ? (
            <><AlertTriangle size={11} /> degraded</>
          ) : (
            <><CheckCircle2 size={11} /> healthy</>
          )}
        </span>
      </div>

      {/* Primary Analytics Window */}
      <div className="grid grid-cols-3 gap-1 text-center py-1 rounded-xl bg-slate-50/50 dark:bg-slate-950/20 border border-slate-100/50 dark:border-slate-800/40">
        {[
          { label: 'avg latency', value: fmtMs(stats.avg_latency_ms) },
          { label: 'p95 latency', value: fmtMs(stats.p95_latency_ms) },
          { label: 'success rate', value: `${rate}%` },
        ].map(item => (
          <div key={item.label} className="py-1.5">
            <p className="text-xs font-extrabold text-slate-800 dark:text-slate-200">{item.value}</p>
            <p className="text-[9px] text-slate-400 dark:text-slate-500 font-medium uppercase tracking-wider mt-0.5">{item.label}</p>
          </div>
        ))}
      </div>

      {/* Metrics Bar Distribution Matrix */}
      <div className="space-y-2">
        {performanceBars.map(bar => (
          <div key={bar.label} className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 w-12 shrink-0">{bar.label}</span>
            <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800/60 rounded-full overflow-hidden">
              <div className={`${bar.color} h-full rounded-full transition-all duration-300`} style={{ width: `${bar.pct.toFixed(1)}%` }} />
            </div>
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 w-10 text-right shrink-0">
              {fmtNum(bar.count)}
            </span>
          </div>
        ))}
      </div>

      {/* Resource Expense Summary Footer */}
      <div className="flex justify-between pt-3 border-t border-slate-100 dark:border-slate-800/60 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        <span>{fmtNum(stats.prompt_tokens + stats.completion_tokens)} tokens</span>
        <span className="text-slate-700 dark:text-slate-300">${stats.cost.toFixed(4)}</span>
      </div>
    </div>
  )
}