import { X, Copy, Check, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import type { LLMEvent } from '../../API/Admin/AdminLlm'

interface ErrorDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  event: LLMEvent | null
}

export const ErrorDetailsModal = ({ isOpen, onClose, event }: ErrorDetailsModalProps) => {
  const [copied, setCopied] = useState(false)

  if (!isOpen || !event) return null

  const handleCopy = () => {
    const errorText = event.error || 'Unknown execution failure.'
    navigator.clipboard.writeText(
      event.status_code 
        ? `[Status ${event.status_code}] ${errorText}` 
        : errorText
    )
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs animate-fade-in">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden animate-scale-up">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-950/10">
          <div className="flex items-center gap-2">
            <ShieldAlert size={16} className="text-rose-500" />
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Trace Exception Diagnostics</h3>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Model: {event.model}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex gap-4 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            <div>
              Status Code: <span className="text-rose-600 dark:text-rose-400 font-extrabold">{event.status_code || 'None'}</span>
            </div>
            <div>
              Tier: <span className="text-slate-700 dark:text-slate-300 font-extrabold">{event.tier}</span>
            </div>
          </div>

          <div className="relative group">
            <button
              onClick={handleCopy}
              className="absolute top-3 right-3 z-10 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 transition cursor-pointer"
            >
              {copied ? (
                <><Check size={11} className="text-emerald-500" /> Copied</>
              ) : (
                <><Copy size={11} /> Copy Log</>
              )}
            </button>
            
            {/* Standardized break-words token to secure layouts against unspaced string expansions */}
            <div className="w-full max-h-60 overflow-y-auto rounded-xl bg-slate-950 p-4 font-mono text-xs text-rose-400 dark:text-rose-400/90 leading-relaxed border border-slate-900 shadow-inner wrap-break-word whitespace-pre-wrap">
              {event.error || 'System reported a dynamic operational abort routine without string logging outputs.'}
            </div>
          </div>
        </div>

        <div className="flex justify-end px-5 py-3 border-t border-slate-100 dark:border-slate-800/60 bg-slate-50/30 dark:bg-slate-950/5">
          <button
            onClick={onClose}
            className="text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition cursor-pointer shadow-xs"
          >
            Dismiss Trace
          </button>
        </div>
      </div>
    </div>
  )
}