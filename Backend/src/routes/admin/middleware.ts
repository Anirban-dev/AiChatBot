import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export interface AdminRequest extends Request {
  isAdmin?: boolean
}

export const adminAuthMiddleware = (req: AdminRequest, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1] // Bearer <token>

  if (!token) {
    return res.status(401).json({ error: 'Access denied: No admin token provided' })
  }

  try {
    const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || (process.env.JWT_SECRET ? process.env.JWT_SECRET + '_admin' : 'admin-secret-key')
    const decoded = jwt.verify(token, ADMIN_JWT_SECRET) as { isAdmin: boolean }
    
    if (!decoded.isAdmin) {
      return res.status(403).json({ error: 'Access denied: Invalid privileges' })
    }

    req.isAdmin = true
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Admin session expired or invalid' })
  }
}
