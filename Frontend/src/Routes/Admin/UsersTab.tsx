// src/components/Admin/UsersTab.tsx
import { useState, useEffect, useCallback, type SetStateAction } from 'react'
import { Search, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { getAdminUsers, deleteAdminUser, updateUserRole } from '../../API/Admin/AdminUsers'
import { getAdminTiers } from '../../API/Admin/AdminTiers'
import type { AdminUser } from '../../API/Admin/AdminUsers'
import { UserTableRow } from '../../Components/Admin/UserTableRow'
import { LimitsModal } from '../../Components/Admin/UserLimitModal'

interface Props { onExpired: () => void }
const PAGE_SIZE = 8

const UsersTab = ({ onExpired }: Props) => {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [availableTiers, setAvailableTiers] = useState<string[]>(['free'])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState<string | null>(null)
  
  // Track targeted context parameters for modal overlay views
  const [limitsUser, setLimitsUser] = useState<AdminUser | null>(null)
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null)

  const showToast = (text: string, ok: boolean) => {
    setToast({ text, ok })
    setTimeout(() => setToast(null), 3500)
  }

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getAdminUsers(search, page, PAGE_SIZE)
      setUsers(data.users)
      setTotal(data.total)
      
      // Update limits modal context state concurrently if data updates mid-view
      if (limitsUser) {
        const matching = data.users.find(u => u.id === limitsUser.id)
        if (matching) setLimitsUser(matching)
      }
    } catch (err: any) {
      if (err.message?.includes('expired') || err.message?.includes('denied')) {
        onExpired()
      } else {
        showToast(err.message || 'Failed to sync remote records', false)
      }
    } finally {
      setLoading(false)
    }
  }, [search, page, onExpired, limitsUser?.id])

  useEffect(() => {
    getAdminTiers()
      .then(res => {
        if (res.tiers && res.tiers.length > 0) {
          setAvailableTiers(res.tiers.map(t => t.name))
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => { fetchUsers() }, [page, search])

  const handleRoleChange = async (userId: string, currentRole: 'admin' | 'user') => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin'
    if (!window.confirm(`Change this user's role assignment to ${newRole.toUpperCase()}?`)) return
    setActionId(userId)
    try {
      await updateUserRole(userId, newRole)
      showToast(`Role assignment transformed to ${newRole}`, true)
      fetchUsers()
    } catch (err: any) {
      showToast(err.message || 'Failed to update user role access privileges', false)
    } finally {
      setActionId(null)
    }
  }

  const handleDeleteUser = async (userId: string, email: string) => {
    if (!window.confirm(`Delete ${email} and purge ALL datasets securely? This cannot be reversed.`)) return
    setActionId(userId)
    try {
      await deleteAdminUser(userId)
      showToast('User space index and records dropped cleanly', true)
      fetchUsers()
    } catch (err: any) {
      showToast(err.message || 'Failed execution script during node deletion', false)
    } finally {
      setActionId(null)
    }
  }

  return (
    <div className="space-y-4 max-w-350 mx-auto">
      {/* Toast HUD */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 text-xs px-4 py-3 rounded-xl border font-bold shadow-xl transition-all duration-300 animate-in fade-in slide-in-from-top-2 backdrop-blur-md ${
          toast.ok
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
            : 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400'
        }`}>
          {toast.text}
        </div>
      )}

      {/* Filter Row Component */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={15} />
          <input
            type="text"
            placeholder="Search operator log identities by matching string queries or email hashes..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition shadow-xs"
          />
        </div>
        <button
          onClick={() => fetchUsers()}
          disabled={loading}
          className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition disabled:opacity-40 cursor-pointer shadow-xs"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Dynamic Data Table Presentation */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-4xl border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                <th className="px-5 py-4 text-left">Identity Profile</th>
                <th className="px-5 py-4 text-left">Access Role</th>
                <th className="px-5 py-4 text-left">Active Tier</th>
                <th className="px-5 py-4 text-left">AI Quota Usage</th>
                <th className="px-5 py-4 text-left">Joined</th>
                <th className="px-5 py-4 text-center">Chats</th>
                <th className="px-5 py-4 text-center">Msgs</th>
                <th className="px-5 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {loading && users.length === 0 ? (
                Array.from({ length: PAGE_SIZE }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-5 py-4">
                        <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-md animate-pulse w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : users.length > 0 ? (
                users.map(u => (
                  <UserTableRow
                    key={u.id}
                    user={u}
                    availableTiers={availableTiers}
                    actionId={actionId}
                    onRoleChange={handleRoleChange}
                    onOpenLimits={(selected: SetStateAction<AdminUser | null>) => setLimitsUser(selected)}
                    onDelete={handleDeleteUser}
                    showToast={showToast}
                    onRefresh={fetchUsers}
                  />
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="text-center py-16 text-slate-400 dark:text-slate-600 font-medium text-sm">
                    No active operator records found inside criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Navigation / Metric Indexes */}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-950/10 text-xs">
            <span className="text-slate-400 dark:text-slate-500 font-medium">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total} records
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(p - 1, 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-400 hover:bg-slate-50 hover:text-slate-800 dark:hover:bg-slate-800 disabled:opacity-20 cursor-pointer transition"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-slate-700 dark:text-slate-300 font-bold px-2">Page {page}</span>
              <button
                onClick={() => setPage(p => (p * PAGE_SIZE < total ? p + 1 : p))}
                disabled={page * PAGE_SIZE >= total}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-400 hover:bg-slate-50 hover:text-slate-800 dark:hover:bg-slate-800 disabled:opacity-20 cursor-pointer transition"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Center-Aligned Limits and Overrides Overlay Modal */}
      <LimitsModal
        user={limitsUser}
        onClose={() => setLimitsUser(null)}
        onSaved={fetchUsers}
        showToast={showToast}
      />
    </div>
  )
}

export default UsersTab