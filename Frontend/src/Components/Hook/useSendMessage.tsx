import { useRef, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, FileSpreadsheet, Image as ImageIcon, File as FileIcon } from 'lucide-react'
import { sendMsg, stopMsg } from '../../API/Msg'
import { uploadFile, deleteFileFromRAG } from '../../API/File'
import { createChat } from '../../API/Chat'
import { useChatStore } from '../../Context/ChatContext'
import { usePython } from './usePython'

export const useSendMessage = (chatId: string) => {
  const navigate = useNavigate()
  const [input, setInput] = useState('')
  const {
    appendMessage,
    appendToken,
    updateMessage,
    removeMessage,
    updateToolCall,
    isLoading,
    setLoading
  } = useChatStore()
  const { runCode, isReady: isPythonReady } = usePython()

  const messageAbortControllerRef = useRef<AbortController | null>(null)
  const uploadAbortControllerRef = useRef<AbortController | null>(null)

  // FIX #1 & #3: Track uploading in a ref AS WELL as state so stopGeneration
  // never reads a stale closure value. State drives UI; ref drives logic.
  const [uploading, setUploading] = useState(false)
  const uploadingRef = useRef(false)

  const setUploadingSync = (val: boolean) => {
    uploadingRef.current = val
    setUploading(val)
  }

  const currentFileName = useRef<string | null>(null)
  const [pendingCode, setPendingCode] = useState<{ name: string; content: string } | null>(null)
  const loading = isLoading(chatId)

  const [selectedModel, setSelectedModel] = useState<'small' | 'large' | 'thinking' | 'critiq'>('small')
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const clearError = () => setErrorMessage(null)

  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  // FIX #4: Keep a ref copy of previewUrl so the upload callback closure
  // always has the live value even after clearStaging() has run.
  const previewUrlRef = useRef<string | null>(null)

  const setPreviewUrlSync = (url: string | null) => {
    previewUrlRef.current = url
    setPreviewUrl(url)
  }

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    }
  }, [])

  const clearStaging = () => {
    setPendingFile(null)
    setPendingCode(null)
    // FIX #4: Do NOT revoke the object URL here — the upload callback still
    // needs it to pass into appendMessage. Revocation is handled either in
    // the cleanup effect above or explicitly after appendMessage fires.
    setPreviewUrl(null)
    // Note: previewUrlRef.current intentionally NOT cleared here
  }

  const setCodeContext = (name: string, content: string) => {
    setPendingCode({ name, content })
  }

  // FIX #3: stopGeneration now reads uploadingRef (always current) instead
  // of the stale `uploading` state captured in closure.
  const stopGeneration = async () => {
    if (uploadAbortControllerRef.current) {
      uploadAbortControllerRef.current.abort()
      uploadAbortControllerRef.current = null
    }
    if (messageAbortControllerRef.current) {
      messageAbortControllerRef.current.abort()
      messageAbortControllerRef.current = null
    }

    if (uploadingRef.current && currentFileName.current) {
      try {
        await deleteFileFromRAG(currentFileName.current, chatId)
      } catch (err) {
        console.error('Cleanup error:', err)
      } finally {
        setUploadingSync(false)
        currentFileName.current = null
      }
      setLoading(chatId, false)
      setActiveTool(null)
      return
    }

    try {
      await stopMsg(chatId)
    } catch (err) {
      console.error('Stop error:', err)
    } finally {
      setLoading(chatId, false)
      setActiveTool(null)
    }
  }

  const handleFileUpload = async (
    file: File,
    targetChatId: string,
    onUploaded: (data: any) => void
  ) => {
    if (!file || !targetChatId || uploadingRef.current) return
    setUploadingSync(true)
    currentFileName.current = file.name
    uploadAbortControllerRef.current = new AbortController()

    try {
      const res = await uploadFile(file, targetChatId, uploadAbortControllerRef.current.signal)
      if (res.data) {
        onUploaded(res.data)
      }
    } catch (err: any) {
      if (err.name !== 'AbortError' && err.name !== 'CanceledError') {
        console.error(err)
        setErrorMessage(err.message || 'File upload encountered an error.')
      }
    } finally {
      setUploadingSync(false)
      currentFileName.current = null
      uploadAbortControllerRef.current = null
    }
  }

  const sendMessage = async (forcedContent?: string, passedChatId?: string) => {
    const content = forcedContent ?? input.trim()
    if (!content) return

    if (!forcedContent) setInput('')
    const targetChatId = passedChatId || chatId
    setLoading(targetChatId, true)
    setErrorMessage(null)
    setActiveTool(null)

    messageAbortControllerRef.current = new AbortController()
    const streamingId = crypto.randomUUID()

    try {
      await sendMsg(
        targetChatId,
        content,
        selectedModel,

        (token: string) => {
          setActiveTool(null)
          appendToken(targetChatId, streamingId, token)
        },

        (userMsg: any) => {
          appendMessage(targetChatId, {
            _id: userMsg._id || crypto.randomUUID(),
            role: 'user',
            content: userMsg.content || content,
            createdAt: userMsg.createdAt || new Date().toISOString()
          })
        },

        (toolPayload: any) => {
          const tool = toolPayload?.tool_call ?? toolPayload
          const toolName = tool?.name ?? tool?.tool ?? 'unknown'
          const toolId = tool?.id ?? toolName
          const status = toolPayload?.status ?? 'running'

          if (status === 'running') {
            setActiveTool(toolName)
          } else {
            setActiveTool(null)
          }

          updateToolCall(targetChatId, streamingId, {
            id: toolId,
            name: toolName,
            status: status as 'running' | 'completed' | 'failed',
            result: toolPayload?.result,
            error: toolPayload?.error,
          })
        },

        async (assistantMsg) => {
          setActiveTool(null)
          updateMessage(targetChatId, streamingId, assistantMsg)
          setLoading(targetChatId, false)
          setLoading(chatId, false)
        },

        (errData: { type?: string; message: string }) => {
          setActiveTool(null)
          removeMessage(targetChatId, streamingId)
          setErrorMessage(errData.message || 'A streaming worker pipeline exception occurred.')
          setLoading(targetChatId, false)
          setLoading(chatId, false)
        },

        messageAbortControllerRef.current.signal
      )
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error(err)
        setErrorMessage(err.message || 'An unexpected engine execution fault occurred.')
      }
      setActiveTool(null)
      setLoading(targetChatId, false)
      setLoading(chatId, false)
    }
  }

  // FIX #2, #4, #5, #6: Rewritten pipeline manager
  const handleSendAction = async () => {
    const cachedInput = input.trim()
    const fileToUpload = pendingFile

    // FIX #5: Guard — if already loading or uploading, do nothing (same
    // condition the send button uses, so Enter and button are now in sync).
    if (loading || uploadingRef.current) return

    if (!fileToUpload && !cachedInput) return

    let targetChatId = chatId
    if (!targetChatId || targetChatId === 'new') {
      const nameSource = cachedInput || (fileToUpload ? fileToUpload.name : 'New Chat')
      const firstLine = nameSource.split('\n')[0].trim()
      const title = firstLine.length > 28 ? firstLine.slice(0, 25) + '...' : firstLine
      try {
        const newChat = await createChat(title)
        targetChatId = newChat.id
        // Navigate to the new chat page
        navigate(`/${targetChatId}`, { replace: true })
      } catch (err) {
        console.error('Failed to create new chat:', err)
        setErrorMessage('Failed to create new chat.')
        return
      }
    }

    if (fileToUpload) {
      // Snapshot the object URL BEFORE clearStaging() so the upload callback
      // can still reference it. FIX #4.
      const snapshotPreviewUrl = previewUrlRef.current

      // Clear UI staging immediately for snappy feedback
      clearStaging()
      setInput('')

      // FIX #2: Set a single loading gate so the whole sequence is treated
      // as one atomic operation from the UI's perspective.
      setLoading(targetChatId, true)

      await handleFileUpload(fileToUpload, targetChatId, (data) => {
        const structuredFileMsg = {
          _id: data._id || data.id || crypto.randomUUID(),
          role: 'user' as const,
          content: data.content || `[Uploaded File] ${fileToUpload.name}`,
          createdAt: data.createdAt || new Date().toISOString(),
          fileInfo: data.fileInfo || {
            name: fileToUpload.name,
            size: fileToUpload.size,
            type: fileToUpload.type,
            // FIX #4: Use the snapshot — not the state var — so the URL is
            // still valid even though clearStaging() already ran.
            url: data.url || snapshotPreviewUrl || null
          }
        }
        appendMessage(targetChatId, structuredFileMsg)

        // Safe to revoke now that appendMessage has consumed the URL
        if (snapshotPreviewUrl) URL.revokeObjectURL(snapshotPreviewUrl)
        previewUrlRef.current = null
      })

      // FIX #2: Only release the loading gate here if there's no follow-up
      // text message. If there IS text, sendMessage manages loading itself.
      if (cachedInput) {
        await sendMessage(cachedInput, targetChatId)
      } else {
        setLoading(targetChatId, false)
      }
    } else {
      // Text-only path
      await sendMessage(undefined, targetChatId)
    }
  }

  // FIX #5 & #6: handleKeyDown now mirrors the exact same guard as the
  // send button (loading || uploading), and file-only Enter now works
  // because handleSendAction handles the file-only case correctly.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      // Block Enter under the same conditions the send button is disabled
      if (loading || uploading || errorMessage) return
      // FIX #6: Allow Enter to send even if only a file is staged (no text)
      if (!input.trim() && !pendingFile) return
      handleSendAction()
    }
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData.items
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile()
        if (file) {
          e.preventDefault()
          setPendingFile(file)
          const url = URL.createObjectURL(file)
          setPreviewUrlSync(url)
          break
        }
      }
    }
  }

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPendingFile(file)
    const url = URL.createObjectURL(file)
    setPreviewUrlSync(url)
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  const getFileIcon = (ext: string) => {
    const e = ext.toLowerCase()
    if (['.pdf', '.doc', '.docx', '.txt', '.md'].includes(e))
      return <FileText size={18} className="text-blue-500" />
    if (['.csv', '.xlsx', '.xls'].includes(e))
      return <FileSpreadsheet size={18} className="text-green-500" />
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(e))
      return <ImageIcon size={18} className="text-purple-500" />
    return <FileIcon size={18} className="text-gray-400" />
  }

  const getFileColor = (ext: string) => {
    const e = ext.toLowerCase()
    if (['.pdf'].includes(e))
      return 'border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/5'
    if (['.doc', '.docx', '.txt', '.md'].includes(e))
      return 'border-blue-200 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/5'
    if (['.csv', '.xlsx', '.xls'].includes(e))
      return 'border-green-200 dark:border-green-500/20 bg-green-50 dark:bg-green-500/5'
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(e))
      return 'border-purple-200 dark:border-purple-500/20 bg-purple-50 dark:bg-purple-500/5'
    return 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800'
  }

  const formatTime = (date: string) =>
    new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  useEffect(() => {
    if (input.trim() && errorMessage) {
      setErrorMessage(null)
    }
  }, [input])

  return {
    input, setInput, sendMessage, stopGeneration, handleFileUpload, loading, uploading, runCode, isPythonReady,
    pendingFile, previewUrl, clearStaging, handleSendAction, handleKeyDown, pendingCode, setCodeContext,
    handlePaste, onFileSelect, formatFileSize, getFileIcon, getFileColor, formatTime,
    activeTool, setActiveTool, errorMessage, setErrorMessage, selectedModel, setSelectedModel, clearError
  }
}