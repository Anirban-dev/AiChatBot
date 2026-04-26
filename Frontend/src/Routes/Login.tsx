import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const BASE_URL = import.meta.env.VITE_BASE_URL;

const Login = () => {
  const [isLogin, setIsLogin] = useState(true)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const navigate = useNavigate()

  const handleSubmit = async (e: any) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const url = isLogin
        ? `${BASE_URL}/auth/login`
        : `${BASE_URL}/auth/signup`

      const body = isLogin
        ? { email, password }
        : { name, email, password }

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.message || 'Something went wrong')
      }

      // Save token
      localStorage.setItem('token', data.token)

      navigate('/')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center h-screen
      bg-gray-100 dark:bg-gray-900"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm p-6 rounded-xl shadow-md
        bg-white dark:bg-gray-800"
      >
        <h2 className="text-2xl font-semibold mb-6 text-center
          text-black dark:text-white"
        >
          {isLogin ? 'Login' : 'Sign Up'}
        </h2>

        {/* Name (Signup only) */}
        {!isLogin && (
          <input
            type="text"
            placeholder="Name"
            className="w-full p-2 mb-4 rounded-lg border
            border-gray-300 dark:border-gray-600
            bg-white dark:bg-gray-700
            text-black dark:text-white"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        )}

        {/* Email */}
        <input
          type="email"
          placeholder="Email"
          className="w-full p-2 mb-4 rounded-lg border
          border-gray-300 dark:border-gray-600
          bg-white dark:bg-gray-700
          text-black dark:text-white"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        {/* Password */}
        <input
          type="password"
          placeholder="Password"
          className="w-full p-2 mb-4 rounded-lg border
          border-gray-300 dark:border-gray-600
          bg-white dark:bg-gray-700
          text-black dark:text-white"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {/* Error */}
        {error && (
          <p className="text-red-500 text-sm mb-3">{error}</p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 rounded-lg
          bg-blue-500 hover:bg-blue-600 text-white
          disabled:opacity-50"
        >
          {loading
            ? isLogin
              ? 'Logging in...'
              : 'Signing up...'
            : isLogin
            ? 'Login'
            : 'Sign Up'}
        </button>

        {/* Toggle */}
        <p className="text-sm mt-4 text-center text-gray-600 dark:text-gray-400">
          {isLogin ? "Don't have an account?" : 'Already have an account?'}
          <span
            onClick={() => setIsLogin(!isLogin)}
            className="ml-1 text-blue-500 cursor-pointer"
          >
            {isLogin ? 'Sign up' : 'Login'}
          </span>
        </p>
      </form>
    </div>
  )
}

export default Login