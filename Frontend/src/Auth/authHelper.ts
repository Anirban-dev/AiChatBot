import { clearAccessToken, setAccessToken } from './AxiosHelper'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserData {
  id: string
  name: string
  email: string
  role?: string
}

// ─── Cookie Helpers (kept for anything that still needs cookies) ───────────────

const COOKIE_EXPIRES_DAYS = 30

export const setCookie = (name: string, value: string, days = COOKIE_EXPIRES_DAYS) => {
  const expires = new Date(Date.now() + days * 864e5).toUTCString()
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Strict`
}

export const getCookie = (name: string): string | null => {
  const match = document.cookie
    .split('; ')
    .find(row => row.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.split('=')[1]) : null
}

export const deleteCookie = (name: string) => {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/`
}

// ─── Current Session ──────────────────────────────────────────────────────────
// User profile goes in localStorage (not sensitive — no tokens here)

export const saveSession = (
  user: UserData,
  accessToken: string,
  refreshToken: string
) => {
  setAccessToken(accessToken)
  setCookie('refreshToken', refreshToken, COOKIE_EXPIRES_DAYS)
  localStorage.setItem('user', JSON.stringify(user))
  saveAccount(user, refreshToken) // persist in the accounts list too
}

export const clearSession = () => {
  clearAccessToken()
  deleteCookie('refreshToken')
  localStorage.removeItem('user')
}

export const getCurrentUser = (): UserData | null => {
  const user = localStorage.getItem('user')
  return user ? JSON.parse(user) : null
}

// ─── Saved Accounts (multi-account switcher) ──────────────────────────────────
// ✅ Moved from cookies to localStorage — cookies have a 4KB size limit
//    and storing multiple accounts with tokens blows that easily.
// Each entry stores the refresh token so switching is seamless.

const SAVED_ACCOUNTS_KEY = 'saved_accounts'

interface SavedAccount extends UserData {
  refreshToken: string
}

export const getSavedAccounts = (): SavedAccount[] => {
  const saved = localStorage.getItem(SAVED_ACCOUNTS_KEY)
  return saved ? JSON.parse(saved) : []
}

export const saveAccount = (user: UserData, refreshToken: string) => {
  const accounts = getSavedAccounts()
  const newAccount: SavedAccount = { ...user, refreshToken }

  const existingIndex = accounts.findIndex(a => a.email === user.email)
  if (existingIndex > -1) {
    accounts[existingIndex] = newAccount
  } else {
    accounts.push(newAccount)
  }

  localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(accounts))
}

export const removeAccount = (email: string) => {
  const accounts = getSavedAccounts()
  const filtered = accounts.filter(a => a.email !== email)
  localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(filtered))

  const current = getCurrentUser()
  if (current?.email === email) {
    clearSession()
    window.location.href = '/login'
  }
}

export const switchAccount = async (email: string) => {
  const accounts = getSavedAccounts()
  const target = accounts.find(a => a.email === email)
  if (!target) return

  // Use the saved refresh token to get a fresh access token for that account
  try {
    const BASE_URL = import.meta.env.VITE_BASE_URL
    const res = await fetch(`${BASE_URL}/login/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: target.refreshToken }),
    })

    if (!res.ok) throw new Error('Refresh failed')

    const data = await res.json()

    // Update the stored refresh token for this account (it rotated)
    saveAccount(target, data.refreshToken)

    setAccessToken(data.accessToken)
    setCookie('refreshToken', data.refreshToken, COOKIE_EXPIRES_DAYS)
    localStorage.setItem('user', JSON.stringify({
      id: target.id, name: target.name, email: target.email
    }))

    window.location.reload()
  } catch {
    // Saved refresh token expired — remove the stale account
    removeAccount(email)
    window.location.href = '/login'
  }
}