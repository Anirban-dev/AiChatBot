import { Router, Request, Response } from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { User } from '../models/user'
import { OAuth2Client } from 'google-auth-library'
import { redis } from '../utils/redis'
import { sendOTP } from '../utils/email'
import { googleLoginLimiter, refreshLimiter } from '../utils/ratelimitHelper'

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

// ── Token Helpers ────────────────────────────────────────────────────────────

// Access token: short-lived, used for every API call
const signAccessToken = (userId: string) =>
  jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '15m' })

// Refresh token: long-lived, stored in Redis so we can invalidate it on logout
const signRefreshToken = (userId: string) =>
  jwt.sign({ id: userId }, JWT_REFRESH_SECRET, { expiresIn: '7d' })

// Store a hashed version of the refresh token — never store raw tokens
// Key: refresh:<userId> — one active session per user
// Swap redis.set → redis.sadd if you want multi-device support
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
const LOGIN_BLOCK_TTL    = 15 * 60  // block for 15 min
const LOGIN_WINDOW_TTL   = 10 * 60  // reset attempt counter after 10 min of no failures

const MAX_OTP_ATTEMPTS   = 5
const OTP_ATTEMPT_TTL    = 5 * 60   // tied to OTP lifetime (5 min)

const isBlocked = async (key: string): Promise<boolean> => {
  return !!(await redis.get(`blocked:${key}`))
}

// Increment attempt counter. Returns the new count.
const recordFailedAttempt = async (key: string, windowTTL: number): Promise<number> => {
  const attempts = await redis.incr(`attempts:${key}`)
  if (attempts === 1) await redis.expire(`attempts:${key}`, windowTTL) // start window on first failure
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
      user = await User.create({
        name: name ?? email.split('@')[0],
        email,
        googleAuth: true,
      } as any)
    }

    const accessToken  = signAccessToken(user._id.toString())
    const refreshToken = signRefreshToken(user._id.toString())
    await saveRefreshToken(user._id.toString(), refreshToken)

    return res.json({
      accessToken,
      refreshToken,
      user: { id: user._id, name: user.name, email: user.email },
    })
  } catch (err) {
    console.error('Google Login Error:', err)
    return res.status(500).json({ error: 'Google login failed' })
  }
})

// ── Send OTP ─────────────────────────────────────────────────────────────────
router.post('/send-otp', async (req: Request, res: Response) => {
  const { email } = req.body

  if (!email) {
    return res.status(400).json({ error: 'Email is required' })
  }

  // ✅ Rate limit OTP sends — max 3 per 10 min to prevent email spam
  const sendCount = await redis.incr(`otp_send:${email}`)
  if (sendCount === 1) await redis.expire(`otp_send:${email}`, 10 * 60)
  if (sendCount > 3) {
    return res.status(429).json({ error: 'Too many OTP requests. Try again later.' })
  }

  try {
    const otp = Math.floor(100000 + Math.random() * 900000).toString()

    await redis.set(`otp:${email}`, otp, 'EX', 300)

    // ✅ Reset attempt counter so a fresh OTP gives a clean slate
    await clearAttempts(`otp:${email}`)

    await sendOTP(email, otp)

    return res.json({ message: 'OTP sent successfully to ' + email })
  } catch (err) {
    console.error('OTP Send Error:', err)
    return res.status(500).json({ error: 'Failed to send OTP' })
  }
})

// ── Signup ───────────────────────────────────────────────────────────────────
router.post('/signup', async (req: Request, res: Response) => {
  const { name, email, password, otp } = req.body

  if (!name || !email || !password || !otp) {
    return res.status(400).json({ error: 'name, email, password and otp are required' })
  }

  // ✅ Block if too many wrong OTP attempts
  if (await isBlocked(`otp:${email}`)) {
    return res.status(429).json({ error: 'Too many failed attempts. Request a new OTP.' })
  }

  const cachedOtp = await redis.get(`otp:${email}`)

  if (!cachedOtp || cachedOtp !== otp) {
    const attempts = await recordFailedAttempt(`otp:${email}`, OTP_ATTEMPT_TTL)

    if (attempts >= MAX_OTP_ATTEMPTS) {
      await blockIdentifier(`otp:${email}`, OTP_ATTEMPT_TTL)
      await redis.del(`otp:${email}`) // force them to request a fresh OTP
      return res.status(429).json({ error: 'Too many failed attempts. Request a new OTP.' })
    }

    return res.status(400).json({
      error: 'Invalid or expired OTP',
      attemptsLeft: MAX_OTP_ATTEMPTS - attempts,
    })
  }

  try {
    const existing = await User.findOne({ email })
    if (existing) return res.status(409).json({ error: 'Email already in use' })

    const hashed = await bcrypt.hash(password, 10)
    const user   = await User.create({ name, email, password: hashed })

    await redis.del(`otp:${email}`)
    await clearAttempts(`otp:${email}`)

    const accessToken  = signAccessToken(user._id.toString())
    const refreshToken = signRefreshToken(user._id.toString())
    await saveRefreshToken(user._id.toString(), refreshToken)

    return res.status(201).json({
      accessToken,
      refreshToken,
      user: { id: user._id, name: user.name, email: user.email },
    })
  } catch (err) {
    console.error('Signup error:', err)
    return res.status(500).json({ error: 'Signup failed' })
  }
})

// ── Login ────────────────────────────────────────────────────────────────────
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' })
  }

  // ✅ Brute force: block after 5 failures for 15 min
  if (await isBlocked(`login:${email}`)) {
    return res.status(429).json({
      error: 'Account temporarily locked. Try again in 15 minutes.',
    })
  }

  try {
    const user = await User.findOne({ email })

    // ✅ Always record a failed attempt even for non-existent users
    // This prevents user enumeration via timing differences
    if (!user || (user as any).googleAuth || !user.password) {
      await recordFailedAttempt(`login:${email}`, LOGIN_WINDOW_TTL)
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const match = await bcrypt.compare(password, user.password)

    if (!match) {
      const attempts = await recordFailedAttempt(`login:${email}`, LOGIN_WINDOW_TTL)

      if (attempts >= MAX_LOGIN_ATTEMPTS) {
        await blockIdentifier(`login:${email}`, LOGIN_BLOCK_TTL)
        return res.status(429).json({
          error: 'Account temporarily locked. Try again in 15 minutes.',
        })
      }

      return res.status(401).json({
        error: 'Invalid credentials',
        attemptsLeft: MAX_LOGIN_ATTEMPTS - attempts,
      })
    }

    // ✅ Successful login — clear brute force state
    await clearAttempts(`login:${email}`)

    const accessToken  = signAccessToken(user._id.toString())
    const refreshToken = signRefreshToken(user._id.toString())
    await saveRefreshToken(user._id.toString(), refreshToken)

    return res.json({
      accessToken,
      refreshToken,
      user: { id: user._id, name: user.name, email: user.email },
    })
  } catch (err) {
    console.error('Login error:', err)
    return res.status(500).json({ error: 'Login failed' })
  }
})

// ── Refresh Token ─────────────────────────────────────────────────────────────
// Call this when the access token expires (you get a 401).
// Returns a fresh access token + a new refresh token (rotation).
router.post('/refresh', refreshLimiter, async (req: Request, res: Response) => {
  const { refreshToken } = req.body

  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token is required' })
  }

  try {
    const payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as { id: string }

    // ✅ Verify it matches what's stored — detects reuse of stolen tokens
    const isValid = await verifyStoredRefreshToken(payload.id, refreshToken)
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid or expired refresh token. Please log in again.' })
    }

    const accessToken     = signAccessToken(payload.id)
    const newRefreshToken = signRefreshToken(payload.id)

    // ✅ Refresh token rotation: old token is replaced, so a stolen token can only be used once
    await saveRefreshToken(payload.id, newRefreshToken)

    return res.json({ accessToken, refreshToken: newRefreshToken })
  } catch {
    return res.status(401).json({ error: 'Invalid or expired refresh token. Please log in again.' })
  }
})

// ── Logout ────────────────────────────────────────────────────────────────────
// Deletes the refresh token from Redis — access token expires naturally in 15m
router.post('/logout', async (req: Request, res: Response) => {
  const { refreshToken } = req.body

  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token is required' })
  }

  try {
    const payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as { id: string }
    await redis.del(`refresh:${payload.id}`)
  } catch {
    // Treat logout as success even if the token is already expired
  }

  return res.json({ message: 'Logged out successfully' })
})

export default router