import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, User, Mail, Lock, Eye, EyeOff, LogOut, RefreshCw, Check, AlertCircle, Trash2 } from 'lucide-react'
import { useGoogleLogin } from '@react-oauth/google'
import { getSavedAccounts, switchAccount, removeAccount, saveAccount } from '../Auth/authHelper'
import { googleLogin } from '../API/Login'

type Tab = 'details' | 'credentials' | 'accounts'

interface AccountModalProps {
  isOpen: boolean
  onClose: () => void
  user: { name: string; email: string }
  onLogout: () => void
  onSave: (data: { name?: string; currentPassword?: string; newPassword?: string }) => Promise<void>
  initialTab?: Tab
}

// Standalone Google icon — no longer importing GoogleLogin component
const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
)

export default function AccountModal({
  isOpen, onClose, user, onLogout, onSave, initialTab = 'details'
}: AccountModalProps) {
  const navigate = useNavigate()

  const [tab, setTab] = useState<Tab>(initialTab)
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
    if (isOpen) {
      setTab(initialTab)
    } else {
      setStatus('idle')
      setErrorMsg('')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setName(user.name)
      setSavedAccounts(getSavedAccounts())
    }
  }, [isOpen, initialTab, user.name])

  // useGoogleLogin opens a popup and gives back an auth code (not an id_token).
  // The backend exchanges the code using GOOGLE_CLIENT_SECRET — the secret
  // never touches the browser.
  const loginWithGoogle = useGoogleLogin({
    flow: 'auth-code',
    onSuccess: async ({ code }) => {
      setStatus('loading')
      setErrorMsg('')
      try {
        const data = await googleLogin(code)
        saveAccount(data.user, data.accessToken)
        setStatus('success')
        setTimeout(() => {
          onClose()
          navigate('/', { replace: true })
        }, 1000)
      } catch (err: any) {
        setErrorMsg(err?.message ?? 'Google login failed')
        setStatus('error')
      }
    },
    onError: () => {
      setErrorMsg('Google login failed. Please try again.')
      setStatus('error')
    },
  })

  if (!isOpen) return null

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose()
  }

  const passwordsMatch = newPassword === confirmPassword
  const showSaveButton = tab !== 'accounts'
  const canSave = tab === 'details'
    ? name.trim() !== '' && name !== user.name
    : currentPassword !== '' && newPassword !== '' && passwordsMatch

  const handleSave = async () => {
    setStatus('loading')
    setErrorMsg('')
    try {
      if (tab === 'details') {
        await onSave({ name })
      } else {
        if (!passwordsMatch) {
          setErrorMsg('Passwords do not match')
          setStatus('error')
          return
        }
        await onSave({ currentPassword, newPassword })
      }
      setStatus('success')
      setTimeout(() => setStatus('idle'), 2000)
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Something went wrong')
      setStatus('error')
    }
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
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition cursor-pointer">
            <X size={18} className="text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Avatar + info */}
        <div className="flex items-center gap-4 px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="w-12 h-12 rounded-full from-blue-500 to-indigo-600 flex items-center justify-center text-white text-lg font-bold select-none">
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
              className={`px-3 py-1.5 text-sm rounded-lg font-medium transition capitalize whitespace-nowrap cursor-pointer
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
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Display Name</label>
                <div className="relative">
                  <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700
                      bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white cursor-text
                      focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition"
                  />
                </div>
              </div>
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
              {[
                { label: 'Current Password', value: currentPassword, setter: setCurrentPassword, show: showCurrent, toggle: () => setShowCurrent(v => !v), complete: 'current-password', invalid: false },
                { label: 'New Password',     value: newPassword,     setter: setNewPassword,     show: showNew,     toggle: () => setShowNew(v => !v),     complete: 'new-password',     invalid: false },
                { label: 'Confirm Password', value: confirmPassword, setter: setConfirmPassword, show: showConfirm, toggle: () => setShowConfirm(v => !v), complete: 'new-password',     invalid: !!confirmPassword && !passwordsMatch },
              ].map(({ label, value, setter, show, toggle, complete, invalid }) => (
                <div key={label}>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">{label}</label>
                  <div className="relative">
                    <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type={show ? 'text' : 'password'}
                      value={value}
                      onChange={e => setter(e.target.value)}
                      autoComplete={complete}
                      className={`w-full pl-9 pr-10 py-2.5 text-sm rounded-lg border transition cursor-text
                        bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white
                        focus:outline-none focus:ring-2 focus:ring-blue-500/40
                        ${invalid ? 'border-red-400 dark:border-red-500' : 'border-gray-200 dark:border-gray-700'}`}
                    />
                    <button type="button" onClick={toggle}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer">
                      {show ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  {invalid && <p className="text-[11px] text-red-500 mt-1">Passwords do not match</p>}
                </div>
              ))}
            </>
          )}

          {tab === 'accounts' && (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
              {savedAccounts.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">No other accounts saved</p>
              ) : (
                savedAccounts.map(acc => {
                  const isCurrent = acc.email === user.email
                  return (
                    <div
                      key={acc.email}
                      onClick={() => !isCurrent && switchAccount(acc.email)}
                      className={`flex items-center justify-between p-3 rounded-xl border transition
                        border-gray-100 dark:border-gray-800
                        ${isCurrent
                          ? 'bg-gray-50/50 dark:bg-gray-800/30'
                          : 'bg-gray-50/50 dark:bg-gray-800/30 cursor-pointer hover:bg-blue-50/60 dark:hover:bg-blue-900/20 hover:border-blue-200 dark:hover:border-blue-800'
                        }`}
                    >
                      <div className="flex items-center gap-3 overflow-hidden flex-1 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-bold shrink-0">
                          {acc.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="overflow-hidden">
                          <p className="text-sm font-medium truncate dark:text-white">{acc.name}</p>
                          <p className="text-[11px] text-gray-500 truncate">{acc.email}</p>
                        </div>
                      </div>
                      <div className="shrink-0 ml-2">
                        {isCurrent ? (
                          <span className="text-[10px] font-medium text-green-600 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-full">Current</span>
                        ) : (
                          <button
                            onClick={e => { e.stopPropagation(); removeAccount(acc.email); setSavedAccounts(getSavedAccounts()) }}
                            className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-red-400 hover:text-red-500 transition cursor-pointer"
                            title="Remove account"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
              <button
                onClick={() => { onClose(); navigate('/login') }}
                className="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg
                  border border-dashed border-gray-300 dark:border-gray-700
                  text-gray-500 hover:text-gray-700 dark:hover:text-gray-300
                  hover:border-gray-400 dark:hover:border-gray-600 transition cursor-pointer mt-1"
              >
                + Add Another Account
              </button>
            </div>
          )}

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

          {showSaveButton && (
            <button
              onClick={handleSave}
              disabled={!canSave || status === 'loading'}
              className="w-full py-2.5 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700
                text-white transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {status === 'loading' ? 'Saving…' : 'Save Changes'}
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 space-y-2 border-t border-gray-100 dark:border-gray-800 pt-4">

          {/* useGoogleLogin — plain button instead of Google's iframe widget */}
          <button
            onClick={() => loginWithGoogle()}
            disabled={status === 'loading'}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-full
              border border-gray-300 dark:border-gray-600
              text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800
              transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <GoogleIcon />
            Continue with Google
          </button>

          <button
            onClick={() => setTab('accounts')}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg
              border border-gray-200 dark:border-gray-700
              text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition cursor-pointer"
          >
            <RefreshCw size={15} />
            Switch Account
          </button>

          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg
              text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition cursor-pointer"
          >
            <LogOut size={15} />
            Logout
          </button>
        </div>
      </div>
    </div>
  )
}