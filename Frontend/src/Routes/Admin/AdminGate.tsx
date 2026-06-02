// src/Routes/Admin/AdminGate.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Does a real server-side check (/admin/stats acts as a probe) instead of
// relying solely on client-side JWT decode, which breaks with httpOnly cookies.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldAlert, ArrowLeft } from 'lucide-react'
import { getAdminStats } from '../../API/Admin/AdminStats'

interface AdminGateProps {
  children: React.ReactNode
}

const AdminGate = ({ children }: AdminGateProps) => {
  const navigate = useNavigate()
  const [authed, setAuthed] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    // Hit a real admin endpoint — server enforces role, we just check if it passes.
    // This works regardless of whether the token is in a cookie or a header.
    getAdminStats()
      .then(() => setAuthed(true))
      .catch(() => setAuthed(false))
      .finally(() => setChecking(false))
  }, [])

  if (checking) return null

  if (authed) return <>{children}</>

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgb(244,63,94) 1px, transparent 0)`,
          backgroundSize: '40px 40px',
        }}
      />
      <div className="relative w-full max-w-sm">
        <div className="absolute -inset-1 rounded-3xl bg-linear-to-br from-rose-600/30 to-orange-600/20 blur-xl" />
        <div className="relative bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
          <div className="h-1 w-full bg-linear-to-r from-rose-600 via-orange-500 to-rose-600" />
          <div className="p-8 text-center space-y-6">
            <div className="space-y-3">
              <div className="inline-flex p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <ShieldAlert className="text-rose-400" size={28} />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white tracking-tight">Access Denied</h1>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                  This portal is restricted to system administrators. Your account does not have
                  authorization to view this resource.
                </p>
              </div>
            </div>
            <button
              onClick={() => navigate('/')}
              className="w-full py-3 px-4 bg-linear-to-r from-slate-800 to-slate-700 hover:from-slate-700 hover:to-slate-600 border border-slate-700 text-white text-sm font-semibold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-md"
            >
              <ArrowLeft size={16} />
              Return to Home
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AdminGate