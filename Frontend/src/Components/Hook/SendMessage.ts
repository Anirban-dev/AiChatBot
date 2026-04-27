import { useState } from 'react'
import { sendMsg } from '../../API/Msg'
import { useChatStore } from '../../Context/ChatContext'

export const useSendMessage = (
  chatId: string
) => {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  const { appendMessage, appendToken, updateMessage, removeMessage } = useChatStore()

  const sendMessage = async () => {
    if (!input.trim() || loading) return

    const content = input.trim()
    setInput('')
    setLoading(true)

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
            if (targetChatId === chatId) setLoading(false)
        },

        // onError
        () => {
            removeMessage(targetChatId, streamingId)
            if (targetChatId === chatId) setLoading(false)
        }
      )
    } catch (err) {
        console.error(err)
        setLoading(false)
    }
  }

  return { input, setInput, sendMessage, loading }  // expose input & setInput
}