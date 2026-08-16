import express from "express";
import cors from "cors";
import loginRoutes from './routes/login'
import chatRoutes from './routes/chat'
import msgRoutes from './routes/messages/index'
import fileRoutes from './routes/file'
import adminRoutes from './routes/admin/index'
import userRoutes from './routes/user'
import configStatusRoutes from './routes/config'
import { requestLogger } from './middleware/requestLogger'
import { globalIpLimiter } from './utils/ratelimitHelper'

const app = express()

// Behind nginx: honor X-Forwarded-For so req.ip / rate-limit keys see the
// real client IP instead of the proxy. '1' trusts only the immediate hop.
app.set('trust proxy', 1)
app.use(cors())
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));
app.use(requestLogger) // Global request logger middleware
app.use(globalIpLimiter) // Global per-IP flood gate — rate limits every request

app.use('/api/login', loginRoutes)
app.use('/api/chats', chatRoutes)
app.use('/api/chats/:chatId/msgs', msgRoutes)
app.use('/api/files', fileRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/user', userRoutes)
app.use('/api/config-status', configStatusRoutes)

export default app