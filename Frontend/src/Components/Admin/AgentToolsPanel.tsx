import { Terminal, Activity, Search } from 'lucide-react'
import type { ToolCallLog, ToolMetric } from '../../API/Admin/AdminLlm'

interface AgentToolsPanelProps {
  loading: boolean
  logs: ToolCallLog[]
  stats: ToolMetric[]
  statusFilter: 'running' | 'completed' | 'failed' | ''
  nameFilter: string
  onStatusFilterChange: (v: 'running' | 'completed' | 'failed' | '') => void
  onNameFilterChange: (v: string) => void
}

export const AgentToolsPanel = ({
  loading,
  logs,
  stats,
  statusFilter,
  nameFilter,
  onStatusFilterChange,
  onNameFilterChange,
}: AgentToolsPanelProps) => {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      
      {/* Aggregated Real-time Tool Reliability Stats Column */}
      <div className="space-y-3 xl:col-span-1">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-200">
          <Activity size={14} className="text-emerald-500" />
          <span>Tool Distribution & Reliability Metrics</span>
        </div>
        
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 divide-y divide-slate-100 dark:divide-slate-800/60 max-h-115 overflow-y-auto">
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
                    <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 px-1.5 py-0.5 rounded">{metric._id}</span>
                    <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${successRate >= 90 ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600' : 'bg-amber-50 dark:bg-amber-500/10 text-amber-600'}`}>{successRate}% SR</span>
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
            <div className="text-center py-6 text-xs text-slate-400 font-medium uppercase tracking-wider">No tool usage recorded.</div>
          )}
        </div>
      </div>

      {/* Granular Filterable MongoDB Tool Live Execution Event Feeds */}
      <div className="space-y-3 xl:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-200">
            <Terminal size={14} className="text-indigo-500" />
            <span>Agent Tool Live Execution Logs</span>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={11} className="absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Filter Tool..."
                value={nameFilter}
                onChange={e => onNameFilterChange(e.target.value)}
                className="pl-7 pr-3 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 transition placeholder-slate-400 max-w-36"
              />
            </div>
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
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-950 p-4 font-mono text-xs text-slate-300 space-y-2.5 max-h-103.75 overflow-y-auto shadow-inner">
          {loading && logs.length === 0 ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-4 bg-slate-900 rounded w-full animate-pulse" />
            ))
          ) : logs.length > 0 ? (
            logs.map((log) => (
              <div key={log._id} className="text-[11px] leading-relaxed border-b border-slate-900/60 pb-2 last:border-none last:pb-0">
                <span className="text-slate-500">[{new Date(log.timestamp).toLocaleTimeString()}]</span>{' '}
                <span className="text-indigo-400 font-bold">{log.tool_name}</span>{' '}
                <span className={`inline-flex items-center gap-0.5 px-1 rounded text-[9px] uppercase tracking-wide font-extrabold ${
                  log.tool_status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' :
                  log.tool_status === 'failed' ? 'bg-rose-500/10 text-rose-400' : 'bg-indigo-500/10 text-indigo-400 animate-pulse'
                }`}>
                  {log.tool_status}
                </span>
                <div className="text-slate-400 pl-4 truncate text-[10px] mt-0.5">
                  <span className="text-slate-600 font-bold">ARGS:</span> {log.tool_args}
                </div>
                {log.tool_result && (
                  <div className="text-slate-500 pl-4 truncate text-[10px]">
                    <span className="text-slate-600 font-bold">RESULT:</span> {log.tool_result}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="text-center py-12 text-slate-600 font-semibold text-xs uppercase tracking-wider">No system tool call records detected.</div>
          )}
        </div>
      </div>
    </div>
  )
}