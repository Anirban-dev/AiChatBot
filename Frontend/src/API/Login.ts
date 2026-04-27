// src/API/auth.ts
const BASE_URL = import.meta.env.VITE_BASE_URL

export const login = async (email: string, password: string) => {
  const res = await fetch(`${BASE_URL}/login/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Login failed')
  return data
}

export const signup = async (name: string, email: string, password: string) => {
  const res = await fetch(`${BASE_URL}/login/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Signup failed')
  return data
}

export const logout = () => {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  window.location.href = '/login'
}