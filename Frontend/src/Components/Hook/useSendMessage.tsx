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
    appendReasoningToken,
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
      // uploadFile returns response.data directly, so res IS the data object
      if (res) {
        onUploaded(res)
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

  const sendMessage = async (
    forcedContent?: string,
    passedChatId?: string,
    uploadedFileInfo?: any,
    uploadedFileContent?: string,
    optimisticMsgId?: string
  ) => {
    const content = forcedContent ?? input.trim()
    // Allow empty text if there's a file
    if (!content && !uploadedFileInfo) return

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
          // If there was an optimistic message, replace it with the confirmed server message.
          // Otherwise (text-only), append the new message.
          const confirmedMsg = {
            _id: userMsg._id || crypto.randomUUID(),
            role: 'user' as const,
            content: userMsg.content || uploadedFileContent || content,
            text: userMsg.text,
            fileInfo: userMsg.fileInfo,
            createdAt: userMsg.createdAt || new Date().toISOString()
          }
          if (optimisticMsgId) {
            updateMessage(targetChatId, optimisticMsgId, confirmedMsg)
          } else {
            appendMessage(targetChatId, confirmedMsg)
          }
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
          // Also remove the optimistic user message on error
          if (optimisticMsgId) removeMessage(targetChatId, optimisticMsgId)
          setErrorMessage(errData.message || 'A streaming worker pipeline exception occurred.')
          setLoading(targetChatId, false)
          setLoading(chatId, false)
        },

        messageAbortControllerRef.current.signal,

        (reasoningToken: string) => {
          setActiveTool(null)
          appendReasoningToken(targetChatId, streamingId, reasoningToken)
        },

        uploadedFileInfo,
        uploadedFileContent
      )
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error(err)
        setErrorMessage(err.message || 'An unexpected engine execution fault occurred.')
      }
      setActiveTool(null)
      if (optimisticMsgId) removeMessage(targetChatId, optimisticMsgId)
      setLoading(targetChatId, false)
      setLoading(chatId, false)
    }
  }

  // Rewritten pipeline manager with optimistic UI rendering
  const handleSendAction = async () => {
    const cachedInput = input.trim()
    let fileToUpload = pendingFile

    // Guard — if already loading or uploading, do nothing
    if (loading || uploadingRef.current) return

    // Convert pendingCode snippet to a virtual File if no other file is selected
    if (!fileToUpload && pendingCode) {
      fileToUpload = new File([pendingCode.content], pendingCode.name, { type: 'text/plain' })
    }

    if (!fileToUpload && !cachedInput) return

    let targetChatId = chatId
    if (!targetChatId || targetChatId === 'new') {
      const nameSource = cachedInput || (fileToUpload ? fileToUpload.name : 'New Chat')
      const firstLine = nameSource.split('\n')[0].trim()
      const title = firstLine.length > 28 ? firstLine.slice(0, 25) + '...' : firstLine
      try {
        const newChat = await createChat(title)
        targetChatId = newChat.id
        navigate(`/${targetChatId}`, { replace: true })
      } catch (err) {
        console.error('Failed to create new chat:', err)
        setErrorMessage('Failed to create new chat.')
        return
      }
    }

    if (fileToUpload) {
      // Snapshot the object URL BEFORE clearStaging() so the optimistic message
      // can display the preview while uploading.
      const snapshotPreviewUrl = previewUrlRef.current
      const capturedFile = fileToUpload

      // ── Optimistic render: immediately show the message in the chat ──
      const optimisticId = crypto.randomUUID()
      const ext = '.' + (capturedFile.name.split('.').pop() || '').toLowerCase()
      const isImage = capturedFile.type.startsWith('image/')

      // For images: show local object URL immediately so the thumbnail renders.
      // For text/code/doc: use a placeholder so the file chip renders correctly;
      // actual file content will be set when the server responds.
      const optimisticContent = isImage
        ? (snapshotPreviewUrl || '')
        : `[Uploading: ${capturedFile.name}]`

      appendMessage(targetChatId, {
        _id: optimisticId,
        role: 'user',
        content: optimisticContent,
        text: cachedInput || undefined,
        fileInfo: {
          name: capturedFile.name,
          size: capturedFile.size,
          mimeType: capturedFile.type,
          extension: ext
        },
        createdAt: new Date().toISOString()
      } as any)

      // Clear staging and input immediately after showing optimistic message
      clearStaging()
      setInput('')
      setLoading(targetChatId, true)

      // Upload the file to get the server-side content
      let uploadedFileInfo: any = null
      let uploadedFileContent: string | undefined = undefined

      await handleFileUpload(capturedFile, targetChatId, (data) => {
        uploadedFileInfo = data.fileInfo
        uploadedFileContent = data.content

        // Safe to revoke the object URL now that we have server content
        if (snapshotPreviewUrl) URL.revokeObjectURL(snapshotPreviewUrl)
        previewUrlRef.current = null
      })

      // If upload failed, keep the optimistic message visible so the user
      // can see what they tried to send. The error banner explains the failure.
      if (!uploadedFileInfo) {
        setLoading(targetChatId, false)
        return
      }

      // Send to the LLM. The onUserMessage callback will replace the optimistic
      // message with the confirmed server message (with real DB id + content).
      await sendMessage(cachedInput, targetChatId, uploadedFileInfo, uploadedFileContent, optimisticId)

    } else {
      // Text-only path — append optimistic message immediately
      const optimisticId = crypto.randomUUID()
      appendMessage(targetChatId, {
        _id: optimisticId,
        role: 'user',
        content: cachedInput,
        createdAt: new Date().toISOString()
      })
      setInput('')
      await sendMessage(cachedInput, targetChatId, undefined, undefined, optimisticId)
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
      // FIX #6: Allow Enter to send even if only a file or code snippet is staged
      if (!input.trim() && !pendingFile && !pendingCode) return
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