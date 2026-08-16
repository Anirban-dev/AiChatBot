// src/Routes/User.tsx
import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Sun, Moon, Gauge, Brain, Sparkles, ShieldCheck, Cpu,
  Image, Video, File, Clock, CalendarDays, Zap, BarChart3, Loader2, RotateCw
} from 'lucide-react'
import api from '../Auth/AxiosHelper'

interface ModelLimit {
  rpm: number
  tpm: number
  period?: string
}

interface UploadLimit {
  max: number
  period?: string
}

interface UserData {
  user: {
    id: string
    name: string
    email: string
    tier: string
    role: string
    googleAuth: boolean
  }
  effectiveLimits: {
    models: Record<string, ModelLimit>
    uploads: Record<string, UploadLimit>
    isOverridden: boolean
  }
  usage: {
    models: Record<string, { rpmUsed: number; tpmUsed: number }>
    uploads: Record<string, { used: number }>
    totalTpmUsed: number
    totalRpmUsed: number
  }
  currentWindow: {
    hourly: { stamp: string; tpmUsed: number; rpmUsed: number; resetAt: string }
    daily: { stamp: string; tpmUsed: number; rpmUsed: number; resetAt: string }
  }
  resets: {
    models: Record<string, string>
    uploads: Record<string, string>
  }
}

const MODEL_META: Record<string, { icon: any; color: string; ring: string }> = {
  small:    { icon: Sparkles,    color: 'from-emerald-500 to-teal-600',   ring: 'text-emerald-500' },
  large:    { icon: Brain,       color: 'from-blue-500 to-indigo-600',    ring: 'text-blue-500' },
  thinking: { icon: Cpu,         color: 'from-violet-500 to-purple-600',  ring: 'text-violet-500' },
  critiq:   { icon: ShieldCheck, color: 'from-amber-500 to-orange-600',   ring: 'text-amber-500' },
}

const UPLOAD_META: Record<string, { icon: any; color: string }> = {
  image: { icon: Image,  color: 'from-pink-500 to-rose-600' },
  video: { icon: Video,  color: 'from-sky-500 to-cyan-600' },
  other: { icon: File,   color: 'from-slate-500 to-gray-600' },
}

const pct = (used: number, limit: number) => (limit <= 0 ? 0 : Math.min(Math.round((used / limit) * 100), 100))

const barColor = (p: number) => {
  if (p >= 95) return 'bg-red-500'
  if (p >= 80) return 'bg-amber-500'
  return 'bg-emerald-500'
}

const barTrackColor = (p: number) => {
  if (p >= 95) return 'bg-red-500/10 dark:bg-red-500/15'
  if (p >= 80) return 'bg-amber-500/10 dark:bg-amber-500/15'
  return 'bg-emerald-500/10 dark:bg-emerald-500/15'
}

const periodLabel = (p?: string) => (p ? p.charAt(0).toUpperCase() + p.slice(1) : 'Hourly')

const UserPage = () => {
  const navigate = useNavigate()
  const [dark, setDark] = useState<boolean>(() => {
    const saved = localStorage.getItem('theme')
    if (saved) return saved === 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })
  const [data, setData] = useState<UserData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }, [dark])

  useEffect(() => {
    const fetchUsage = async () => {
      try {
        const res = await api.get('/user')
        setData(res.data)
      } catch (err: any) {
        console.error('Failed to fetch user usage:', err)
        setError(err.response?.data?.error || 'Failed to load usage data')
        if (err.response?.status === 401) navigate('/login')
      } finally {
        setLoading(false)
      }
    }
    fetchUsage()
  }, [navigate])

  const initials = data?.user?.name
    ? data.user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : 'U'

  const tierColor =
    data?.user?.tier === 'premium' || data?.user?.tier === 'pro'
      ? 'bg-gradient-to-r from-amber-500 to-orange-600'
      : data?.user?.tier === 'enterprise'
        ? 'bg-gradient-to-r from-violet-500 to-purple-600'
        : 'bg-slate-500'

  return (
    <div className="min-h-screen transition-colors duration-300" style={{ backgroundColor: 'var(--bg-page)', color: 'var(--text-primary)' }}>
      {/* ── Header ─────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-20 border-b backdrop-blur-md"
        style={{ backgroundColor: 'var(--bg-navbar)', borderColor: 'var(--border-medium)' }}
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="p-2 rounded-lg transition-colors cursor-pointer"
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--border-light)')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              title="Back to chat"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-gradient-to-tr from-amber-500 to-orange-600 shadow-lg shadow-amber-900/30">
                <Gauge size={17} className="text-white" />
              </div>
              <div>
                <h1 className="font-bold text-lg leading-tight">Usage & Limits</h1>
                <p className="text-xs leading-tight" style={{ color: 'var(--text-secondary)' }}>
                  Your plan's resource allocation
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={() => setDark(!dark)}
            className="p-2 rounded-lg transition-colors cursor-pointer border"
            style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-medium)' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--border-light)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
            title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {dark ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 gap-3" style={{ color: 'var(--text-secondary)' }}>
            <Loader2 className="animate-spin" size={28} style={{ color: 'var(--accent)' }} />
            <p className="text-sm">Loading your usage…</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-32 gap-4 text-center">
            <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center">
              <Zap size={26} className="text-red-500" />
            </div>
            <div>
              <p className="font-semibold text-lg">Couldn't load usage</p>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{error}</p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="mt-1 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-amber-500 to-orange-600 hover:opacity-90 transition cursor-pointer"
            >
              Try again
            </button>
          </div>
        ) : data ? (
          <>
            {/* ── Profile banner ───────────────────────────── */}
            <section
              className="rounded-2xl p-6 sm:p-8 mb-6 relative overflow-hidden"
              style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-medium)' }}
            >
              <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
              <div className="flex items-center gap-5 relative">
                <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${MODEL_META.small.color} flex items-center justify-center text-white text-2xl font-bold shadow-lg shrink-0`}>
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl sm:text-2xl font-bold truncate">{data.user.name}</h2>
                  <p className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>{data.user.email}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold text-white ${tierColor}`}>
                      {data.user.tier} plan
                    </span>
                    <span
                      className="px-2.5 py-0.5 rounded-full text-xs font-medium"
                      style={{ backgroundColor: 'var(--border-light)', color: 'var(--text-secondary)' }}
                    >
                      {data.user.role}
                    </span>
                    {data.effectiveLimits.isOverridden && (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium text-amber-700 dark:text-amber-400" style={{ backgroundColor: 'rgba(245,158,11,0.15)' }}>
                        Custom limits applied
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* ── Summary stats ────────────────────────────── */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
              <StatCard icon={<BarChart3 size={18} />} label="Requests used" value={String(data.usage.totalRpmUsed)} sub="All models" accent="text-emerald-500" />
              <StatCard icon={<Brain size={18} />} label="Tokens used" value={formatNum(data.usage.totalTpmUsed)} sub="All models" accent="text-blue-500" />
              <StatCard icon={<Clock size={18} />} label="Hourly RPM" value={`${data.currentWindow.hourly.rpmUsed}`} sub="Current hour" accent="text-violet-500" />
              <StatCard icon={<CalendarDays size={18} />} label="Daily RPM" value={`${data.currentWindow.daily.rpmUsed}`} sub="Today" accent="text-amber-500" />
            </section>

            {/* ── Model usage ─────────────────────────────── */}
            <section className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Cpu size={16} style={{ color: 'var(--accent)' }} />
                <h3 className="font-bold text-lg">AI Model Usage</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {['small', 'large', 'thinking', 'critiq'].map(name => {
                  const meta = MODEL_META[name]
                  const Icon = meta.icon
                  const limit = data.effectiveLimits.models[name]
                  const used = data.usage.models[name] || { rpmUsed: 0, tpmUsed: 0 }
                  const rpmP = pct(used.rpmUsed, limit.rpm)
                  const tpmP = pct(used.tpmUsed, limit.tpm)
                  return (
                    <div
                      key={name}
                      className="rounded-2xl p-5 transition-shadow hover:shadow-lg"
                      style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-medium)' }}
                    >
                      <div className="flex items-center gap-3 mb-4">
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${meta.color} flex items-center justify-center text-white shrink-0`}>
                          <Icon size={18} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold capitalize leading-tight">{name}</p>
                          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                            {periodLabel(limit.period)} · {formatNum(limit.tpm)} TPM max
                          </p>
                        </div>
                        <span className={`text-xs font-bold ${meta.ring}`}>
                          {Math.max(rpmP, tpmP)}%
                        </span>
                      </div>

                      <div className="space-y-3">
                        <BarRow label="RPM" used={used.rpmUsed} limit={limit.rpm} pct={rpmP} />
                        <BarRow label="TPM" used={used.tpmUsed} limit={limit.tpm} pct={tpmP} />
                      </div>

                      <div className="flex items-center justify-between mt-4 pt-3" style={{ borderTop: '1px solid var(--border-light)' }}>
                        <ResetsIn resetAt={data.resets.models[name]} />
                        <span className={`text-xs font-bold ${meta.ring}`}>
                          {periodLabel(limit.period)}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            {/* ── Upload usage ────────────────────────────── */}
            <section className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <File size={16} style={{ color: 'var(--accent)' }} />
                <h3 className="font-bold text-lg">Upload Usage</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                {['image', 'video', 'other'].map(cat => {
                  const meta = UPLOAD_META[cat]
                  const Icon = meta.icon
                  const limit = data.effectiveLimits.uploads[cat]
                  const used = (data.usage.uploads[cat] || { used: 0 }).used
                  const p = pct(used, limit.max)
                  return (
                    <div
                      key={cat}
                      className="rounded-2xl p-5 transition-shadow hover:shadow-lg"
                      style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-medium)' }}
                    >
                      <div className="flex items-center gap-3 mb-4">
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${meta.color} flex items-center justify-center text-white shrink-0`}>
                          <Icon size={18} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold capitalize leading-tight">{cat}</p>
                          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                            {periodLabel(limit.period)} · {limit.max} max
                          </p>
                        </div>
                        <span className={`text-xs font-bold ${p >= 95 ? 'text-red-500' : p >= 80 ? 'text-amber-500' : 'text-emerald-500'}`}>
                          {p}%
                        </span>
                      </div>
                      <BarRow label="Uploads" used={used} limit={limit.max} pct={p} />
                      <div className="flex items-center justify-between mt-4 pt-3" style={{ borderTop: '1px solid var(--border-light)' }}>
                        <ResetsIn resetAt={data.resets.uploads[cat]} />
                        <span className={`text-xs font-bold ${p >= 95 ? 'text-red-500' : p >= 80 ? 'text-amber-500' : 'text-emerald-500'}`}>
                          {periodLabel(limit.period)}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            {/* ── Current window ──────────────────────────── */}
            <section
              className="rounded-2xl p-6 mb-6"
              style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-medium)' }}
            >
              <div className="flex items-center gap-2 mb-5">
                <Clock size={16} style={{ color: 'var(--accent)' }} />
                <h3 className="font-bold text-lg">Current Window</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--bg-chat)', border: '1px solid var(--border-light)' }}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                      Hourly · {data.currentWindow.hourly.stamp}
                    </p>
                    <ResetsIn resetAt={data.currentWindow.hourly.resetAt} />
                  </div>
                  <div className="space-y-3">
                    <BarRow label="Requests" used={data.currentWindow.hourly.rpmUsed} limit={totalRpm(data.effectiveLimits)} pct={pct(data.currentWindow.hourly.rpmUsed, totalRpm(data.effectiveLimits))} />
                    <BarRow label="Tokens" used={data.currentWindow.hourly.tpmUsed} limit={totalTpm(data.effectiveLimits)} pct={pct(data.currentWindow.hourly.tpmUsed, totalTpm(data.effectiveLimits))} />
                  </div>
                </div>
                <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--bg-chat)', border: '1px solid var(--border-light)' }}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                      Daily · {data.currentWindow.daily.stamp}
                    </p>
                    <ResetsIn resetAt={data.currentWindow.daily.resetAt} />
                  </div>
                  <div className="space-y-3">
                    <BarRow label="Requests" used={data.currentWindow.daily.rpmUsed} limit={totalRpm(data.effectiveLimits)} pct={pct(data.currentWindow.daily.rpmUsed, totalRpm(data.effectiveLimits))} />
                    <BarRow label="Tokens" used={data.currentWindow.daily.tpmUsed} limit={totalTpm(data.effectiveLimits)} pct={pct(data.currentWindow.daily.tpmUsed, totalTpm(data.effectiveLimits))} />
                  </div>
                </div>
              </div>
            </section>

            <p className="text-center text-xs" style={{ color: 'var(--text-secondary)' }}>
              Limits are read-only and managed by your plan. Contact support to upgrade.
            </p>
          </>
        ) : null}
      </main>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────

function useCountdown(targetIso?: string) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!targetIso) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [targetIso])

  const diff = targetIso ? Math.max(0, Math.round((new Date(targetIso).getTime() - now) / 1000)) : 0
  const hours = Math.floor(diff / 3600)
  const minutes = Math.floor((diff % 3600) / 60)
  const seconds = diff % 60
  return { hours, minutes, seconds, done: diff <= 0 }
}

function formatReset(h: number, m: number, s: number, done: boolean) {
  if (done) return 'now'
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function ResetsIn({ resetAt }: { resetAt: string }) {
  const { hours, minutes, seconds, done } = useCountdown(resetAt)
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-semibold"
      style={{ color: 'var(--text-secondary)' }}
    >
      <RotateCw size={11} className={done ? '' : 'animate-spin'} style={done ? {} : { animationDuration: '3s' }} />
      {done ? 'Resetting…' : `Resets in ${formatReset(hours, minutes, seconds, done)}`}
    </span>
  )
}

function StatCard({ icon, label, value, sub, accent }: { icon: ReactNode; label: string; value: string; sub: string; accent: string }) {
  return (
    <div
      className="rounded-2xl p-4 sm:p-5 transition-shadow hover:shadow-lg"
      style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-medium)' }}
    >
      <div className={`${accent} mb-2`}>{icon}</div>
      <p className="text-xl sm:text-2xl font-bold truncate">{value}</p>
      <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</p>
      <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{sub}</p>
    </div>
  )
}

function BarRow({ label, used, limit, pct: p }: { label: string; used: number; limit: number; pct: number }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</span>
        <span className="text-xs font-semibold">{formatNum(used)} / {formatNum(limit)}</span>
      </div>
      <div className={`h-2 rounded-full overflow-hidden ${barTrackColor(p)}`}>
        <div
          className={`h-full rounded-full ${barColor(p)} transition-all duration-500`}
          style={{ width: `${p}%` }}
        />
      </div>
    </div>
  )
}

function totalRpm(limits: UserData['effectiveLimits']) {
  return Object.values(limits.models).reduce((sum, m) => sum + (m.rpm || 0), 0)
}

function totalTpm(limits: UserData['effectiveLimits']) {
  return Object.values(limits.models).reduce((sum, m) => sum + (m.tpm || 0), 0)
}

function formatNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export default UserPage