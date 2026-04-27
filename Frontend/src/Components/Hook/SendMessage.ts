import { useState } from 'react'
import { sendMsg } from '../../API/Msg'
import type { Message } from './Types/Message'

export const useSendMessage = (
  chatId: string,
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
) => {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  const sendMessage = async () => {
    if (!input.trim() || loading) return

    const content = input.trim()
    setInput('')
    setLoading(true)

    // Placeholder for streaming assistant message
    const streamingId = crypto.randomUUID()

    try {
        await sendMsg(
        chatId,
        content,

        // onToken — append each word to the streaming bubble
        (token) => {
            setMessages((prev) => {
            const existing = prev.find(m => m._id === streamingId)
            if (existing) {
                // append token to existing bubble
                return prev.map(m =>
                m._id === streamingId
                    ? { ...m, content: m.content + token }
                    : m
                )
            } else {
                // create the bubble on first token
                return [...prev, {
                _id: streamingId,
                role: 'assistant',
                content: token,
                createdAt: new Date().toISOString(),
                }]
            }
            })
        },

        // onUserMessage — add real user message
        (userMsg) => {
            setMessages(prev => [...prev, userMsg])
        },

        // onDone — replace streaming bubble with real DB message
        (assistantMsg) => {
            setMessages(prev =>
            prev.map(m => m._id === streamingId ? assistantMsg : m)
            )
            setLoading(false)
        },

        // onError
        () => {
            setMessages(prev => prev.filter(m => m._id !== streamingId))
            setLoading(false)
        }
        )
    } catch (err) {
        console.error(err)
        setLoading(false)
    }
}

  return { input, setInput, sendMessage, loading }  // expose input & setInput
}