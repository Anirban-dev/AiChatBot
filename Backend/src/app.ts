import express from "express";
import cors from "cors";
import loginRoutes from './routes/login'
import chatRoutes from './routes/chat'
import msgRoutes from './routes/messages/index'
import fileRoutes from './routes/file'
import adminRoutes from './routes/admin/index'
import { requestLogger } from './middleware/requestLogger'

const app = express()

app.use(cors())
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));
app.use(requestLogger) // Global request logger middleware

app.use('/api/login', loginRoutes)
app.use('/api/chats', chatRoutes)
app.use('/api/chats/:chatId/msgs', msgRoutes)
app.use('/api/files', fileRoutes)
app.use('/api/admin', adminRoutes)

export default app