import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, signup, googleLogin, sendOtp } from '../API/Login'
import { saveAccount } from '../Auth/authHelper'
import { useGoogleLogin } from '@react-oauth/google'

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
)

const Login = () => {
  const [isLogin, setIsLogin] = useState(true)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(false)

  const navigate = useNavigate()

  // Use the Code Flow hook
  const handleGoogleLogin = useGoogleLogin({
    flow: 'auth-code',
    onSuccess: async ({ code }) => {
      setLoading(true)
      setError('')
      try {
        const data = await googleLogin(code) // Sends code to backend
        saveAccount(data.user, data.token)
        navigate('/')
      } catch (err: any) {
        setError(err.message ?? 'Google login failed')
      } finally {
        setLoading(false)
      }
    },
    onError: () => setError('Google login failed. Please try again.'),
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      if (isLogin) {
        const data = await login(email, password)
        saveAccount(data.user, data.token)
        navigate('/')
      } else {
        if (!otpSent) {
          await sendOtp(email)
          setOtpSent(true)
        } else {
          const data = await signup(name, email, password, otp)
          saveAccount(data.user, data.token)
          navigate('/')
        }
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center h-screen bg-gray-100 dark:bg-gray-900">
      <form onSubmit={handleSubmit} className="w-full max-w-sm p-6 rounded-xl shadow-md bg-white dark:bg-gray-800">
        <h2 className="text-2xl font-semibold mb-6 text-center text-black dark:text-white">
          {isLogin ? 'Login' : 'Sign Up'}
        </h2>

        {!isLogin && (
          <input type="text" placeholder="Name" className="w-full p-2 mb-4 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-black dark:text-white" value={name} onChange={(e) => setName(e.target.value)} required />
        )}

        <input type="email" placeholder="Email" className="w-full p-2 mb-4 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-black dark:text-white" value={email} onChange={(e) => setEmail(e.target.value)} required />

        <input type="password" placeholder="Password" className="w-full p-2 mb-4 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-black dark:text-white" value={password} onChange={(e) => setPassword(e.target.value)} required />

        {!isLogin && otpSent && (
          <input
            type="text"
            placeholder="Enter OTP"
            className="w-full p-2 mb-4 rounded-lg border border-blue-500 dark:border-blue-400 bg-white dark:bg-gray-700 text-black dark:text-white"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            required
          />
        )}

        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

        <button type="submit" disabled={loading} className="w-full py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50 cursor-pointer mb-4">
          {loading ? 'Processing...' : isLogin ? 'Login' : otpSent ? 'Confirm Signup' : 'Sign Up'}
        </button>

        <div className="flex items-center justify-center mb-4">
          <div className="border-t border-gray-300 dark:border-gray-600 flex-grow" />
          <span className="px-2 text-gray-500 text-xs uppercase">Or</span>
          <div className="border-t border-gray-300 dark:border-gray-600 flex-grow" />
        </div>

        {/* Custom Google Button to trigger the hook */}
        <button
          type="button"
          onClick={() => handleGoogleLogin()}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 py-2 px-4 rounded-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-600 transition font-medium text-sm"
        >
          <GoogleIcon />
          {isLogin ? 'Sign in with Google' : 'Sign up with Google'}
        </button>

        <p className="text-sm mt-4 text-center text-gray-600 dark:text-gray-400">
          {isLogin ? "Don't have an account?" : 'Already have an account?'}
          <span onClick={() => { setIsLogin(!isLogin); setError(''); setOtpSent(false) }} className="ml-1 text-blue-500 cursor-pointer hover:underline">
            {isLogin ? 'Sign up' : 'Login'}
          </span>
        </p>
      </form>
    </div>
  )
}

export default Login