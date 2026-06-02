// src/components/Admin/HealthOverview.tsx
interface TopStats {
  total: number
  rate: number
  avgLat: number | null
  cooling: number
}

interface HealthOverviewProps {
  loading: boolean
  totalCost: number
  stats: TopStats | null
}

const fmtNum = (n: number | null) => (n == null ? '—' : n.toLocaleString())
const fmtMs = (ms: number | null) => {
  if (ms == null) return '—'
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`
}

export const HealthOverview = ({ loading, totalCost, stats }: HealthOverviewProps) => {
  const metrics = [
    { label: 'Total Calls', value: loading ? '…' : fmtNum(stats?.total ?? null) },
    { label: 'Success Rate', value: loading ? '…' : `${stats?.rate ?? '—'}%` },
    { label: 'Avg Latency', value: loading ? '…' : fmtMs(stats?.avgLat ?? null) },
    { label: 'Total Cost', value: loading ? '…' : `$${totalCost.toFixed(2)}` },
    { 
      label: 'Models Cooling', 
      value: loading ? '…' : String(stats?.cooling ?? '—'),
      danger: (stats?.cooling ?? 0) > 0 
    },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4">
      {metrics.map(m => (
        <div key={m.label} className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-1">
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{m.label}</p>
          <p className={`text-2xl font-extrabold tracking-tight ${m.danger ? 'text-rose-500' : 'text-slate-950 dark:text-white'}`}>
            {m.value}
          </p>
        </div>
      ))}
    </div>
  )
}