import express from "express";
import cors from "cors";
import authRoutes from './routes/login'
import chatRoutes from './routes/chat'

const app = express()

app.use(cors())
app.use(express.json())
app.use('/api/auth', authRoutes)
app.use('/api/chats', chatRoutes)

export default app