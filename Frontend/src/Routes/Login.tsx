import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, signup, googleLogin, sendOtp } from '../API/Login'
import { saveSession } from '../Auth/authHelper'
import { useGoogleLogin } from '@react-oauth/google'
import { Mail, Lock, User, ArrowRight, Loader2, Sun, Moon } from 'lucide-react'

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
)

const InputField = ({
  icon: Icon,
  type,
  placeholder,
  value,
  onChange,
  required,
}: {
  icon: any
  type: string
  placeholder: string
  value: string
  onChange: (v: string) => void
  required?: boolean
}) => (
  <div className="relative">
    <Icon size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-secondary)' }} />
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={e => onChange(e.target.value)}
      required={required}
      className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400/30 transition-all"
      style={{
        backgroundColor: 'var(--border-light)',
        border: '1px solid var(--border-medium)',
        color: 'var(--text-primary)'
      }}
    />
  </div>
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

  // 1. Theme state initialization
  const [dark, setDark] = useState<boolean>(() => {
    const savedTheme = localStorage.getItem('theme')
    if (savedTheme) {
      return savedTheme === 'dark'
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  // 2. Theme side-effect engine
  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }, [dark])

  const navigate = useNavigate()

  const handleGoogleLogin = useGoogleLogin({
    flow: 'auth-code',
    onSuccess: async ({ code }) => {
      setLoading(true)
      setError('')
      try {
        const data = await googleLogin(code)
        saveSession(data.user, data.accessToken, data.refreshToken)
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
        saveSession(data.user, data.accessToken, data.refreshToken)
        navigate('/')
      } else {
        if (!otpSent) {
          await sendOtp(email)
          setOtpSent(true)
        } else {
          const data = await signup(name, email, password, otp)
          saveSession(data.user, data.accessToken, data.refreshToken)
          navigate('/')
        }
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const switchMode = () => {
    setIsLogin(!isLogin)
    setError('')
    setOtpSent(false)
    setOtp('')
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 relative transition-colors duration-300"
      style={{ backgroundColor: 'var(--bg-page)' }}
    >
      
      {/* Absolute Positioning Universal Theme Switcher Control */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
        <button
          onClick={() => setDark(!dark)}
          className="p-2.5 rounded-xl shadow-sm hover:opacity-80 transition cursor-pointer"
          style={{
            border: '1px solid var(--border-medium)',
            backgroundColor: 'var(--bg-card)',
            color: 'var(--text-secondary)'
          }}
          title={dark ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>

      <div className="w-full max-w-sm">

        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 items-center justify-center mb-4 shadow-lg shadow-amber-500/20">
            <span className="text-white text-xl">✦</span>
          </div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>ChatAI</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            {isLogin ? 'Welcome back' : 'Create your account'}
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl shadow-sm p-6 space-y-4"
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-medium)'
          }}
        >

          {/* Google button */}
          <button
            type="button"
            onClick={() => handleGoogleLogin()}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl
              border border-gray-200 dark:border-gray-700
              bg-white dark:bg-gray-800
              hover:bg-gray-50 dark:hover:bg-gray-700
              text-gray-700 dark:text-gray-200
              text-sm font-medium transition-all
              disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <GoogleIcon />
            {isLogin ? 'Continue with Google' : 'Sign up with Google'}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-gray-100 dark:border-gray-800" />
            <span className="text-xs text-gray-400 dark:text-gray-500">or</span>
            <div className="flex-1 border-t border-gray-100 dark:border-gray-800" />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            {!isLogin && (
              <InputField icon={User} type="text" placeholder="Full name" value={name} onChange={setName} required />
            )}

            <InputField icon={Mail} type="email" placeholder="Email address" value={email} onChange={setEmail} required />
            <InputField icon={Lock} type="password" placeholder="Password" value={password} onChange={setPassword} required />

            {!isLogin && otpSent && (
              <div>
                <input
                  type="text"
                  placeholder="Enter OTP sent to your email"
                  value={otp}
                  onChange={e => setOtp(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 text-sm rounded-xl text-center tracking-[0.3em] font-mono
                    bg-gray-50 dark:bg-gray-800
                    border-2 border-blue-400 dark:border-blue-500
                    text-gray-900 dark:text-white placeholder-gray-400
                    focus:outline-none focus:ring-2 focus:ring-blue-500/30
                    transition-all"
                />
                <p className="text-xs text-gray-400 text-center mt-1.5">Check your inbox for the verification code</p>
              </div>
            )}

            {error && (
              <div className="px-3 py-2.5 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20">
                <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl
                bg-blue-600 hover:bg-blue-700 active:bg-blue-800
                text-white text-sm font-medium
                transition-all shadow-sm shadow-blue-500/20
                disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <>
                  {isLogin ? 'Sign in' : otpSent ? 'Create account' : 'Send OTP'}
                  <ArrowRight size={15} />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Toggle mode */}
        <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-5">
          {isLogin ? "Don't have an account?" : 'Already have an account?'}
          {' '}
          <button
            onClick={switchMode}
            className="text-blue-600 dark:text-blue-400 font-medium hover:underline cursor-pointer"
          >
            {isLogin ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}

export default Login