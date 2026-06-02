import { useEffect, useState, useCallback } from 'react'
import { Users, MessageSquare, Clock, ShieldCheck, RefreshCw } from 'lucide-react'
import { getAdminStats } from '../../API/Admin/AdminStats'
// UPDATED: Import the real implementation function alongside your structural interfaces
import { getAdminMetrics } from '../../API/Admin/AdminLogs'
import type { AdminStats } from '../../API/Admin/AdminStats'
import type { MetricsResponse } from '../../API/Admin/AdminLogs'

interface Props {
  onExpired: () => void
}

const OverviewTab = ({ onExpired }: Props) => {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      // Now fires clean concurrent API network requests to your real routes
      const [s, m] = await Promise.all([getAdminStats(), getAdminMetrics()])
      setStats(s)
      setMetrics(m)
    } catch (err: any) {
      const msg = err.message?.toLowerCase() || ''
      const isAuthError = msg.includes('expired') || msg.includes('unauthorized') || msg.includes('denied')

      if (isAuthError) {
        localStorage.removeItem('accessToken')
        sessionStorage.removeItem('accessToken')
        onExpired()
      } else {
        setError(err.message || 'Failed to load data')
      }
    } finally {
      setLoading(false)
    }
  }, [onExpired])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const statCards = [
    {
      label: 'Total Users',
      value: stats?.totalUsers ?? '—',
      icon: <Users size={20} />,
      color: 'blue',
    },
    {
      label: 'Total Chats',
      value: stats?.totalChats ?? '—',
      icon: <MessageSquare size={20} />,
      color: 'indigo',
    },
    {
      label: 'Avg AI Latency',
      value: stats ? `${(stats.avgLatency / 1000).toFixed(2)}s` : '—',
      icon: <Clock size={20} />,
      color: 'amber',
      bar: stats ? Math.min((stats.avgLatency / 10000) * 100, 100) : 0,
      barColor: 'bg-amber-500',
    },
    {
      label: 'Success Rate',
      value: stats ? `${stats.successRate}%` : '—',
      icon: <ShieldCheck size={20} />,
      color: 'emerald',
      bar: stats?.successRate ?? 0,
      barColor: 'bg-emerald-500',
    },
  ]

  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-500/20',
    indigo: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-500/20',
    amber: 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-500/20',
    emerald: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20',
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">System Overview</h2>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 px-3 py-1.5 rounded-lg transition cursor-pointer disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="text-sm text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20 rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        {statCards.map((c) => (
          <div
            key={c.label}
            className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition space-y-4 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{c.label}</span>
              <div className={`p-2 rounded-xl border ${colorMap[c.color]}`}>{c.icon}</div>
            </div>
            <p className="text-3xl font-extrabold text-slate-950 dark:text-white tracking-tight">{loading ? '…' : c.value}</p>
            {c.bar !== undefined && (
              <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`${c.barColor} h-full rounded-full transition-all duration-700`}
                  style={{ width: `${c.bar}%` }}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Weekly Traffic Bar Chart */}
        <div className="lg:col-span-2 p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-300">Weekly Traffic — Success vs Failed</h3>
          {metrics && metrics.dailyRequests.length > 0 ? (
            <div className="h-52 flex items-end gap-3 px-2">
              {metrics.dailyRequests.map((day) => {
                const maxCount = Math.max(...metrics.dailyRequests.map(d => d.count), 1)
                const heightPct = Math.max(Math.round((day.count / maxCount) * 100), 4)
                const successPct = day.count > 0 ? Math.round((day.success / day.count) * 100) : 100
                const label = new Date(day._id).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })
                return (
                  <div key={day._id} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                    
                    {/* Tooltip on Hover */}
                    <div className="absolute bottom-full mb-2 bg-slate-800 dark:bg-slate-950 text-white text-xs px-2.5 py-1.5 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 w-28 text-center border border-slate-700">
                      <p className="font-semibold text-slate-300">{day._id}</p>
                      <p className="text-blue-400 font-bold mt-0.5">{day.count} Total</p>
                      <p className="text-emerald-400 text-[10px]">{day.success} Success</p>
                      {day.failed > 0 && <p className="text-rose-400 text-[10px]">{day.failed} Failed</p>}
                    </div>

                    {/* Stacked bar */}
                    <div
                      className="w-full rounded-t-lg overflow-hidden relative cursor-pointer bg-slate-100 dark:bg-slate-800 hover:opacity-90 transition-all"
                      style={{ height: `${heightPct}%` }}
                    >
                      {/* Success (bottom, indigo/blue) */}
                      <div
                        className="w-full bg-linear-to-t from-indigo-600 to-indigo-400 dark:from-indigo-500 dark:to-indigo-400 absolute bottom-0"
                        style={{ height: `${successPct}%` }}
                      />
                      {/* Failed (top, rose) */}
                      {day.failed > 0 && (
                        <div
                          className="w-full bg-linear-to-t from-rose-600 to-rose-500 absolute top-0"
                          style={{ height: `${100 - successPct}%` }}
                        />
                      )}
                    </div>
                    <span className="text-[10px] md:text-xs font-semibold text-slate-400 mt-2 text-center w-full truncate">{label}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="h-52 flex items-center justify-center text-sm text-slate-400 dark:text-slate-600">
              {loading ? 'Loading…' : 'No traffic in the last 7 days'}
            </div>
          )}
          {/* Legend */}
          <div className="flex items-center gap-5 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 inline-block" /> Success</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block" /> Failed</span>
          </div>
        </div>

        {/* Action Types Breakdown */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-300">Top Actions</h3>
          {metrics && metrics.actionTypes.length > 0 ? (
            <div className="space-y-3.5 overflow-y-auto max-h-52 pr-1">
              {metrics.actionTypes.map((a, idx) => {
                const total = metrics.actionTypes.reduce((acc, x) => acc + x.count, 0)
                const pct = Math.round((a.count / total) * 100)
                const barColors = ['bg-indigo-500', 'bg-violet-500', 'bg-blue-500', 'bg-purple-500', 'bg-fuchsia-500']
                return (
                  <div key={a._id} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-700 dark:text-slate-300 font-semibold truncate max-w-36">{a._id || 'SYSTEM'}</span>
                      <span className="text-slate-400 dark:text-slate-500 font-medium">{a.count} ({pct}%)</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`${barColors[idx % barColors.length]} h-full rounded-full`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="h-52 flex items-center justify-center text-sm text-slate-400 dark:text-slate-600">
              {loading ? 'Loading…' : 'No actions recorded'}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

export default OverviewTab;