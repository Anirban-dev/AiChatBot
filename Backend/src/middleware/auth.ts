// src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export interface AuthRequest<P = {}> extends Request<P> {
  userId?: string
}

const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1] // Bearer <token>

  if (!token) return res.status(401).json({ error: 'No token provided' })

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: string }
    req.userId = decoded.id
    next()
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' })
  }
}

export default authMiddleware