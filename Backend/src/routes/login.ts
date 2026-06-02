import { Router, Request, Response } from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { User } from '../models/user'
import { OAuth2Client } from 'google-auth-library'
import { redis } from '../utils/redis'
import { sendOTP } from '../utils/email'
import { googleLoginLimiter, refreshLimiter } from '../utils/ratelimitHelper'
import { writeLog } from '../utils/logger'

const router = Router()
const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'postmessage'
)

// ✅ Fail fast if secrets are missing
const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) throw new Error('JWT_SECRET env var is required')

const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET
if (!JWT_REFRESH_SECRET) throw new Error('JWT_REFRESH_SECRET env var is required')

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
if (!GOOGLE_CLIENT_ID) throw new Error('GOOGLE_CLIENT_ID env var is required')

// ── Token Helpers (🌟 UPDATED TO INCLUDE TIER) ────────────────────────────────

const signAccessToken = (userId: string, tier: string, role: string) =>
  jwt.sign({ id: userId, tier, role }, JWT_SECRET, { expiresIn: '15m' })

const signRefreshToken = (userId: string, tier: string, role: string) =>
  jwt.sign({ id: userId, tier, role }, JWT_REFRESH_SECRET, { expiresIn: '7d' })

const saveRefreshToken = async (userId: string, refreshToken: string) => {
  const hashed = crypto.createHash('sha256').update(refreshToken).digest('hex')
  await redis.set(`refresh:${userId}`, hashed, 'EX', 60 * 60 * 24 * 7)
}

const verifyStoredRefreshToken = async (userId: string, refreshToken: string): Promise<boolean> => {
  const stored = await redis.get(`refresh:${userId}`)
  if (!stored) return false
  const hashed = crypto.createHash('sha256').update(refreshToken).digest('hex')
  return stored === hashed
}

// ── Brute Force Helpers ──────────────────────────────────────────────────────

const MAX_LOGIN_ATTEMPTS = 5
const LOGIN_BLOCK_TTL    = 15 * 60
const LOGIN_WINDOW_TTL   = 10 * 60

const MAX_OTP_ATTEMPTS   = 5
const OTP_ATTEMPT_TTL    = 5 * 60

const isBlocked = async (key: string): Promise<boolean> => {
  return !!(await redis.get(`blocked:${key}`))
}

const recordFailedAttempt = async (key: string, windowTTL: number): Promise<number> => {
  const attempts = await redis.incr(`attempts:${key}`)
  if (attempts === 1) await redis.expire(`attempts:${key}`, windowTTL)
  return attempts
}

const blockIdentifier = async (key: string, blockTTL: number) => {
  await redis.set(`blocked:${key}`, '1', 'EX', blockTTL)
  await redis.del(`attempts:${key}`)
}

const clearAttempts = async (key: string) => {
  await redis.del(`attempts:${key}`, `blocked:${key}`)
}

// ── Google Login ─────────────────────────────────────────────────────────────
router.post('/google-login', googleLoginLimiter,  async (req: Request, res: Response) => {
  const { code } = req.body

  if (!code) {
    return res.status(400).json({ error: 'Authorization code is required' })
  }

  try {
    const { tokens } = await client.getToken(code)

    if (!tokens.id_token) {
      return res.status(400).json({ error: 'No ID token returned from Google' })
    }

    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: GOOGLE_CLIENT_ID,
    })

    const payload = ticket.getPayload()
    if (!payload?.email) {
      return res.status(400).json({ error: 'Invalid Google token payload' })
    }

    const { email, name } = payload

    let user = await User.findOne({ email })
    if (!user) {
      const userCount = await User.countDocuments()
      const role = userCount === 0 ? 'admin' : 'user'
      user = await User.create({
        name: name ?? email.split('@')[0],
        email,
        googleAuth: true,
        role,
      } as any)
    }

    // 🌟 Pass the tier to your tokens
    const userTier = (user as any).tier || 'free'
    const userRole = (user as any).role || 'user'

    const accessToken  = signAccessToken(user._id.toString(), userTier, userRole)
    const refreshToken = signRefreshToken(user._id.toString(), userTier, userRole)
    await saveRefreshToken(user._id.toString(), refreshToken)

    await writeLog({
      userId: user._id.toString(),
      action: 'GOOGLE_LOGIN',
      status: 'success',
      method: 'POST',
      path: '/api/login/google-login',
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: { email: user.email }
    })

    return res.json({
      accessToken,
      refreshToken,
      user: { 
        id: user._id, 
        name: user.name, 
        email: user.email, 
        role: (user as any).role || 'user',
        tier: userTier
      },
    })
  } catch (err) {
    console.error('Google Login Error:', err)
    await writeLog({
      action: 'GOOGLE_LOGIN',
      status: 'failed',
      method: 'POST',
      path: '/api/login/google-login',
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: { error: err instanceof Error ? err.message : String(err) }
    })
    return res.status(500).json({ error: 'Google login failed' })
  }
})

// ── Send OTP ─────────────────────────────────────────────────────────────────
router.post('/send-otp', async (req: Request, res: Response) => {
  const { email } = req.body

  if (!email) {
    return res.status(400).json({ error: 'Email is required' })
  }

  const ip = req.ip || req.socket.remoteAddress || 'unknown'
  const ipKey = `otp_send_ip:${ip}`

  const ipCount = await redis.incr(ipKey)
  if (ipCount === 1) await redis.expire(ipKey, 10 * 60)
  if (ipCount > 10) {
    await writeLog({
      action: 'SEND_OTP',
      status: 'failed',
      method: 'POST',
      path: '/api/login/send-otp',
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: { email, error: 'Rate limit exceeded (IP-based spam detection)' }
    })
    return res.status(429).json({ error: 'Too many OTP requests. Try again later.' })
  }

  const sendCount = await redis.incr(`otp_send:${email}`)
  if (sendCount === 1) await redis.expire(`otp_send:${email}`, 10 * 60)
  if (sendCount > 3) {
    await writeLog({
      action: 'SEND_OTP',
      status: 'failed',
      method: 'POST',
      path: '/api/login/send-otp',
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: { email, error: 'Rate limit exceeded (email-based spam detection)' }
    })
    return res.status(429).json({ error: 'Too many OTP requests. Try again later.' })
  }

  try {
    const otp = Math.floor(100000 + Math.random() * 900000).toString()
    await redis.set(`otp:${email}`, otp, 'EX', 300)
    await clearAttempts(`otp:${email}`)

    await sendOTP(email, otp)

    await writeLog({
      action: 'SEND_OTP',
      status: 'success',
      method: 'POST',
      path: '/api/login/send-otp',
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: { email }
    })

    return res.json({ message: 'OTP sent successfully to ' + email })
  } catch (err) {
    console.error('OTP Send Error:', err)
    await writeLog({
      action: 'SEND_OTP',
      status: 'failed',
      method: 'POST',
      path: '/api/login/send-otp',
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: { email, error: err instanceof Error ? err.message : String(err) }
    })
    return res.status(500).json({ error: 'Failed to send OTP' })
  }
})

// ── Signup ───────────────────────────────────────────────────────────────────
router.post('/signup', async (req: Request, res: Response) => {
  const { name, email, password, otp } = req.body

  if (!name || !email || !password || !otp) {
    return res.status(400).json({ error: 'name, email, password and otp are required' })
  }

  if (await isBlocked(`otp:${email}`)) {
    return res.status(429).json({ error: 'Too many failed attempts. Request a new OTP.' })
  }

  const cachedOtp = await redis.get(`otp:${email}`)

  if (!cachedOtp || cachedOtp !== otp) {
    const attempts = await recordFailedAttempt(`otp:${email}`, OTP_ATTEMPT_TTL)

    if (attempts >= MAX_OTP_ATTEMPTS) {
      await blockIdentifier(`otp:${email}`, OTP_ATTEMPT_TTL)
      await redis.del(`otp:${email}`)
    }

    await writeLog({
      action: 'SIGNUP',
      status: 'failed',
      method: 'POST',
      path: '/api/login/signup',
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: { email, error: 'Invalid or expired OTP', attemptsLeft: Math.max(0, MAX_OTP_ATTEMPTS - attempts) }
    })

    return res.status(400).json({
      error: 'Invalid or expired OTP',
      attemptsLeft: Math.max(0, MAX_OTP_ATTEMPTS - attempts),
    })
  }

  try {
    const existing = await User.findOne({ email })
    if (existing) {
      await writeLog({
        action: 'SIGNUP',
        status: 'failed',
        method: 'POST',
        path: '/api/login/signup',
        ipAddress: req.ip || req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
        details: { email, error: 'Email already in use' }
      })
      return res.status(409).json({ error: 'Email already in use' })
    }

    const hashed = await bcrypt.hash(password, 10)
    const userCount = await User.countDocuments()
    const role = userCount === 0 ? 'admin' : 'user'
    const user   = await User.create({ name, email, password: hashed, role })

    await redis.del(`otp:${email}`)
    await clearAttempts(`otp:${email}`)

    const userTier = (user as any).tier || 'free'
    const userRole = (user as any).role || 'user'

    const accessToken  = signAccessToken(user._id.toString(), userTier, userRole)
    const refreshToken = signRefreshToken(user._id.toString(), userTier, userRole)
    await saveRefreshToken(user._id.toString(), refreshToken)

    await writeLog({
      userId: user._id.toString(),
      action: 'SIGNUP',
      status: 'success',
      method: 'POST',
      path: '/api/login/signup',
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: { email }
    })

    return res.status(201).json({
      accessToken,
      refreshToken,
      user: { 
        id: user._id, 
        name: user.name, 
        email: user.email, 
        role: (user as any).role || 'user',
        tier: userTier // 🌟 Expose tier here
      },
    })
  } catch (err) {
    console.error('Signup error:', err)
    await writeLog({
      action: 'SIGNUP',
      status: 'failed',
      method: 'POST',
      path: '/api/login/signup',
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: { email, error: err instanceof Error ? err.message : String(err) }
    })
    return res.status(500).json({ error: 'Signup failed' })
  }
})

// ── Login ────────────────────────────────────────────────────────────────────
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' })
  }

  if (await isBlocked(`login:${email}`)) {
    return res.status(429).json({
      error: 'Account temporarily locked. Try again in 15 minutes.',
    })
  }

  try {
    const user = await User.findOne({ email })

    if (!user || (user as any).googleAuth || !user.password) {
      await recordFailedAttempt(`login:${email}`, LOGIN_WINDOW_TTL)
      await writeLog({
        action: 'LOGIN',
        status: 'failed',
        method: 'POST',
        path: '/api/login/login',
        ipAddress: req.ip || req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
        details: { email, error: 'Invalid credentials or googleAuth account' }
      })
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const match = await bcrypt.compare(password, user.password)

    if (!match) {
      const attempts = await recordFailedAttempt(`login:${email}`, LOGIN_WINDOW_TTL)

      await writeLog({
        action: 'LOGIN',
        status: 'failed',
        method: 'POST',
        path: '/api/login/login',
        ipAddress: req.ip || req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
        details: { email, error: 'Invalid credentials', attemptsLeft: Math.max(0, MAX_LOGIN_ATTEMPTS - attempts) }
      })

      if (attempts >= MAX_LOGIN_ATTEMPTS) {
        await blockIdentifier(`login:${email}`, LOGIN_BLOCK_TTL)
        return res.status(429).json({
          error: 'Account temporarily locked. Try again in 15 minutes.',
        })
      }

      return res.status(401).json({
        error: 'Invalid credentials',
        attemptsLeft: Math.max(0, MAX_LOGIN_ATTEMPTS - attempts),
      })
    }

    await clearAttempts(`login:${email}`)

    const userTier = (user as any).tier || 'free'
    const userRole = (user as any).role || 'user'

    const accessToken  = signAccessToken(user._id.toString(), userTier, userRole)
    const refreshToken = signRefreshToken(user._id.toString(), userTier, userRole)
    await saveRefreshToken(user._id.toString(), refreshToken)

    await writeLog({
      userId: user._id.toString(),
      action: 'LOGIN',
      status: 'success',
      method: 'POST',
      path: '/api/login/login',
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: { email }
    })

    return res.json({
      accessToken,
      refreshToken,
      user: { 
        id: user._id, 
        name: user.name, 
        email: user.email, 
        role: (user as any).role || 'user',
        tier: userTier // 🌟 Expose tier here
      },
    })
  } catch (err) {
    console.error('Login error:', err)
    await writeLog({
      action: 'LOGIN',
      status: 'failed',
      method: 'POST',
      path: '/api/login/login',
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: { email, error: err instanceof Error ? err.message : String(err) }
    })
    return res.status(500).json({ error: 'Login failed' })
  }
})

// ── Refresh Token ─────────────────────────────────────────────────────────────
router.post('/refresh', refreshLimiter, async (req: Request, res: Response) => {
  const { refreshToken } = req.body

  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token is required' })
  }

  try {
    // 🌟 Decode the refresh token payload which now includes the 'tier' field
    const payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as { id: string; tier: string, role: string }
    const isValid = await verifyStoredRefreshToken(payload.id, refreshToken)
    
    if (!isValid) {
      await writeLog({
        userId: payload.id,
        action: 'REFRESH_TOKEN',
        status: 'failed',
        method: 'POST',
        path: '/api/login/refresh',
        ipAddress: req.ip || req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
        details: { error: 'Token reuse detected or signature invalid in database context' }
      })
      return res.status(401).json({ error: 'Invalid or expired refresh token. Please log in again.' })
    }

    // 🌟 Maintain and cascade the token tier downward safely during re-issue cycles
    const userTier = payload.tier || 'free'
    const userRole = payload.role || 'user'
    const accessToken     = signAccessToken(payload.id, userTier, userRole)
    const newRefreshToken = signRefreshToken(payload.id, userTier, userRole)

    await saveRefreshToken(payload.id, newRefreshToken)

    await writeLog({
      userId: payload.id,
      action: 'REFRESH_TOKEN',
      status: 'success',
      method: 'POST',
      path: '/api/login/refresh',
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: { summary: 'Token rotated successfully' }
    })

    return res.json({ accessToken, refreshToken: newRefreshToken })
  } catch (err) {
    await writeLog({
      action: 'REFRESH_TOKEN',
      status: 'failed',
      method: 'POST',
      path: '/api/login/refresh',
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: { error: err instanceof Error ? err.message : 'Malformed payload parsing fallback' }
    })
    return res.status(401).json({ error: 'Invalid or expired refresh token. Please log in again.' })
  }
})

// ── Logout ────────────────────────────────────────────────────────────────────
router.post('/logout', async (req: Request, res: Response) => {
  const { refreshToken } = req.body

  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token is required' })
  }

  try {
    const payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as { id: string }
    await redis.del(`refresh:${payload.id}`)

    await writeLog({
      userId: payload.id,
      action: 'LOGOUT',
      status: 'success',
      method: 'POST',
      path: '/api/login/logout',
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent']
    })
  } catch (err) {
    await writeLog({
      action: 'LOGOUT',
      status: 'failed',
      method: 'POST',
      path: '/api/login/logout',
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: { note: 'Logout attempted with malformed or expired token', error: err instanceof Error ? err.message : String(err) }
    })
  }

  return res.json({ message: 'Logged out successfully' })
})

export default router