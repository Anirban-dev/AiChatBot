// src/Routes/Admin/LogsTab.tsx
import { useState, useEffect, useCallback } from 'react'
import { Search, Filter, ChevronLeft, ChevronRight, CheckCircle2, XCircle, RefreshCw, ChevronDown, ChevronUp, Trash2, AlertTriangle } from 'lucide-react'
import { getAdminLogs, deleteActivityLog, clearAllActivityLogs } from '../../API/Admin/AdminLogs'
import type { ActivityLog } from '../../API/Admin/AdminLogs'
import React from 'react'

interface Props {
  onExpired: () => void
}

const LogsTab = ({ onExpired }: Props) => {
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  
  // Track which log ID has its details panel open
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  const PAGE_SIZE = 15

  // Extract distinct actions dynamically to keep the dropdown filter up to date
  const standardActions = [
    'LOGIN', 'GOOGLE_LOGIN', 'SIGNUP', 'SEND_OTP', 
    'REFRESH_TOKEN', 'LOGOUT', 'AI_CHAT', 'AI_TOOL_CALL', 'DELETE_USER'
  ]

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getAdminLogs(search, statusFilter, actionFilter, page, PAGE_SIZE)
      setLogs(data.logs)
      setTotal(data.total)
    } catch (err: any) {
      const msg = err.message?.toLowerCase() || ''
      const isAuthError = msg.includes('expired') || msg.includes('unauthorized') || msg.includes('denied')

      if (isAuthError) {
        localStorage.removeItem('accessToken')
        sessionStorage.removeItem('accessToken')
        onExpired()
      } else {
        setError(err.message || 'Failed to load logs')
      }
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, actionFilter, page, onExpired])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const fmt = (d: string) =>
    new Date(d).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' })

  const methodColor = (m: string) => {
    if (m === 'POST') return 'bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400'
    if (m === 'DELETE') return 'bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400'
    if (m === 'PUT') return 'bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400'
    return 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
  }

  const toggleExpandRow = (id: string) => {
    setExpandedLogId(expandedLogId === id ? null : id)
  }

  const handleDelete = async (e: React.MouseEvent, logId: string) => {
    e.stopPropagation()
    setDeletingId(logId)
    try {
      await deleteActivityLog(logId)
      setLogs(prev => prev.filter(l => l._id !== logId))
      setTotal(t => t - 1)
    } catch { /* silently ignore */ }
    finally { setDeletingId(null) }
  }

  const handleClearAll = async () => {
    if (!confirmClear) { setConfirmClear(true); return }
    setClearing(true)
    try {
      await clearAllActivityLogs()
      setLogs([])
      setTotal(0)
      setPage(1)
    } catch { /* silently ignore */ }
    finally { setClearing(false); setConfirmClear(false) }
  }

  return (
    <div className="space-y-5">
      {/* Header Row */}
      <div className="flex items-center justify-between">
        <div />
        <button
          onClick={handleClearAll}
          disabled={clearing || logs.length === 0}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer disabled:opacity-40 ${
            confirmClear
              ? 'bg-rose-600 border-rose-600 text-white hover:bg-rose-700'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-rose-500 hover:border-rose-400 dark:hover:border-rose-600'
          }`}
          onBlur={() => setConfirmClear(false)}
        >
          {confirmClear
            ? <><AlertTriangle size={13} />Confirm — clear ALL logs</>  
            : <><Trash2 size={13} />{clearing ? 'Clearing…' : 'Clear All Logs'}</>
          }
        </button>
      </div>

      {/* Filter Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Search */}
        <div className="relative lg:col-span-2">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={15} />
          <input
            type="text"
            placeholder="Search action, path, method…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:focus:ring-indigo-500/40 focus:border-indigo-500 transition"
          />
        </div>

        {/* Action Filter */}
        <div className="relative">
          <Filter className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" size={13} />
          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(1) }}
            className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:focus:ring-indigo-500/40 focus:border-indigo-500 transition appearance-none cursor-pointer"
          >
            <option value="">All Actions</option>
            {standardActions.map(act => (
              <option key={act} value={act}>{act}</option>
            ))}
          </select>
        </div>

        {/* Status Filter */}
        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
            className="flex-1 px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:focus:ring-indigo-500/40 focus:border-indigo-500 transition appearance-none cursor-pointer"
          >
            <option value="">All Status</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
          </select>
          <button
            onClick={() => fetchLogs()}
            disabled={loading}
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition cursor-pointer disabled:opacity-40"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error && (
        <div className="text-sm text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20 rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-4xl">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                <th className="px-5 py-3.5 text-left w-20">Status</th>
                <th className="px-5 py-3.5 text-left">Action</th>
                <th className="px-5 py-3.5 text-left">Path</th>
                <th className="px-5 py-3.5 text-left">User</th>
                <th className="px-5 py-3.5 text-right">Latency</th>
                <th className="px-5 py-3.5 text-right">Time</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/70">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-5 py-4">
                        <div className="h-3.5 bg-slate-100 dark:bg-slate-800 rounded animate-pulse w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : logs.length > 0 ? (
                logs.map((log) => {
                  const isExpanded = expandedLogId === log._id;
                  return (
                    <React.Fragment key={log._id}>
                      {/* Base Row Data */}
                      <tr 
                        onClick={() => toggleExpandRow(log._id)}
                        className={`transition cursor-pointer select-none ${
                          isExpanded 
                            ? 'bg-slate-50/80 dark:bg-slate-800/40' 
                            : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/30'
                        }`}
                      >
                        {/* Status */}
                        <td className="px-5 py-3.5">
                          {log.status === 'success' ? (
                            <CheckCircle2 className="text-emerald-500" size={16} />
                          ) : (
                            <XCircle className="text-rose-500" size={16} />
                          )}
                        </td>

                        {/* Action + Method */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${methodColor(log.method)}`}>
                              {log.method}
                            </span>
                            <span className="font-semibold text-slate-800 dark:text-slate-300 text-xs">{log.action}</span>
                          </div>
                        </td>

                        {/* Path */}
                        <td className="px-5 py-3.5">
                          <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500 truncate block max-w-56" title={log.path}>
                            {log.path}
                          </span>
                        </td>

                        {/* User */}
                        <td className="px-5 py-3.5">
                          {log.userId ? (
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-slate-800 dark:text-slate-300 truncate max-w-36">{log.userId.name}</p>
                              <p className="text-[10px] text-slate-400 dark:text-slate-600 truncate max-w-36">{log.userId.email}</p>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400 dark:text-slate-600 italic">Anonymous</span>
                          )}
                        </td>

                        {/* Latency */}
                        <td className="px-5 py-3.5 text-right">
                          <span className={`text-xs font-semibold ${
                            log.latency
                              ? log.latency > 5000 ? 'text-rose-500' : log.latency > 2000 ? 'text-amber-500' : 'text-emerald-500'
                              : 'text-slate-400 dark:text-slate-600'
                          }`}>
                            {log.latency ? `${(log.latency / 1000).toFixed(2)}s` : '—'}
                          </span>
                        </td>

                        {/* Timestamp */}
                        <td className="px-5 py-3.5 text-right text-[11px] text-slate-400 dark:text-slate-500 whitespace-nowrap">
                          {fmt(log.createdAt)}
                        </td>

                        {/* Expand Icon */}
                        <td className="px-4 text-slate-400 dark:text-slate-600 text-right">
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </td>
                      </tr>

                      {/* Collapsible Meta Block Details Display */}
                      {isExpanded && (
                        <tr className="bg-slate-50/40 dark:bg-slate-900/40">
                          <td colSpan={7} className="px-8 py-4 border-l-2 border-indigo-500/70 dark:border-indigo-500/40">
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                  Context Execution Attributes
                                </h4>
                                <button
                                  onClick={(e) => handleDelete(e, log._id)}
                                  disabled={deletingId === log._id}
                                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 transition cursor-pointer disabled:opacity-50"
                                >
                                  <Trash2 size={11} />{deletingId === log._id ? 'Deleting…' : 'Delete Log'}
                                </button>
                              </div>
                              
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                                <div>
                                  <p className="text-slate-400 dark:text-slate-500 mb-1">Network Client Signature:</p>
                                  <div className="p-2.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                                    <p><span className="text-slate-400">IP:</span> {log.ipAddress || 'Unknown'}</p>
                                    <p className="truncate" title={log.userAgent}><span className="text-slate-400">UA:</span> {log.userAgent || 'Unknown'}</p>
                                  </div>
                                </div>

                                <div>
                                  <p className="text-slate-400 dark:text-slate-500 mb-1">Context Payload Payload Details (`details`):</p>
                                  {log.details && Object.keys(log.details).length > 0 ? (
                                    <pre className="p-2.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-400 overflow-x-auto max-h-40 text-[11px]">
                                      {JSON.stringify(log.details, null, 2)}
                                    </pre>
                                  ) : (
                                    <div className="p-2.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-600 italic">
                                      No supplemental object metadata captured.
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400 dark:text-slate-600 font-medium">
                    No logs matching the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/20 text-xs">
            <span className="text-slate-400 dark:text-slate-600">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total} events
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(p - 1, 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:text-slate-950 dark:hover:text-slate-300 disabled:opacity-30 cursor-pointer"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-slate-700 dark:text-slate-400 font-semibold px-2">Page {page}</span>
              <button
                onClick={() => setPage(p => (p * PAGE_SIZE < total ? p + 1 : p))}
                disabled={page * PAGE_SIZE >= total}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:text-slate-950 dark:hover:text-slate-300 disabled:opacity-30 cursor-pointer"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default LogsTab