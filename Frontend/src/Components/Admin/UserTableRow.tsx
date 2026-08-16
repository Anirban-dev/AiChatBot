// src/components/Admin/UserTableRow.tsx
import { useState, useRef, useEffect } from 'react'
import { Trash2, ChevronDown } from 'lucide-react'
import { UsageBar } from './UsageBar'
import type { AdminUser } from '../../API/Admin/AdminUsers'
import { updateUserTier } from '../../API/Admin/AdminUsers'

interface RowProps {
  user: AdminUser
  availableTiers?: string[]
  actionId: string | null
  onRoleChange: (id: string, currentRole: 'admin' | 'user') => void
  onOpenLimits: (user: AdminUser) => void
  onDelete: (id: string, email: string) => void
  showToast: (text: string, ok: boolean) => void
  onRefresh: () => void
}

const getTierBadgeStyle = (tier: string) => {
  if (tier === 'free') {
    return 'bg-slate-50 border-slate-200 text-slate-600 dark:bg-slate-800/40 dark:border-slate-700 dark:text-slate-400'
  }
  return 'bg-indigo-50/60 border-indigo-200 text-indigo-700 dark:bg-indigo-500/10 dark:border-indigo-500/20 dark:text-indigo-400'
}

export const UserTableRow = ({ user, availableTiers = ['free'], actionId, onRoleChange, onOpenLimits, onDelete, showToast, onRefresh }: RowProps) => {
  const [tierMenuOpen, setTierMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const clickAway = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setTierMenuOpen(false)
      }
    }
    if (tierMenuOpen) document.addEventListener('mousedown', clickAway)
    return () => document.removeEventListener('mousedown', clickAway)
  }, [tierMenuOpen])

  const selectTier = async (targetTier: string) => {
    setTierMenuOpen(false)
    if (targetTier === user.tier) return
    try {
      await updateUserTier(user.id, targetTier)
      showToast(`Tier updated to ${targetTier.toUpperCase()}`, true)
      onRefresh()
    } catch (err: any) {
      showToast(err.message || 'Failed to alter tier assignment', false)
    }
  }

  return (
    <tr className="hover:bg-slate-50/40 dark:hover:bg-slate-800/10 transition">
      {/* User Info Column */}
      <td className="px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-linear-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-xs">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-800 dark:text-slate-200 text-sm truncate">{user.name}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{user.email}</p>
          </div>
        </div>
      </td>

      {/* Role Assignment Column */}
      <td className="px-5 py-4">
        <div className="flex items-center gap-1.5">
          <select
            value={user.role}
            disabled={actionId !== null}
            onChange={() => onRoleChange(user.id, user.role)}
            className={`text-xs font-bold uppercase px-2.5 py-1 rounded-lg border bg-transparent focus:outline-none transition cursor-pointer disabled:opacity-50 ${
              user.role === 'admin'
                ? 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/20 text-rose-600 dark:text-rose-400'
                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
            }`}
          >
            <option value="user" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-white">User</option>
            <option value="admin" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-white">Admin</option>
          </select>
          {user.googleAuth && (
            <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 text-[9px] font-bold text-blue-500 dark:text-blue-400 uppercase">G</span>
          )}
        </div>
      </td>

      {/* Active Tier Dropdown Trigger Column */}
      <td className="px-5 py-4">
        <div className="absolute inline-block" ref={menuRef}>
          <button
            onClick={() => setTierMenuOpen(!tierMenuOpen)}
            className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg border inline-flex items-center gap-1 hover:brightness-95 dark:hover:brightness-110 transition cursor-pointer ${getTierBadgeStyle(user.tier)}`}
          >
            {user.tier}
            <ChevronDown size={11} className={`transition-transform duration-200 ${tierMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {tierMenuOpen && (
            <div className="absolute left-0 mt-1.5 w-32 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1 shadow-xl z-30 animate-in fade-in slide-in-from-top-1">
              {availableTiers.map(t => (
                <button
                  key={t}
                  onClick={() => selectTier(t)}
                  className={`w-full text-left px-2.5 py-1.5 text-xs font-bold uppercase rounded-lg transition cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 ${
                    user.tier === t ? 'text-indigo-500 dark:text-indigo-400 bg-indigo-50/40 dark:bg-indigo-500/5' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
      </td>

      {/* Interactive Consumption / Modal Trigger Column */}
      <td className="px-5 py-4">
        <div
          onClick={() => onOpenLimits(user)}
          className="group/cell space-y-1 w-52 text-[11px] p-2.5 -m-2 rounded-xl cursor-pointer bg-slate-50/50 dark:bg-slate-950/40 hover:bg-slate-100/70 dark:hover:bg-slate-800/60 transition border border-slate-100 dark:border-slate-800/80"
          title="Click to view full quota & rate limit configuration"
        >
          <div className="flex items-center justify-between text-slate-700 dark:text-slate-300 font-semibold">
            <span>Quota Config</span>
            <span className="text-[10px] text-indigo-500 font-bold group-hover/cell:underline">Manage limits →</span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>{user.limits.tpmUsed.toLocaleString()} tokens used</span>
            <span>{user.limits.rpmUsed} reqs</span>
          </div>
          {user.limits.isOverridden && (
            <p className="text-[9px] text-amber-500 dark:text-amber-400 font-bold tracking-wide uppercase pt-0.5">⚡ Custom Overrides Active</p>
          )}
        </div>
      </td>

      {/* Meta Stats Columns */}
      <td className="px-5 py-4 text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">
        {new Date(user.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
      </td>
      <td className="px-5 py-4 text-center font-medium text-slate-700 dark:text-slate-300">{user.chatsCount}</td>
      <td className="px-5 py-4 text-center font-medium text-slate-700 dark:text-slate-300">{user.messagesCount}</td>

      {/* Actions (Standalone Delete) */}
      <td className="px-5 py-4 text-right">
        <button
          onClick={() => onDelete(user.id, user.email)}
          disabled={actionId !== null}
          title="Delete User & Clear Workspace Data"
          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 border border-transparent hover:border-rose-100 dark:hover:border-rose-500/20 rounded-xl transition cursor-pointer disabled:opacity-40"
        >
          <Trash2 size={14} />
        </button>
      </td>
    </tr>
  )
}