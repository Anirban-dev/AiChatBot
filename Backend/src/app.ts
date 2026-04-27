import express from "express";
import cors from "cors";
import loginRoutes from './routes/login'
import chatRoutes from './routes/chat'
import msgRoutes from './routes/msg'

const app = express()

app.use(cors())
app.use(express.json())
app.use('/api/login', loginRoutes)
app.use('/api/chats', chatRoutes)
app.use('/api/chats/:chatId/msgs', msgRoutes)

export default app