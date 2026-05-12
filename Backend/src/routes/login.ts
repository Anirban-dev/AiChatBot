import { Router, Request, Response } from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { User } from '../models/user'
import { OAuth2Client } from 'google-auth-library'
import NodeCache from 'node-cache'
import { sendOTP } from '../utils/email'

const otpCache = new NodeCache({ stdTTL: 300 }) // 5 minutes expiration

const router = Router()
const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'postmessage' // 'postmessage' is the reserved redirect URI for the useGoogleLogin hook
)

// ✅ Fail fast if secrets are missing — don't let the app start broken
const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) throw new Error('JWT_SECRET env var is required')

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
if (!GOOGLE_CLIENT_ID) throw new Error('GOOGLE_CLIENT_ID env var is required')

// ── Google Login (Authorization Code flow) ──────────────────────────────────
// The frontend sends an authorization `code`, NOT a credential/id_token.
// The backend exchanges the code for tokens using the client secret.
// This means:
//   - The client secret never leaves the server
//   - Tokens are issued directly to the backend, not the browser
//   - You can optionally store refresh tokens for long-lived sessions
router.post('/google-login', async (req: Request, res: Response) => {
  const { code } = req.body

  if (!code) {
    return res.status(400).json({ error: 'Authorization code is required' })
  }

  try {
    // Exchange the authorization code for tokens using client secret
    const { tokens } = await client.getToken(code)

    if (!tokens.id_token) {
      return res.status(400).json({ error: 'No ID token returned from Google' })
    }

    // Verify the ID token Google returned (checks signature, expiry, audience)
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

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' })

    return res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email },
    })
  } catch (err) {
    console.error('Google Login Error:', err)
    const message = err instanceof Error ? err.message : 'Google login failed'
    return res.status(500).json({ error: message })
  }
})

// ── OTP Management ──────────────────────────────────────────────────────────
router.post('/send-otp', async (req: Request, res: Response) => {
  const { email } = req.body

  if (!email) {
    return res.status(400).json({ error: 'Email is required' })
  }

  try {
    const otp = Math.floor(100000 + Math.random() * 900000).toString()
    otpCache.set(email, otp)

    await sendOTP(email, otp)

    return res.json({ message: 'OTP sent successfully to ' + email })
  } catch (err) {
    console.error('OTP Send Error:', err)
    return res.status(500).json({ error: 'Failed to send OTP' })
  }
})

// ── Signup ──────────────────────────────────────────────────────────────────
router.post('/signup', async (req: Request, res: Response) => {
  const { name, email, password, otp } = req.body

  if (!name || !email || !password || !otp) {
    return res.status(400).json({ error: 'name, email, password and otp are required' })
  }

  const cachedOtp = otpCache.get(email)
  if (!cachedOtp || cachedOtp !== otp) {
    return res.status(400).json({ error: 'Invalid or expired OTP' })
  }

  try {
    const existing = await User.findOne({ email })
    if (existing) return res.status(409).json({ error: 'Email already in use' }) // ✅ 409 Conflict

    const hashed = await bcrypt.hash(password, 10)
    const user = await User.create({ name, email, password: hashed })

    // ✅ Clear OTP after successful signup
    otpCache.del(email)

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' })

    return res.status(201).json({ // ✅ 201 Created for new resources
      token,
      user: { id: user._id, name: user.name, email: user.email },
    })
  } catch (err) {
    console.error('Signup error:', err)
    // ✅ Never leak raw error details (err.message) to the client
    return res.status(500).json({ error: 'Signup failed' })
  }
})

// ── Login ───────────────────────────────────────────────────────────────────
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' })
  }

  try {
    const user = await User.findOne({ email })

    // ✅ Prevent login with a Google-only account
    if (!user || (user as any).googleAuth) {
      return res.status(401).json({ error: 'Invalid credentials' }) // don't reveal "user not found"
    }

    // ✅ null-guard since googleAuth users have no password
    if (!user.password) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const match = await bcrypt.compare(password, user.password)
    if (!match) return res.status(401).json({ error: 'Invalid credentials' }) // ✅ same message, no oracle

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' })

    return res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email },
    })
  } catch (err) {
    console.error('Login error:', err)
    return res.status(500).json({ error: 'Login failed' })
  }
})

export default router