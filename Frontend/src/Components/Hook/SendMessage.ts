import { useState } from 'react'
import { sendMsg } from '../../API/Msg'
import { useChatStore } from '../../Context/ChatContext'

export const useSendMessage = (
  chatId: string
) => {
  const [input, setInput] = useState('')

  const { appendMessage, appendToken, updateMessage, removeMessage, isLoading, setLoading } = useChatStore()

  const loading = isLoading(chatId)

  const sendMessage = async () => {
    if (!input.trim() || loading) return

    const content = input.trim()
    setInput('')
    setLoading(chatId, true)

    const streamingId = crypto.randomUUID()
    const targetChatId = chatId // capture at send time

    try {
      await sendMsg(
        targetChatId,
        content,

        // onToken
        (token) => appendToken(targetChatId, streamingId, token),

        // onUserMessage
        (userMsg) => appendMessage(targetChatId, userMsg),

        // onDone
        (assistantMsg) => {
            updateMessage(targetChatId, streamingId, assistantMsg)
            if (targetChatId === chatId) setLoading(chatId, false)
        },

        // onError
        () => {
            removeMessage(targetChatId, streamingId)
            if (targetChatId === chatId) setLoading(chatId, false)
        }
      )
    } catch (err) {
        console.error(err)
        setLoading(chatId, false)
    }
  }

  return { input, setInput, sendMessage, loading }  // expose input & setInput
}