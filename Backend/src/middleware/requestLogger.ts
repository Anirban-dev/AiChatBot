// src/middleware/requestLogger.ts
import { Response, NextFunction } from 'express'
import { AuthRequest } from './auth'
import { writeLog } from '../utils/logger'

export const requestLogger = (req: AuthRequest, res: Response, next: NextFunction) => {
  const startTime = Date.now()

  res.on('finish', async () => {
    const isMutation = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)
    const isFailure = res.statusCode >= 400

    // Skip high-frequency quiet paths to avoid spamming the logs
    const quietPaths = ['/api/login/refresh', '/api/login/send-otp']
    if (quietPaths.some(path => req.originalUrl.startsWith(path))) {
      return
    }

    // Skip AI_CHAT and LOGIN / SIGNUP / GOOGLE-LOGIN endpoints because they are manually logged with rich payload metadata
    const manualLoggedPaths = [
      '/api/chats/', // We manually log inside msg.ts (the chat stream is under chats/:chatId/msgs)
      '/api/login',
      '/api/signup',
      '/api/login/google-login'
    ]

    const isManual = manualLoggedPaths.some(path => {
      if (path === '/api/chats/') {
        return req.originalUrl.includes('/msgs') && !req.originalUrl.endsWith('/stop')
      }
      return req.originalUrl.startsWith(path)
    })

    if (isManual) {
      return
    }

    if (isMutation || isFailure) {
      const latency = Date.now() - startTime
      const status = isFailure ? 'failed' : 'success'
      
      // Compute clean action name
      let action = `${req.method} ${req.baseUrl || ''}${req.path}`

      await writeLog({
        userId: req.userId,
        action,
        status,
        method: req.method,
        path: req.originalUrl,
        ipAddress: req.ip || req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
        latency,
        details: isFailure ? { statusCode: res.statusCode, error: res.statusMessage } : undefined
      })
    }
  })

  next()
}
