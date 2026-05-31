import { Router, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { writeLog } from '../../utils/logger'
import { strictLimiter } from '../../utils/ratelimitHelper'

const router = Router()

router.post('/login', strictLimiter, async (req: Request, res: Response) => {
  const { password } = req.body

  if (!password) {
    return res.status(400).json({ error: 'Password is required' })
  }

  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD

  if (password !== ADMIN_PASSWORD) {
    await writeLog({
      action: 'ADMIN_LOGIN',
      status: 'failed',
      method: 'POST',
      path: '/api/admin/login',
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: { error: 'Incorrect admin password' }
    })
    return res.status(401).json({ error: 'Incorrect password' })
  }

  const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || (process.env.JWT_SECRET ? process.env.JWT_SECRET + '_admin' : 'admin-secret-key')
  
  // Sign stateless access token, expires in 1 hour, no refresh token
  const token = jwt.sign({ isAdmin: true }, ADMIN_JWT_SECRET, { expiresIn: '1h' })

  await writeLog({
    action: 'ADMIN_LOGIN',
    status: 'success',
    method: 'POST',
    path: '/api/admin/login',
    ipAddress: req.ip || req.socket.remoteAddress,
    userAgent: req.headers['user-agent']
  })

  return res.json({ accessToken: token })
})

export default router
