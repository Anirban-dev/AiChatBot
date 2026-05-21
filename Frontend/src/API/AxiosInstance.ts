import axios from 'axios'
import { getCookie, setCookie, deleteCookie } from "../Auth/authHelper"

const BASE_URL = import.meta.env.VITE_BASE_URL

const ACCESS_TOKEN_COOKIE = 'accessToken'
const ACCESS_TOKEN_EXPIRES_DAYS = 1 / 96 // 15 minutes

const api = axios.create({ baseURL: BASE_URL })

// ── Access token: now backed by a cookie instead of a bare variable ───────────
export const getAccessToken  = ()        => getCookie(ACCESS_TOKEN_COOKIE)
export const setAccessToken = (t: string) => {
  if (!t) {
    console.warn('setAccessToken called with empty token — skipping')
    return
  }
  setCookie(ACCESS_TOKEN_COOKIE, t, ACCESS_TOKEN_EXPIRES_DAYS)
}
export const clearAccessToken = ()       => deleteCookie(ACCESS_TOKEN_COOKIE)

// ── Request: attach access token from cookie ──────────────────────────────────
api.interceptors.request.use(config => {
  const token = getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ── Response: on 401 → refresh → retry original request ──────────────────────
let isRefreshing = false
// Queue of requests that arrived while a refresh was already in flight
let queue: Array<{ resolve: (t: string) => void; reject: (e: unknown) => void }> = []

const drainQueue = (token: string) => queue.forEach(p => p.resolve(token))
const rejectQueue = (err: unknown) => queue.forEach(p => p.reject(err))

api.interceptors.response.use(
  res => res,
  async err => {
    const original = err.config

    // Only intercept 401s that haven't already been retried
    if (err.response?.status !== 401 || original._retry) {
      const message = err.response?.data?.error || err.message || 'Something went wrong'
      throw new Error(message)
    }

    original._retry = true

    // If a refresh is already happening, queue this request until it resolves
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        queue.push({
          resolve: (token) => {
            original.headers.Authorization = `Bearer ${token}`
            resolve(api(original))
          },
          reject,
        })
      })
    }

    isRefreshing = true

    try {
      const refreshToken = localStorage.getItem('refreshToken')
      if (!refreshToken) throw new Error('No refresh token')

      const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken })

      // Store the new tokens
      setAccessToken(data.accessToken)
      localStorage.setItem('refreshToken', data.refreshToken) // rotated

      drainQueue(data.accessToken)

      // Retry the original request with new access token
      original.headers.Authorization = `Bearer ${data.accessToken}`
      return api(original)
    } catch (refreshErr) {
      rejectQueue(refreshErr)
      // Refresh failed — session is dead, send to login
      clearAccessToken()
      localStorage.removeItem('refreshToken')
      window.location.href = '/login'
      throw refreshErr
    } finally {
      isRefreshing = false
      queue = []
    }
  }
)

export default api