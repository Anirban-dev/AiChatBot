import { deleteCookie } from "../Auth/authHelper"
import api from "./AxiosInstance"

interface User {
  id: string
  name: string
  email: string
  avatar?: string
  role?: string
}

export const login = async (email: string, password: string) => {
  const res = await api.post(`/login/login`, { email, password })
  return res.data
}

export const sendOtp = async (email: string) => {
  const res = await api.post(`/login/send-otp`, { email })
  return res.data
}

export const signup = async (name: string, email: string, password: string, otp: string) => {
  const res = await api.post(`/login/signup`, { name, email, password, otp })
  return res.data
}

export const googleLogin = async (code: string): Promise<{ user: User; token: string }> => {
  const res = await api.post(`/login/google-login`, { code })
  return res.data
}

export const logout = () => {
  deleteCookie('token')
  deleteCookie('user')
  window.location.href = '/login'
}