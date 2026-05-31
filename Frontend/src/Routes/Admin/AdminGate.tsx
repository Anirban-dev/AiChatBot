// src/Routes/Admin/AdminGate.tsx
// Password modal that guards the entire admin section.
// Token lives only in sessionStorage — gone when tab closes.
import { useState, useEffect, useRef } from 'react'
import { Lock, Eye, EyeOff, ShieldAlert } from 'lucide-react'
import { adminLogin, setAdminToken, isAdminAuthenticated } from '../../API/Admin'

interface AdminGateProps {
  children: React.ReactNode
}

const AdminGate = ({ children }: AdminGateProps) => {
  const [authed, setAuthed] = useState(false)
  const [checking, setChecking] = useState(true)
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Check if already authenticated this session
  useEffect(() => {
    if (isAdminAuthenticated()) {
      setAuthed(true)
    }
    setChecking(false)
  }, [])

  useEffect(() => {
    if (!authed && !checking) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [authed, checking])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password || loading) return

    setLoading(true)
    setError('')

    try {
      const token = await adminLogin(password)
      setAdminToken(token)
      setAuthed(true)
    } catch (err: any) {
      setError(err.message || 'Incorrect password.')
      setPassword('')
    } finally {
      setLoading(false)
    }
  }

  if (checking) return null

  if (authed) return <>{children}</>

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex items-center justify-center p-4">
      {/* Subtle radial grid background */}
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgb(99,102,241) 1px, transparent 0)`,
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative w-full max-w-sm">
        {/* Glow effect behind card */}
        <div className="absolute -inset-1 rounded-3xl bg-linear-to-br from-indigo-600/30 to-violet-600/20 blur-xl" />

        <div className="relative bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">

          {/* Top accent bar */}
          <div className="h-1 w-full bg-linear-to-r from-indigo-600 via-violet-500 to-indigo-600" />

          <div className="p-8 space-y-7">

            {/* Header */}
            <div className="text-center space-y-3">
              <div className="inline-flex p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                <ShieldAlert className="text-indigo-400" size={28} />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white tracking-tight">Admin Portal</h1>
                <p className="mt-1 text-sm text-slate-500">
                  Restricted access. Enter the admin password to continue.
                </p>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
                  Admin Password
                </label>
                <div className="relative">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">
                    <Lock size={16} />
                  </div>
                  <input
                    ref={inputRef}
                    id="admin-password"
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError('') }}
                    placeholder="Enter admin password"
                    disabled={loading}
                    className="w-full pl-10 pr-10 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition disabled:opacity-50"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition cursor-pointer"
                    tabIndex={-1}
                  >
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <p className="text-xs text-rose-400 font-medium flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
                  <ShieldAlert size={14} className="shrink-0" />
                  {error}
                </p>
              )}

              <button
                id="admin-login-btn"
                type="submit"
                disabled={loading || !password}
                className="w-full py-3 px-4 bg-linear-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-sm font-bold rounded-xl shadow-lg shadow-indigo-900/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 cursor-pointer"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Authenticating…
                  </span>
                ) : 'Unlock Admin Panel'}
              </button>
            </form>

            <p className="text-center text-xs text-slate-600">
              Session expires after 1 hour or when tab is closed.
            </p>

          </div>
        </div>
      </div>
    </div>
  )
}

export default AdminGate