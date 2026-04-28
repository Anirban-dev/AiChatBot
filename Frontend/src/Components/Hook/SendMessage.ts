import { useRef, useState } from 'react'
import { sendMsg, stopMsg } from '../../API/Msg'
import { useChatStore } from '../../Context/ChatContext'

export const useSendMessage = (
  chatId: string
) => {
  const [input, setInput] = useState('')

  const { appendMessage, appendToken, updateMessage, removeMessage, isLoading, setLoading } = useChatStore()

  // Create a ref to store the controller so we can abort it later
  const abortControllerRef = useRef<AbortController | null>(null)

  const loading = isLoading(chatId)

  const stopGeneration = async () => {
    // 1. Kill the local fetch
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }

    // 2. Tell the server to kill the Python task
    try {
      await stopMsg(chatId)
    } catch (err) {
      console.error("Stop error:", err)
    } finally {
      setLoading(chatId, false)
    }
  }

  const sendMessage = async () => {
    if (!input.trim() || loading) return

    const content = input.trim()
    setInput('')
    setLoading(chatId, true)

    // Create new controller for this request
    abortControllerRef.current = new AbortController()

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
        },
        abortControllerRef.current.signal // Pass the signal to your API call
      )
    } catch (err) {
        console.error(err)
        setLoading(chatId, false)
    }
  }

  return { input, setInput, sendMessage, stopGeneration, loading }  // expose input & setInput
}