// src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export interface AuthRequest<P = {}> extends Request<P> {
  userId?: string
  userTier?: string
  userRole?: string
}

export type AdminRequest<P = {}> = AuthRequest<P>

// ── Regular Protected User Middleware ─────────────────────────────────────────
export const authMiddleware = (req: AuthRequest<any>, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'No token provided' })

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      id: string
      tier: string
      role: string
    }

    req.userId   = decoded.id
    req.userTier = decoded.tier || 'free'
    req.userRole = decoded.role || 'user'

    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}

// ── Role-Based Admin Middleware ───────────────────────────────────────────────
// Same JWT_SECRET as regular auth — no separate admin secret.
// Admin status is determined purely by role: 'admin' in the token payload.
export const adminAuthMiddleware = (req: AuthRequest<any>, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'No token provided' })

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      id: string
      tier: string
      role: string
    }

    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admins only.' })
    }

    req.userId   = decoded.id
    req.userTier = decoded.tier || 'free'
    req.userRole = decoded.role

    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

export default authMiddleware