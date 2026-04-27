import { useState } from 'react'
import { sendMsg } from '../../API/Msg'

interface Message {
  _id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export const useSendMessage = (
  chatId: string,
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
) => {
  const [loading, setLoading] = useState(false)

  const sendMessage = async (input: string, clearInput: () => void) => {
    if (!input.trim() || loading) return

    const content = input.trim()
    clearInput()
    setLoading(true)

    const optimisticMsg: Message = {
      _id: crypto.randomUUID(),
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, optimisticMsg])

    try {
      const { userMessage, assistantMessage } = await sendMsg(chatId, content)
      setMessages((prev) => [
        ...prev.filter((m) => m._id !== optimisticMsg._id),
        userMessage,
        assistantMessage,
      ])
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m._id !== optimisticMsg._id))
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return { sendMessage, loading }
}