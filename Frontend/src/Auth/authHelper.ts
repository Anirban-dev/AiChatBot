export interface UserData {
  id: string
  name: string
  email: string
  token: string
}

const SAVED_ACCOUNTS_KEY = 'saved_accounts'
const COOKIE_EXPIRES_DAYS = 30

// ─── Cookie Helpers ───────────────────────────────────────────────────────────

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

// ─── Account Storage ─────────────────────────────────────────────────────────

export const getSavedAccounts = (): UserData[] => {
  const saved = getCookie(SAVED_ACCOUNTS_KEY)
  return saved ? JSON.parse(saved) : []
}

export const saveAccount = (user: { id: string; name: string; email: string }, token: string) => {
  const accounts = getSavedAccounts()
  const newAccount: UserData = { ...user, token }

  const existingIndex = accounts.findIndex(a => a.email === user.email)
  if (existingIndex > -1) {
    accounts[existingIndex] = newAccount
  } else {
    accounts.push(newAccount)
  }

  setCookie(SAVED_ACCOUNTS_KEY, JSON.stringify(accounts))
  setCookie('token', token)
  setCookie('user', JSON.stringify(user))
}

export const removeAccount = (email: string) => {
  const accounts = getSavedAccounts()
  const filtered = accounts.filter(a => a.email !== email)
  setCookie(SAVED_ACCOUNTS_KEY, JSON.stringify(filtered))

  const currentUser = JSON.parse(getCookie('user') || '{}')
  if (currentUser.email === email) {
    deleteCookie('token')
    deleteCookie('user')
    window.location.href = '/login'
  }
}

export const switchAccount = (email: string) => {
  const accounts = getSavedAccounts()
  const target = accounts.find(a => a.email === email)
  if (target) {
    setCookie('token', target.token)
    setCookie('user', JSON.stringify({ id: target.id, name: target.name, email: target.email }))
    window.location.reload()
  }
}

export const getCurrentUser = () => {
  const user = getCookie('user')
  return user ? JSON.parse(user) : null
}