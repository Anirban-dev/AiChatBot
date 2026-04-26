import { Router } from 'express'
import { Chat } from '../models/chat'

const router = Router()

// TODO: replace with real userId from JWT middleware later
const TEMP_USER_ID = '000000000000000000000001'

// Create chat
router.post('/', async (req, res) => {
  try {
    const count = await Chat.countDocuments({ userId: TEMP_USER_ID })
    const chat = await Chat.create({
      title: `Chat ${count + 1}`,
      userId: TEMP_USER_ID
    })
    res.json({ id: chat._id, title: chat.title })
  } catch (err) {
    res.status(500).json({ error: 'Failed to create chat' })
  }
})

// Get all chats
router.get('/allchats', async (req, res) => {
  try {
    const chats = await Chat.find({ userId: TEMP_USER_ID }).sort({ createdAt: -1 })
    res.json(chats.map(c => ({ id: c._id, title: c.title })))
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch chats' })
  }
})

// Get chat
router.get('/:id', async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.id)
    if (!chat) return res.status(404).json({ error: 'Chat not found' })
    res.json({ id: chat._id, title: chat.title })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch chat' })
  }
})

export default router