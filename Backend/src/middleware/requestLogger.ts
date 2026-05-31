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
      '/api/login/login',
      '/api/login/signup',
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
      
      // Let's rewrite action names to be user-friendly in the logs table
      if (req.method === 'POST' && req.originalUrl.startsWith('/api/chats') && req.originalUrl.endsWith('/stop')) {
        action = 'AI_CHAT_STOP'
      } else if (req.method === 'POST' && req.originalUrl.startsWith('/api/chats') && req.originalUrl.split('/').length === 3) {
        action = 'CREATE_CHAT'
      } else if (req.method === 'DELETE' && req.originalUrl.startsWith('/api/chats') && req.originalUrl.split('/').length === 4) {
        action = 'DELETE_CHAT'
      } else if (req.method === 'POST' && req.originalUrl.startsWith('/api/files')) {
        action = 'FILE_UPLOAD'
      }

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
