// src/components/Admin/LimitsModal.tsx
import { useState, useEffect } from 'react'
import { X, Gauge, Check, RefreshCw, RotateCcw } from 'lucide-react'
import { UsageBar } from './UsageBar'
import type { AdminUser } from '../../API/Admin'
import { updateUserLimits } from '../../API/Admin'

interface LimitsModalProps {
  user: AdminUser | null
  onClose: () => void
  onSaved: () => void
  showToast: (text: string, ok: boolean) => void
}

export const LimitsModal = ({ user, onClose, onSaved, showToast }: LimitsModalProps) => {
  const [tpm, setTpm] = useState('')
  const [rpm, setRpm] = useState('')
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)

  useEffect(() => {
    if (user) {
      setTpm(String(user.limits.tpm))
      setRpm(String(user.limits.rpm))
    }
  }, [user])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  if (!user) return null
  const { limits: l } = user

  const handleApplyOverrides = async () => {
    const tpmVal = parseInt(tpm)
    const rpmVal = parseInt(rpm)
    if (isNaN(tpmVal) || tpmVal < 1 || isNaN(rpmVal) || rpmVal < 1) {
      showToast('TPM and RPM must be positive numbers', false)
      return
    }
    setSaving(true)
    try {
      await updateUserLimits(user.id, { tpm: tpmVal, rpm: rpmVal })
      showToast('Custom limit overrides applied successfully', true)
      onSaved()
      onClose()
    } catch (err: any) {
      showToast(err.message || 'Failed to update limits', false)
    } finally {
      setSaving(false)
    }
  }

  const handleClearOverrides = async () => {
    if (!window.confirm('Clear custom overrides and return to standard tier defaults?')) return
    setClearing(true)
    try {
      await updateUserLimits(user.id, { clear: true })
      showToast('Overrides cleared — reverted to default tier settings', true)
      onSaved()
      onClose()
    } catch (err: any) {
      showToast(err.message || 'Failed to clear overrides', false)
    } finally {
      setClearing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-xs" onClick={onClose} />
      
      {/* Modal Card */}
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl space-y-5 overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gauge size={18} className="text-indigo-500" />
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Limits Configuration
              </h3>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate max-w-65">
                {user.email}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer">
            <X size={16} />
          </button>
        </div>

        {/* Live Metrics Display */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800/60 space-y-3.5">
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Active Minute Utilization Window
          </p>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs font-medium mb-1">
                <span className="text-slate-500 dark:text-slate-400">Tokens/Min (TPM)</span>
                <span className="font-bold text-slate-700 dark:text-slate-300">
                  {l.tpmUsed.toLocaleString()} <span className="text-slate-400 font-normal">/ {l.tpm.toLocaleString()}</span>
                </span>
              </div>
              <UsageBar used={l.tpmUsed} total={l.tpm} color="bg-indigo-500" />
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">{l.tpmRemaining.toLocaleString()} tokens remaining</p>
            </div>
            <div>
              <div className="flex justify-between text-xs font-medium mb-1">
                <span className="text-slate-500 dark:text-slate-400">Requests/Min (RPM)</span>
                <span className="font-bold text-slate-700 dark:text-slate-300">
                  {l.rpmUsed} <span className="text-slate-400 font-normal">/ {l.rpm}</span>
                </span>
              </div>
              <UsageBar used={l.rpmUsed} total={l.rpm} color="bg-violet-500" />
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">{l.rpmRemaining} requests remaining</p>
            </div>
          </div>
        </div>

        {/* Overrides Input Area */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Custom Adjustments
            </label>
            {l.isOverridden && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                Custom Rule Active
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Target TPM</span>
              <input
                type="number"
                value={tpm}
                min={1}
                onChange={e => setTpm(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
              />
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Target RPM</span>
              <input
                type="number"
                value={rpm}
                min={1}
                onChange={e => setRpm(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
              />
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex gap-2 pt-2">
          <button
            onClick={handleApplyOverrides}
            disabled={saving || clearing}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold transition disabled:opacity-50 cursor-pointer shadow-xs"
          >
            {saving ? <RefreshCw size={12} className="animate-spin" /> : <Check size={12} />}
            {saving ? 'Saving...' : 'Apply Overrides'}
          </button>
          {l.isOverridden && (
            <button
              onClick={handleClearOverrides}
              disabled={saving || clearing}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-rose-500 hover:border-rose-200 transition disabled:opacity-50 text-xs font-bold cursor-pointer"
            >
              {clearing ? <RefreshCw size={12} className="animate-spin" /> : <RotateCcw size={12} />}
              Reset
            </button>
          )}
        </div>
      </div>
    </div>
  )
}