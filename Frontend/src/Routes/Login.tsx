import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, signup, googleLogin } from '../API/Login'
import { saveAccount } from '../Auth/authHelper'
import { GoogleLogin } from '@react-oauth/google'

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
      const data = isLogin
        ? await login(email, password)
        : await signup(name, email, password)

      saveAccount(data.user, data.token)
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
          disabled:opacity-50 cursor-pointer mb-4"
        >
          {loading
            ? isLogin
              ? 'Logging in...'
              : 'Signing up...'
            : isLogin
              ? 'Login'
              : 'Sign Up'}
        </button>

        <div className="flex items-center justify-center mb-4">
          <div className="border-t border-gray-300 dark:border-gray-600 flex-grow"></div>
          <span className="px-2 text-gray-500 text-xs uppercase">Or</span>
          <div className="border-t border-gray-300 dark:border-gray-600 flex-grow"></div>
        </div>

        <div className="flex justify-center w-full">
          <GoogleLogin
            onSuccess={async (credentialResponse) => {
              if (credentialResponse.credential) {
                setLoading(true)
                try {
                  const data = await googleLogin(credentialResponse.credential)
                  saveAccount(data.user, data.token)
                  navigate('/')
                } catch (err: any) {
                  setError(err.message)
                } finally {
                  setLoading(false)
                }
              }
            }}
            onError={() => {
              setError('Google Login Failed')
            }}
            useOneTap
            theme="filled_black"
            shape="pill"
          />
        </div>

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