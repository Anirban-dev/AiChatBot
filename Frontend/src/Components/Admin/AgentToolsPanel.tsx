import { useState } from 'react'
import { Terminal, Activity, Search, Trash2, ShieldAlert, User } from 'lucide-react'
import type { ToolCallLog, ToolMetric } from '../../API/Admin/AdminLlm'

interface AgentToolsPanelProps {
  loading: boolean
  logs: ToolCallLog[]
  stats: ToolMetric[]
  statusFilter: 'running' | 'completed' | 'failed' | ''
  nameFilter: string
  userFilter: string
  onStatusFilterChange: (v: 'running' | 'completed' | 'failed' | '') => void
  onNameFilterChange: (v: string) => void
  onUserFilterChange: (v: string) => void
  onDeleteLog: (id: string) => Promise<void>
  onClearAll: () => Promise<void>
}

function resolveUser(userId: ToolCallLog['userId']): { name: string; email: string } | null {
  if (!userId) return null
  if (typeof userId === 'object') return { name: userId.name, email: userId.email }
  return null
}

export const AgentToolsPanel = ({
  loading,
  logs,
  stats,
  statusFilter,
  nameFilter,
  userFilter,
  onStatusFilterChange,
  onNameFilterChange,
  onUserFilterChange,
  onDeleteLog,
  onClearAll,
}: AgentToolsPanelProps) => {
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try { await onDeleteLog(id) } finally { setDeletingId(null) }
  }

  const handleClearAll = async () => {
    if (!confirmClear) {
      setConfirmClear(true)
      setTimeout(() => setConfirmClear(false), 4000)
      return
    }
    setConfirmClear(false)
    await onClearAll()
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

      {/* ── Tool Stats Column ──────────────────────────────────────────────── */}
      <div className="space-y-3 xl:col-span-1">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-200">
          <Activity size={14} className="text-emerald-500" />
          <span>Tool Distribution &amp; Reliability Metrics</span>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 divide-y divide-slate-100 dark:divide-slate-800/60 max-h-[460px] overflow-y-auto">
          {loading && stats.length === 0 ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="pt-3 first:pt-0 space-y-2 animate-pulse">
                <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-1/3" />
                <div className="h-3 bg-slate-50 dark:bg-slate-800/60 rounded w-2/3" />
              </div>
            ))
          ) : stats.length > 0 ? (
            stats.map((metric) => {
              const successRate = metric.total_invocations > 0
                ? Math.round((metric.completed / metric.total_invocations) * 100)
                : 100
              return (
                <div key={metric._id} className="pt-3 first:pt-0 space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 px-1.5 py-0.5 rounded">
                      {metric._id}
                    </span>
                    <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${
                      successRate >= 90
                        ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600'
                        : 'bg-amber-50 dark:bg-amber-500/10 text-amber-600'
                    }`}>
                      {successRate}% SR
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1 text-[11px] font-semibold text-slate-400">
                    <div>Total: <span className="text-slate-700 dark:text-slate-300 font-bold">{metric.total_invocations}</span></div>
                    <div className="text-emerald-500">Done: <span className="font-bold">{metric.completed}</span></div>
                    <div className="text-rose-500">Fail: <span className="font-bold">{metric.failed}</span></div>
                    <div className="text-indigo-500">Run: <span className="font-bold">{metric.running}</span></div>
                  </div>
                </div>
              )
            })
          ) : (
            <div className="text-center py-6 text-xs text-slate-400 font-medium uppercase tracking-wider">
              No tool usage recorded.
            </div>
          )}
        </div>
      </div>

      {/* ── Tool Logs Feed ────────────────────────────────────────────────── */}
      <div className="space-y-3 xl:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-200">
            <Terminal size={14} className="text-indigo-500" />
            <span>Agent Tool Execution Logs</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Tool name filter */}
            <div className="relative">
              <Search size={11} className="absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Filter tool…"
                value={nameFilter}
                onChange={e => onNameFilterChange(e.target.value)}
                className="pl-7 pr-3 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 transition placeholder-slate-400 max-w-36"
              />
            </div>

            {/* User filter */}
            <div className="relative">
              <User size={11} className="absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Filter by userId…"
                value={userFilter}
                onChange={e => onUserFilterChange(e.target.value)}
                className="pl-7 pr-3 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 transition placeholder-slate-400 max-w-40"
              />
            </div>

            {/* Status filter */}
            <select
              value={statusFilter}
              onChange={e => onStatusFilterChange(e.target.value as any)}
              className="px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 cursor-pointer"
            >
              <option value="">All Statuses</option>
              <option value="running">Running</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>

            {/* Clear All button */}
            {logs.length > 0 && (
              <button
                onClick={handleClearAll}
                className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-xl border transition cursor-pointer ${
                  confirmClear
                    ? 'bg-rose-600 text-white border-rose-600 hover:bg-rose-700'
                    : 'bg-white dark:bg-slate-900 text-rose-500 border-slate-200 dark:border-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/20'
                }`}
              >
                <ShieldAlert size={12} />
                <span>{confirmClear ? 'Confirm Purge?' : 'Clear All'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Log entries */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 font-mono text-xs text-slate-700 dark:text-slate-300 divide-y divide-slate-200 dark:divide-slate-900/60 max-h-[415px] overflow-y-auto shadow-inner">
          {loading && logs.length === 0 ? (
            <div className="p-4 space-y-2.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-full animate-pulse" />
              ))}
            </div>
          ) : logs.length > 0 ? (
            logs.map((log) => {
              const user = resolveUser(log.userId)
              return (
                <div key={log._id} className="group flex items-start gap-3 px-4 py-3 hover:bg-slate-100 dark:hover:bg-slate-900/60 transition">
                  {/* Content */}
                  <div className="flex-1 min-w-0 space-y-0.5">
                    {/* Header row */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-slate-400 dark:text-slate-500 text-[10px]">
                        [{new Date(log.timestamp).toLocaleTimeString()}]
                      </span>
                      <span className="text-indigo-600 dark:text-indigo-400 font-bold">{log.tool_name}</span>
                      <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wide font-extrabold ${
                        log.tool_status === 'completed'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : log.tool_status === 'failed'
                          ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                          : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 animate-pulse'
                      }`}>
                        {log.tool_status}
                      </span>
                      {/* User badge */}
                      {user ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                          <User size={8} />
                          {user.name || user.email}
                        </span>
                      ) : log.userId && typeof log.userId === 'string' ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                          <User size={8} />
                          {log.userId.slice(-8)}
                        </span>
                      ) : null}
                    </div>

                    {/* Args */}
                    <div className="text-slate-500 dark:text-slate-400 pl-1 text-[10px] truncate">
                      <span className="text-slate-600 dark:text-slate-500 font-bold">ARGS:</span>{' '}
                      {log.tool_args || '—'}
                    </div>

                    {/* Result */}
                    {log.tool_result && (
                      <div className="text-slate-500 dark:text-slate-500 pl-1 truncate text-[10px]">
                        <span className="text-slate-600 dark:text-slate-500 font-bold">RESULT:</span>{' '}
                        {log.tool_result}
                      </div>
                    )}
                  </div>

                  {/* Delete button */}
                  <button
                    onClick={() => handleDelete(log._id)}
                    disabled={deletingId === log._id}
                    className="shrink-0 opacity-0 group-hover:opacity-100 p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition cursor-pointer disabled:opacity-40"
                    title="Delete this log entry"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )
            })
          ) : (
            <div className="text-center py-12 text-slate-400 dark:text-slate-600 font-semibold text-xs uppercase tracking-wider">
              No system tool call records detected.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}