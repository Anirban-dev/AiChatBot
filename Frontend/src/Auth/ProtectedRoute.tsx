import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import axios from 'axios'
import { clearAccessToken, getAccessToken, setAccessToken } from './AxiosHelper'

// ProtectedRoute does a silent refresh on every page load/refresh.
// The access token lives in memory, so it's gone after a refresh.
// We restore it here before rendering children — user never sees a login page.

const BASE_URL = import.meta.env.VITE_BASE_URL

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const [status, setStatus] = useState<'checking' | 'ok' | 'unauth'>('checking')

  useEffect(() => {
    const restoreSession = async () => {
      // If access token is already in memory (same-tab navigation), skip
      if (getAccessToken()) {
        setStatus('ok')
        return
      }

      const refreshToken = localStorage.getItem('refreshToken')
      if (!refreshToken) {
        setStatus('unauth')
        return
      }

      try {
        const { data } = await axios.post(`${BASE_URL}/login/refresh`, { refreshToken })
        setAccessToken(data.accessToken)
        localStorage.setItem('refreshToken', data.refreshToken) // rotated
        setStatus('ok')
      } catch {
        // Refresh token expired or invalid — clear everything
        clearAccessToken()
        localStorage.removeItem('refreshToken')
        localStorage.removeItem('user')
        setStatus('unauth')
      }
    }

    restoreSession()
  }, [])

  if (status === 'checking') {
    // Render nothing (or a spinner) while we check — avoids flash of login page
    return null
  }

  if (status === 'unauth') {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

export default ProtectedRoute