import { useState } from 'react'
import { CheckCircle2, XCircle, RefreshCw, SlidersHorizontal, Eye, Trash2, ShieldAlert } from 'lucide-react'
import type { LLMEvent } from '../../API/Admin/AdminLlm'
import { ErrorDetailsModal } from './ErrorDetails'

interface EventsLogTableProps {
  loading: boolean
  events: LLMEvent[]
  allTiers: string[]
  typeFilter: string
  tierFilter: string
  hoursFilter: string
  modelFilter: string
  statusFilter: string
  onTypeChange: (v: string) => void
  onTierChange: (v: string) => void
  onHoursChange: (v: string) => void
  onModelChange: (v: string) => void
  onStatusChange: (v: string) => void
  onDeleteEvent: (id: string) => Promise<void>
  onClearAllEvents: () => Promise<void>
}

const TIER_COLORS: Record<string, string> = {
  highllm:     'text-blue-500 dark:text-blue-400',
  lowllm:      'text-emerald-500 dark:text-emerald-400',
  summaryllm:  'text-amber-500 dark:text-amber-400',
  visionllm:   'text-pink-500 dark:text-pink-400',
  tool:        'text-purple-500 dark:text-purple-400',
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
  modelFilter,
  statusFilter,
  onTypeChange,
  onTierChange,
  onHoursChange,
  onModelChange,
  onStatusChange,
  onDeleteEvent,
  onClearAllEvents,
}: EventsLogTableProps) => {
  const [selectedEvent, setSelectedEvent] = useState<LLMEvent | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  const handleOpenInspectModal = (event: LLMEvent, e: React.MouseEvent) => {
    // Avoid triggering selection modal when clicking functional button parameters
    if ((e.target as HTMLElement).closest('.action-btn-guard')) return
    setSelectedEvent(event)
    setIsModalOpen(true)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-200">
          <SlidersHorizontal size={14} className="text-indigo-500" />
          <span>Recent Execution Trace Log</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Search Model Architecture..."
            value={modelFilter}
            onChange={e => onModelChange(e.target.value)}
            className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 transition placeholder-slate-400 max-w-45"
          />

          <input
            type="number"
            placeholder="Status Code (ex: 429)"
            value={statusFilter}
            onChange={e => onStatusChange(e.target.value)}
            className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 transition placeholder-slate-400 max-w-32.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />

          {[
            { value: typeFilter, onChange: onTypeChange, options: [['', 'All Types'], ['success', 'Success'], ['failure', 'Failure'], ['retry', 'Retry']] },
            { value: tierFilter, onChange: onTierChange, options: [['', 'All Tiers'], ['tool', 'TOOL'], ...allTiers.filter(t => t && t !== 'tool').map(t => [t, t.toUpperCase()])] },
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

          {/* Hard Delete All Traces Mutation Action */}
          {events.length > 0 && (
            <button
              onClick={() => {
                if (confirmClear) {
                  onClearAllEvents();
                  setConfirmClear(false);
                } else {
                  setConfirmClear(true);
                  setTimeout(() => setConfirmClear(false), 4000);
                }
              }}
              className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-xl border transition cursor-pointer shadow-xs ${
                confirmClear 
                  ? 'bg-rose-600 text-white border-rose-600 hover:bg-rose-700' 
                  : 'bg-white dark:bg-slate-900 text-rose-500 border-slate-200 dark:border-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/20'
              }`}
            >
              <ShieldAlert size={13} />
              <span>{confirmClear ? 'Confirm Purge?' : 'Clear Filtered'}</span>
            </button>
          )}
        </div>
      </div>

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
                <th className="px-5 py-3.5 text-left">Trace Message / Payload</th>
                <th className="px-5 py-3.5 text-center">Actions</th>
                <th className="px-5 py-3.5 text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-5 py-3.5">
                        <div className="h-3.5 bg-slate-100 dark:bg-slate-800/80 rounded animate-pulse w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : events.length > 0 ? (
                events.map((e, i) => (
                  <tr 
                    key={e._id || i} 
                    onClick={(ev) => handleOpenInspectModal(e, ev)}
                    className="hover:bg-slate-50/60 dark:hover:bg-slate-800/20 transition cursor-pointer group"
                  >
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
                    
                    <td className="px-5 py-3.5 text-xs max-w-xs truncate font-medium">
                      <div className="flex items-center gap-1.5 text-left">
                        {e.status_code ? (
                          <span className={`font-extrabold border px-1 py-0.5 rounded text-[10px] ${
                            e.type === 'failure' 
                              ? 'border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400'
                              : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                          }`}>
                            {e.status_code}
                          </span>
                        ) : null}
                        <span className={`truncate ${
                          e.type === 'failure'
                            ? 'text-rose-600 dark:text-rose-400 font-semibold'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}>
                          {e.error || 'Execution metadata parsed successfully'}
                        </span>
                      </div>
                    </td>

                    {/* Dual Action Controls: Inspect & Delete Row Entries */}
                    <td className="px-5 py-2 text-center whitespace-nowrap action-btn-guard">
                      <div className="inline-flex items-center gap-1">
                        <button 
                          onClick={(ev) => { ev.stopPropagation(); setSelectedEvent(e); setIsModalOpen(true); }}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-indigo-50 dark:bg-slate-800 dark:hover:bg-indigo-950/40 text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition cursor-pointer"
                          title="Inspect Trace Log"
                        >
                          <Eye size={13} />
                        </button>
                        <button 
                          onClick={(ev) => { ev.stopPropagation(); if(e._id) onDeleteEvent(e._id); }}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 transition cursor-pointer"
                          title="Delete Trace Entry"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>

                    <td className="px-5 py-3.5 text-right text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap font-medium">
                      {fmtTime(e.timestamp)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-slate-400 dark:text-slate-600 font-semibold text-xs uppercase tracking-wider">
                    No tracing records match your query filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ErrorDetailsModal 
        isOpen={isModalOpen} 
        onClose={() => { setIsModalOpen(false); setSelectedEvent(null); }} 
        event={selectedEvent} 
      />
    </div>
  )
}