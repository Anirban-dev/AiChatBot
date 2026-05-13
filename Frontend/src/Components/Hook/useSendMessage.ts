import { useRef, useState } from 'react'
import { sendMsg, stopMsg } from '../../API/Msg'
import { uploadFile, deleteFileFromRAG } from '../../API/File'
import { useChatStore } from '../../Context/ChatContext'
import { usePython } from './usePython'

export const useSendMessage = (
  chatId: string
) => {
  const [input, setInput] = useState('')

  const { appendMessage, appendToken, updateMessage, removeMessage, isLoading, setLoading } = useChatStore()

  const { runCode, isReady: isPythonReady } = usePython();

  // Create a ref to store the controller so we can abort it later
  const abortControllerRef = useRef<AbortController | null>(null)
  const [uploading, setUploading] = useState(false)
  const currentFileName = useRef<string | null>(null)

  const loading = isLoading(chatId)

  const stopGeneration = async () => {
    // 1. Kill the local fetch/upload
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }

    // 2. If it was an upload, also tell backend to clean up vector db
    if (uploading && currentFileName.current) {
      try {
        await deleteFileFromRAG(currentFileName.current)
        console.log(`Cleaned up RAG for ${currentFileName.current}`)
      } catch (err) {
        console.error("Cleanup error:", err)
      } finally {
        setUploading(false)
        currentFileName.current = null
      }
      return // Don't need to call stopMsg if we were just uploading
    }

    // 3. Tell the server to kill the Python task
    try {
      await stopMsg(chatId)
    } catch (err) {
      console.error("Stop error:", err)
    } finally {
      setLoading(chatId, false)
    }
  }

  const handleFileUpload = async (file: File, onUploaded: (data: any) => void) => {
    if (!file || !chatId || uploading || loading) return

    setUploading(true)
    currentFileName.current = file.name
    abortControllerRef.current = new AbortController()

    try {
      const res = await uploadFile(file, chatId, abortControllerRef.current.signal)
      if (res.data) {
        onUploaded(res.data)
      }
      console.log('File uploaded successfully!')
    } catch (err: any) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') {
        console.log('Upload aborted by user')
      } else {
        console.error(err)
        console.log('Failed to upload file')
      }
    } finally {
      setUploading(false)
      currentFileName.current = null
      abortControllerRef.current = null
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
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error(err)
      }
      setLoading(chatId, false)
    }
  }

  return { input, setInput, sendMessage, stopGeneration, handleFileUpload, loading, uploading, runCode, isPythonReady }  // expose input & setInput
}