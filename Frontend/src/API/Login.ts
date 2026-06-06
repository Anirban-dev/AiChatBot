// API/Login.ts
import { clearSession } from "../Auth/authHelper"   // ← replaces deleteCookie
import api from "../Auth/AxiosHelper"

interface User {
  id: string
  name: string
  email: string
  avatar?: string
  role?: string
}

// Single source of truth for what the backend returns on auth
interface AuthResponse {
  user: User
  accessToken: string          // your backend's field name — keep as-is
  refreshToken: string   // confirm this exists in your backend response
}

export const login = async (email: string, password: string): Promise<AuthResponse> => {
  const res = await api.post(`/login/login`, { email, password })
  return res.data
}

export const sendOtp = async (email: string) => {
  const res = await api.post(`/login/send-otp`, { email })
  return res.data
}

export const signup = async (
  name: string,
  email: string,
  password: string,
  otp: string
): Promise<AuthResponse> => {
  const res = await api.post(`/login/signup`, { name, email, password, otp })
  return res.data
}

export const googleLogin = async (code: string): Promise<AuthResponse> => {
  const res = await api.post(`/login/google-login`, { code })
  return res.data
}

export const logout = () => {
  clearSession()
  window.location.href = '/login/login'
}