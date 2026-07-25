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
    setLoading,
    activeNodeId,
    setActiveNodeId
  } = useChatStore()
  const { runCode, isReady: isPythonReady } = usePython()

  const messageAbortControllerRef = useRef<AbortController | null>(null)
  const uploadAbortControllerRef = useRef<AbortController | null>(null)

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
    setPreviewUrl(null)
  }

  const setCodeContext = (name: string, content: string) => {
    setPendingCode({ name, content })
  }

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

  // useSendMessage.ts
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
    if (res) {
      if (res.indexed === false) {
        console.warn('File saved but AI indexing failed:', res.indexWarning)
      }
      onUploaded(res)
    }
  } catch (err: any) {
    if (err.name !== 'AbortError' && err.name !== 'CanceledError') {
      const serverMsg = err?.response?.data?.error   // ← the friendly 429 message lives here
      console.error(err)
      setErrorMessage(serverMsg || err.message || 'File upload encountered an error.')
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
    optimisticMsgId?: string,
    customParentId?: string,
    customThreadRootId?: string
  ) => {
    const content = forcedContent ?? input.trim()
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
          const confirmedMsg = {
            _id: userMsg._id || crypto.randomUUID(),
            role: 'user' as const,
            content: userMsg.content || uploadedFileContent || content,
            text: userMsg.text,
            fileInfo: userMsg.fileInfo,
            file: userMsg.file ?? uploadedFileContent,
            parentId: userMsg.parentId || null,
            threadRootId: userMsg.threadRootId || customThreadRootId || null,
            createdAt: userMsg.createdAt || new Date().toISOString()
          }
          if (optimisticMsgId) {
            updateMessage(targetChatId, optimisticMsgId, confirmedMsg)
          } else {
            appendMessage(targetChatId, confirmedMsg)
          }
          const isThreadMessage = !!(userMsg.threadRootId || customThreadRootId)
          if (!isThreadMessage) {
            setActiveNodeId(targetChatId, confirmedMsg._id)
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
          const isThreadMessage = !!(assistantMsg.threadRootId || customThreadRootId)
          if (!isThreadMessage) {
            setActiveNodeId(targetChatId, assistantMsg._id)
          }
          setLoading(targetChatId, false)
          setLoading(chatId, false)
        },

        (errData: { type?: string; message: string }) => {
          setActiveTool(null)
          removeMessage(targetChatId, streamingId)
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
        uploadedFileContent,
        customParentId,
        customThreadRootId
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

  const handleSendAction = async () => {
    const cachedInput = input.trim()
    let fileToUpload = pendingFile

    if (loading || uploadingRef.current) return

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

    const parentNodeId = activeNodeId(targetChatId)

    if (fileToUpload) {
      const snapshotPreviewUrl = previewUrlRef.current
      const capturedFile = fileToUpload

      const optimisticId = crypto.randomUUID()
      const ext = '.' + (capturedFile.name.split('.').pop() || '').toLowerCase()
      const isImage = capturedFile.type.startsWith('image/')

      appendMessage(targetChatId, {
        _id: optimisticId,
        role: 'user',
        content: cachedInput || '',
        file: isImage ? (snapshotPreviewUrl || undefined) : undefined,
        fileInfo: {
          name: capturedFile.name,
          size: capturedFile.size,
          mimeType: capturedFile.type,
          extension: ext
        },
        parentId: parentNodeId || null,
        createdAt: new Date().toISOString()
      } as any)

      clearStaging()
      setInput('')
      setLoading(targetChatId, true)

      let uploadedFileInfo: any = null
      let uploadedFileContent: string | undefined = undefined

      await handleFileUpload(capturedFile, targetChatId, (data) => {
        uploadedFileInfo = data.fileInfo
        uploadedFileContent = data.file

        if (snapshotPreviewUrl) URL.revokeObjectURL(snapshotPreviewUrl)
        previewUrlRef.current = null
      })

      if (!uploadedFileInfo) {
        removeMessage(targetChatId, optimisticId)
        setErrorMessage('File upload failed. Please try again.')
        setLoading(targetChatId, false)
        return
      }

      await sendMessage(cachedInput, targetChatId, uploadedFileInfo, uploadedFileContent, optimisticId, parentNodeId || undefined)

    } else {
      const optimisticId = crypto.randomUUID()
      appendMessage(targetChatId, {
        _id: optimisticId,
        role: 'user',
        content: cachedInput,
        parentId: parentNodeId || null,
        createdAt: new Date().toISOString()
      })
      setInput('')
      await sendMessage(cachedInput, targetChatId, undefined, undefined, optimisticId, parentNodeId || undefined)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (loading || uploading || errorMessage) return
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
    handlePaste, onFileSelect, formatFileSize, getFileIcon, formatTime,
    activeTool, setActiveTool, errorMessage, setErrorMessage, selectedModel, setSelectedModel, clearError
  }
}