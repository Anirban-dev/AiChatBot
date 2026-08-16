// src/Routes/Admin/index.tsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Database, LogOut, Sun, Moon } from 'lucide-react'
import AdminGate from './AdminGate'
import OverviewTab from './OverviewTab'
import UsersTab from './UsersTab'
import TiersTab from './TiersTab'
import LogsTab from './LogsTab'
import LLMTab from './Litellm'

type Tab = 'overview' | 'users' | 'tiers' | 'logs' | 'llm'

const AdminDashboard = () => {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('overview')
  const [gateKey, setGateKey] = useState(0)

  // 1. Initialize state matching your Chat component preference pattern
  const [dark, setDark] = useState<boolean>(() => {
    const savedTheme = localStorage.getItem('theme')
    if (savedTheme) {
      return savedTheme === 'dark'
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  // 2. Synchronize theme switches with the HTML element tree
  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }, [dark])

  // If a request returns a 401/403 deep inside a child panel component
  const handleExpired = () => {
    localStorage.removeItem('accessToken')
    sessionStorage.removeItem('accessToken')
    setGateKey(k => k + 1) // Forces Guard re-evaluation -> displays Access Denied instantly
  }

  const handleLogout = () => {
    localStorage.removeItem('accessToken')
    sessionStorage.removeItem('accessToken')
    navigate('/')
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'users',    label: 'Users' },
    { id: 'tiers',    label: 'Tiers' },
    { id: 'logs',     label: 'Activity Logs' },
    { id: 'llm',      label: 'LLM Logs' }
  ]

  return (
    <AdminGate key={gateKey}>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors duration-300">
        
        {/* Header */}
        <header className="sticky top-0 z-20 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/90 backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-6 md:px-10 h-16 flex items-center justify-between">

            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/')}
                className="p-2 rounded-lg text-slate-500 hover:text-slate-950 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                title="Back to app"
              >
                <ArrowLeft size={18} />
              </button>
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-linear-to-tr from-indigo-600 to-violet-600 shadow-lg shadow-indigo-900/30">
                  <Database size={16} className="text-white" />
                </div>
                <span className="font-bold text-lg bg-linear-to-r from-indigo-600 to-violet-600 dark:from-indigo-400 dark:to-violet-400 bg-clip-text text-transparent tracking-tight">
                  Admin Portal
                </span>
              </div>
            </div>

            {/* Tab Nav + Theme Toggle + Logout */}
            <div className="flex items-center gap-3 sm:gap-4">
              <nav className="hidden sm:flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-1">
                {TABS.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition cursor-pointer ${
                      tab === t.id
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/40'
                        : 'text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </nav>

              {/* Desktop Theme Toggle Button */}
              <button
                onClick={() => setDark(!dark)}
                className="p-2 text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg transition cursor-pointer"
                title={dark ? "Switch to Light Mode" : "Switch to Dark Mode"}
              >
                {dark ? <Sun size={15} /> : <Moon size={15} />}
              </button>

              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 border border-slate-200 dark:border-slate-800 hover:border-rose-500/30 px-3 py-2 rounded-lg transition cursor-pointer"
                title="Log out session"
              >
                <LogOut size={14} />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>

          </div>

          {/* Mobile tab nav */}
          <div className="sm:hidden flex border-t border-slate-200 dark:border-slate-800">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 py-2.5 text-xs font-semibold transition cursor-pointer ${
                  tab === t.id
                    ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-500'
                    : 'text-slate-400 dark:text-slate-500 border-b-2 border-transparent'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </header>

        {/* Main */}
        <main className="max-w-7xl mx-auto px-6 md:px-10 py-8">
          {tab === 'overview' && <OverviewTab onExpired={handleExpired} />}
          {tab === 'users'    && <UsersTab    onExpired={handleExpired} />}
          {tab === 'tiers'    && <TiersTab    onExpired={handleExpired} />}
          {tab === 'logs'     && <LogsTab     onExpired={handleExpired} />}
          {tab === 'llm'      && <LLMTab      onExpired={handleExpired} />}
        </main>

      </div>
    </AdminGate>
  )
}

export default AdminDashboard