import { useState, useRef, useEffect } from 'react'
import { X, User, Mail, Lock, Eye, EyeOff, LogOut, RefreshCw, Check, AlertCircle, Trash2 } from 'lucide-react'
import { getSavedAccounts, switchAccount, removeAccount } from '../Auth/authHelper'
import { GoogleLogin } from '@react-oauth/google'
import { googleLogin } from '../API/Login'

interface AccountModalProps {
  isOpen: boolean
  onClose: () => void
  user: { name: string; email: string }
  onLogout: () => void
  onSave: (data: { name?: string; currentPassword?: string; newPassword?: string }) => Promise<void>
}

type Tab = 'details' | 'credentials' | 'accounts'

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
)

export default function AccountModal({ isOpen, onClose, user, onLogout, onSave }: AccountModalProps) {
  const [tab, setTab] = useState<Tab>('details')
  const [name, setName] = useState(user.name)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [savedAccounts, setSavedAccounts] = useState(getSavedAccounts())
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) {
      setTab('details')
      setStatus('idle')
      setErrorMsg('')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setName(user.name)
      setSavedAccounts(getSavedAccounts())
    }
  }, [isOpen, user.name])

  if (!isOpen) return null

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose()
  }

  const passwordsMatch = newPassword === confirmPassword
  const canSave = tab === 'details'
    ? name.trim() && name !== user.name
    : currentPassword && passwordsMatch

  const handleSave = async () => {
    setStatus('loading')
    setErrorMsg('')
    try {
      if (tab === 'details') {
        await onSave({ name })
      } else {
        if (!passwordsMatch) { setErrorMsg('Passwords do not match'); setStatus('error'); return }
        await onSave({ currentPassword, newPassword })
      }
      setStatus('success')
      setTimeout(() => setStatus('idle'), 2000)
    } catch (err: any) {
      setErrorMsg(err?.message || 'Something went wrong')
      setStatus('error')
    }
  }

  const handleGoogleSwitch = () => {
    // Wire up your Google OAuth here
    window.location.href = '/auth/google'
  }

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-md mx-4 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Account</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition">
            <X size={18} className="text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Avatar + info */}
        <div className="flex items-center gap-4 px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-lg font-bold select-none">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-medium text-gray-900 dark:text-white text-sm">{user.name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{user.email}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex px-6 pt-4 gap-1 overflow-x-auto no-scrollbar">
          {(['details', 'credentials', 'accounts'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setStatus('idle'); setErrorMsg('') }}
              className={`px-3 py-1.5 text-sm rounded-lg font-medium transition capitalize whitespace-nowrap
                ${tab === t
                  ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
            >
              {t === 'details' ? 'Account Details' : t === 'credentials' ? 'Credentials' : 'Saved Accounts'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-3">

          {tab === 'details' && (
            <>
              {/* Name */}
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Display Name</label>
                <div className="relative">
                  <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700
                      bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white
                      focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition"
                  />
                </div>
              </div>

              {/* Email (read-only) */}
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Email</label>
                <div className="relative">
                  <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    value={user.email}
                    readOnly
                    className="w-full pl-9 pr-4 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700
                      bg-gray-100 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400 cursor-not-allowed select-none"
                  />
                </div>
                <p className="text-[11px] text-gray-400 mt-1">Email cannot be changed</p>
              </div>
            </>
          )}

          {tab === 'credentials' && (
            <>
              {/* Current Password */}
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Current Password</label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type={showCurrent ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    autoComplete="current-password"
                    className="w-full pl-9 pr-10 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700
                      bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white
                      focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition"
                  />
                  <button type="button" onClick={() => setShowCurrent(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">New Password</label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type={showNew ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    className="w-full pl-9 pr-10 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700
                      bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white
                      focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition"
                  />
                  <button type="button" onClick={() => setShowNew(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Confirm Password</label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    className={`w-full pl-9 pr-10 py-2.5 text-sm rounded-lg border transition
                      bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white
                      focus:outline-none focus:ring-2 focus:ring-blue-500/40
                      ${confirmPassword && !passwordsMatch
                        ? 'border-red-400 dark:border-red-500'
                        : 'border-gray-200 dark:border-gray-700'}`}
                  />
                  <button type="button" onClick={() => setShowConfirm(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {confirmPassword && !passwordsMatch && (
                  <p className="text-[11px] text-red-500 mt-1">Passwords do not match</p>
                )}
              </div>
            </>
          )}

          {tab === 'accounts' && (
            <div className="space-y-3 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
              {savedAccounts.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">No other accounts saved</p>
              ) : (
                savedAccounts.map(acc => (
                  <div key={acc.email} className="flex items-center justify-between p-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-bold shrink-0">
                        {acc.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="overflow-hidden">
                        <p className="text-sm font-medium truncate dark:text-white">{acc.name}</p>
                        <p className="text-[11px] text-gray-500 truncate">{acc.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      {acc.email !== user.email ? (
                        <>
                          <button
                            onClick={() => switchAccount(acc.email)}
                            className="p-2 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-600 transition"
                            title="Switch to this account"
                          >
                            <RefreshCw size={14} />
                          </button>
                          <button
                            onClick={() => {
                              removeAccount(acc.email)
                              setSavedAccounts(getSavedAccounts())
                            }}
                            className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500 transition"
                            title="Remove account"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      ) : (
                        <span className="text-[10px] font-medium text-green-600 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-full">Current</span>
                      )}
                    </div>
                  </div>
                ))
              )}

              <button
                onClick={() => window.location.href = '/login'}
                className="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg border border-dashed border-gray-300 dark:border-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-400 dark:hover:border-gray-600 transition mt-2"
              >
                + Add Another Account
              </button>
            </div>
          )}

          {/* Status feedback */}
          {status === 'error' && errorMsg && (
            <div className="flex items-center gap-2 text-xs text-red-500 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded-lg">
              <AlertCircle size={13} /> {errorMsg}
            </div>
          )}
          {status === 'success' && (
            <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 dark:bg-green-950/30 px-3 py-2 rounded-lg">
              <Check size={13} /> Saved successfully
            </div>
          )}

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={!canSave || status === 'loading'}
            className="w-full py-2.5 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700
              text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {status === 'loading' ? 'Saving…' : 'Save Changes'}
          </button>
        </div>

        {/* Footer actions */}
        <div className="px-6 pb-5 space-y-2 border-t border-gray-100 dark:border-gray-800 pt-4">

          {/* Switch / Add account with Google */}
          <div className="flex justify-center w-full">
            <GoogleLogin
              onSuccess={async (credentialResponse) => {
                if (credentialResponse.credential) {
                  setStatus('loading')
                  try {
                    const data = await googleLogin(credentialResponse.credential)
                    const { saveAccount } = await import('../Auth/authHelper')
                    saveAccount(data.user, data.token)
                    setStatus('success')
                    setTimeout(() => {
                      onClose()
                      window.location.reload() // Reload to reflect account switch
                    }, 1000)
                  } catch (err: any) {
                    setErrorMsg(err.message)
                    setStatus('error')
                  }
                }
              }}
              onError={() => {
                setErrorMsg('Google Login Failed')
                setStatus('error')
              }}
              theme="outline"
              shape="pill"
              text="continue_with"
              width="100%"
            />
          </div>

          <button
            onClick={() => setTab('accounts')}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg
              border border-gray-200 dark:border-gray-700
              text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
          >
            <RefreshCw size={15} />
            Switch Account
          </button>

          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg
              text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition"
          >
            <LogOut size={15} />
            Logout
          </button>
        </div>
      </div>
    </div>
  )
}