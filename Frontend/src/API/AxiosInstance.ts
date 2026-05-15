import axios from 'axios'

const BASE_URL = import.meta.env.VITE_BASE_URL

const api = axios.create({ baseURL: BASE_URL })

// ── Access token Handler ──────────────────────────────────────────────────────
let accessToken: string | null = null
export const getAccessToken = () => accessToken
export const setAccessToken = (t: string) => { accessToken = t }
export const clearAccessToken = () => { accessToken = null }


// ── Request: attach access token from memory ──────────────────────────────────
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