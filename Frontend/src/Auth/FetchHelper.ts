// If you inlined the token variable into axiosInstance.ts, use this:
import { getAccessToken, setAccessToken, clearAccessToken } from "./AxiosHelper"

// If you kept the separate tokens.ts file, use this instead:
// import { tokenStore } from "./tokens"
// import api from "./AxiosInstance"
// and replace getAccessToken() calls below with tokenStore.get()

const BASE_URL = import.meta.env.VITE_BASE_URL

// ✅ Reads access token from memory instead of cookie
export const authHeader = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${getAccessToken()}`,
})

// ── Helper: refresh access token and retry a fetch call ───────────────────────
// fetch bypasses the axios interceptor, so we handle 401 manually here.
export const fetchWithRefresh = async (input: RequestInfo, init: RequestInit): Promise<Response> => {
  let res = await fetch(input, init)

  if (res.status !== 401) return res

  // 401 — try to refresh
  const refreshToken = localStorage.getItem('refreshToken')
  if (!refreshToken) {
    clearAccessToken()
    window.location.href = '/login'
    throw new Error('Session expired')
  }

  const refreshRes = await fetch(`${BASE_URL}/login/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })

  if (!refreshRes.ok) {
    clearAccessToken()
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('user')
    window.location.href = '/login'
    throw new Error('Session expired')
  }

  const data = await refreshRes.json()
  setAccessToken(data.accessToken)
  localStorage.setItem('refreshToken', data.refreshToken)

  // Retry the original request with the new token
  const retryInit = {
    ...init,
    headers: {
      ...(init.headers as Record<string, string>),
      Authorization: `Bearer ${data.accessToken}`,
    },
  }

  return fetch(input, retryInit)
}