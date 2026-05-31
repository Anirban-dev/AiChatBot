// src/Routes/Admin/UsersTab.tsx
import { useState, useEffect, useCallback } from 'react'
import { Search, UserCheck, UserX, Trash2, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import {
  getAdminUsers, updateUserRole, deleteAdminUser,
  clearAdminToken
} from '../../API/Admin'
import type { AdminUser } from '../../API/Admin'

interface Props {
  onExpired: () => void
}

const UsersTab = ({ onExpired }: Props) => {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null)

  const PAGE_SIZE = 8

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
    } catch (err: any) {
      if (err.message?.includes('expired')) {
        clearAdminToken()
        onExpired()
      } else {
        showToast(err.message || 'Failed to load users', false)
      }
    } finally {
      setLoading(false)
    }
  }, [search, page])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const handleRole = async (userId: string, current: 'admin' | 'user') => {
    const next = current === 'admin' ? 'user' : 'admin'
    setActionId(userId)
    try {
      await updateUserRole(userId, next)
      showToast(`Role updated to ${next}`, true)
      fetchUsers()
    } catch (err: any) {
      showToast(err.message || 'Failed to update role', false)
    } finally {
      setActionId(null)
    }
  }

  const handleDelete = async (userId: string, email: string) => {
    if (!window.confirm(`Delete ${email} and ALL their data? This cannot be undone.`)) return
    setActionId(userId)
    try {
      await deleteAdminUser(userId)
      showToast('User deleted', true)
      fetchUsers()
    } catch (err: any) {
      showToast(err.message || 'Failed to delete user', false)
    } finally {
      setActionId(null)
    }
  }

  const fmt = (d: string) => new Date(d).toLocaleDateString(undefined, { dateStyle: 'medium' })

  return (
    <div className="space-y-5">

      {/* Toast */}
      {toast && (
        <div className={`text-sm px-4 py-3 rounded-xl border font-medium ${
          toast.ok
            ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
            : 'bg-rose-50 dark:bg-rose-500/10 border-rose-100 dark:border-rose-500/20 text-rose-600 dark:text-rose-400'
        }`}>
          {toast.text}
        </div>
      )}

      {/* Search + Refresh */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={15} />
          <input
            type="text"
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:focus:ring-indigo-500/40 focus:border-indigo-500 transition"
          />
        </div>
        <button
          onClick={() => fetchUsers()}
          disabled={loading}
          className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition cursor-pointer disabled:opacity-40"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-3xl">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                <th className="px-5 py-3.5 text-left">User</th>
                <th className="px-5 py-3.5 text-left">Type</th>
                <th className="px-5 py-3.5 text-left">Joined</th>
                <th className="px-5 py-3.5 text-center">Chats</th>
                <th className="px-5 py-3.5 text-center">Messages</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/70">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-5 py-4">
                        <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded animate-pulse w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : users.length > 0 ? (
                users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-linear-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">{u.name}</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          u.role === 'admin'
                            ? 'bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                        }`}>
                          {u.role}
                        </span>
                        {u.googleAuth && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                            Google
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-400 dark:text-slate-500">{fmt(u.createdAt)}</td>
                    <td className="px-5 py-4 text-center font-semibold text-slate-700 dark:text-slate-300">{u.chatsCount}</td>
                    <td className="px-5 py-4 text-center font-semibold text-slate-700 dark:text-slate-300">{u.messagesCount}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleRole(u.id, u.role)}
                          disabled={actionId !== null}
                          title={u.role === 'admin' ? 'Revoke Admin' : 'Make Admin'}
                          className={`p-2 rounded-lg border transition cursor-pointer disabled:opacity-40 ${
                            u.role === 'admin'
                              ? 'border-rose-200 dark:border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10'
                              : 'border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 hover:border-indigo-300 dark:hover:border-indigo-500/30'
                          }`}
                        >
                          {u.role === 'admin' ? <UserX size={15} /> : <UserCheck size={15} />}
                        </button>
                        <button
                          onClick={() => handleDelete(u.id, u.email)}
                          disabled={actionId !== null}
                          title="Delete User"
                          className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:border-rose-300 hover:text-rose-600 hover:bg-rose-50 dark:hover:border-rose-500/30 dark:hover:text-rose-400 dark:hover:bg-rose-500/10 transition cursor-pointer disabled:opacity-40"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400 dark:text-slate-600 font-medium">
                    No users match your search.
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
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
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

export default UsersTab
