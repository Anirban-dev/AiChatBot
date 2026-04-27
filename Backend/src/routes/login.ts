// src/routes/auth.ts
import { Router, Request, Response } from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { User } from '../models/user'

const router = Router()

// Signup
router.post('/signup', async (req: Request, res: Response) => {
  const { name, email, password } = req.body

  if (!name || !email || !password)
    return res.status(400).json({ error: 'name, email and password are required' })

  try {
    const existing = await User.findOne({ email })
    if (existing) return res.status(400).json({ error: 'Email already in use' })

    const hashed = await bcrypt.hash(password, 10)
    const user = await User.create({ name, email, password: hashed })

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || '', { expiresIn: '7d' })

    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email }
    })
  } catch (err) {
    res.status(500).json({ error: `Signup failed ${err}` })
  }
})
// Login
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body

  if (!email || !password)
    return res.status(400).json({ error: 'email and password are required' })

  try {
    const user = await User.findOne({ email })
    if (!user) return res.status(404).json({ error: 'User not found' })

    const match = await bcrypt.compare(password, user.password)
    if (!match) return res.status(401).json({ error: 'Invalid password' })

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || '', { expiresIn: '7d' })

    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email }
    })
  } catch (err) {
    res.status(500).json({ error: 'Login failed' })
  }
})

export default router