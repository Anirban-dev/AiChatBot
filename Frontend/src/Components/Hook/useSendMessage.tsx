import { useRef, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, FileSpreadsheet, Image as ImageIcon, File as FileIcon } from 'lucide-react'
import { sendMsg, stopMsg, branchMsg } from '../../API/Msg'
import { uploadFile, deleteFileFromRAG } from '../../API/File'
import { createChat } from '../../API/Chat'
import { useChatStore } from '../../Context/ChatContext'
import { usePython } from './usePython'

// Token counting utility (approximate: 1 token ≈ 4 characters)
const MAX_TOKENS = 400
const TOKEN_CHAR_RATIO = 4

const countTokens = (text: string): number => {
  return Math.ceil(text.length / TOKEN_CHAR_RATIO)
}

const trimToTokenLimit = (text: string): string => {
  const tokenCount = countTokens(text)
  if (tokenCount <= MAX_TOKENS) {
    return text
  }
  // Trim to approximately 100 tokens
  const maxChars = MAX_TOKENS * TOKEN_CHAR_RATIO
  return text.slice(0, maxChars)
}

export const useSendMessage = (chatId: string, vectorDBAvailable: boolean = false) => {
  const navigate = useNavigate()
  const [input, setInput] = useState('')
  const {
    getMessages,
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
  const inputContainerRef = useRef<HTMLDivElement | null>(null)

  const setPreviewUrlSync = (url: string | null) => {
    previewUrlRef.current = url
    setPreviewUrl(url)
  }

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    }
  }, [])

  const handleInputLimit = (value: string) => {
    const trimmed = trimToTokenLimit(value)
    setInput(trimmed)
  }

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

    setInput('')
    const targetChatId = passedChatId || chatId
    setLoading(targetChatId, true)
    setErrorMessage(null)
    setActiveTool(null)

    let effectiveOptimisticId = optimisticMsgId
    if (!effectiveOptimisticId) {
      effectiveOptimisticId = crypto.randomUUID()
      appendMessage(targetChatId, {
        _id: effectiveOptimisticId,
        role: 'user',
        content: content || '',
        fileInfo: uploadedFileInfo,
        file: uploadedFileContent,
        parentId: customParentId || null,
        threadRootId: customThreadRootId || null,
        threadHeadId: customThreadRootId ? effectiveOptimisticId : null,
        createdAt: new Date().toISOString()
      })
      if (!customThreadRootId) {
        setActiveNodeId(targetChatId, effectiveOptimisticId)
      }
    }

    messageAbortControllerRef.current = new AbortController()
    const streamingId = crypto.randomUUID()
    let currentUserMsgId = effectiveOptimisticId

    try {
      await sendMsg(
        targetChatId,
        content,
        selectedModel,

        (token: string) => {
          setActiveTool(null)
          appendToken(targetChatId, streamingId, token, customThreadRootId, currentUserMsgId)
        },

        (userMsg: any) => {
          const confirmedId = userMsg._id || effectiveOptimisticId || crypto.randomUUID()
          currentUserMsgId = confirmedId
          const confirmedMsg = {
            _id: confirmedId,
            role: 'user' as const,
            content: userMsg.content || uploadedFileContent || content,
            text: userMsg.text,
            fileInfo: userMsg.fileInfo || uploadedFileInfo,
            file: userMsg.file ?? uploadedFileContent,
            parentId: userMsg.parentId !== undefined ? userMsg.parentId : (customParentId || null),
            threadRootId: userMsg.threadRootId !== undefined ? userMsg.threadRootId : (customThreadRootId || null),
            threadHeadId: userMsg.threadHeadId !== undefined ? userMsg.threadHeadId : (customThreadRootId ? (effectiveOptimisticId || confirmedId) : null),
            createdAt: userMsg.createdAt || new Date().toISOString()
          }
          if (effectiveOptimisticId) {
            updateMessage(targetChatId, effectiveOptimisticId, confirmedMsg)
          } else {
            appendMessage(targetChatId, confirmedMsg)
          }
          // Update the streaming assistant message's parentId to point to the confirmed user message id
          updateMessage(targetChatId, streamingId, { parentId: confirmedId })
          const isThreadMessage = !!(userMsg.threadRootId || customThreadRootId)
          if (!isThreadMessage) {
            setActiveNodeId(targetChatId, confirmedId)
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
          }, customThreadRootId, currentUserMsgId)
        },

        async (assistantMsg: any) => {
          setActiveTool(null)
          updateMessage(targetChatId, streamingId, assistantMsg)
          const isThreadMessage = !!(assistantMsg.threadRootId || customThreadRootId)
          if (!isThreadMessage && targetChatId === chatId) {
            setActiveNodeId(targetChatId, assistantMsg._id || streamingId)
          }
          setLoading(targetChatId, false)
        },

        (errData: { type?: string; message: string; threadRootId?: string | null }) => {
          setActiveTool(null)
          removeMessage(targetChatId, streamingId)
          if (effectiveOptimisticId) removeMessage(targetChatId, effectiveOptimisticId)
          setErrorMessage(errData.message || 'A streaming worker pipeline exception occurred.')
          setLoading(targetChatId, false)
          if (targetChatId === chatId) {
            setLoading(chatId, false)
          }
        },

        messageAbortControllerRef.current.signal,

        (reasoningToken: string) => {
          setActiveTool(null)
          appendReasoningToken(targetChatId, streamingId, reasoningToken, customThreadRootId, currentUserMsgId)
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
      if (effectiveOptimisticId) removeMessage(targetChatId, effectiveOptimisticId)
      setLoading(targetChatId, false)
      setLoading(chatId, false)
    }
  }

  const branchMessage = async (
    originalMsgId: string,
    forcedContent?: string,
    passedChatId?: string,
    uploadedFileInfo?: any,
    uploadedFileContent?: string,
  ) => {
    const content = forcedContent ?? input.trim()
    if (!content && !uploadedFileInfo) return

    setInput('')
    const targetChatId = passedChatId || chatId
    setLoading(targetChatId, true)
    setErrorMessage(null)
    setActiveTool(null)

    const allMsgs = getMessages(targetChatId)
    const origMsg = allMsgs.find((m: any) => m._id === originalMsgId)
    const branchParentId = origMsg?.parentId || null
    const threadRootId = origMsg?.threadRootId || null

    const optimisticId = crypto.randomUUID()
    let currentUserMsgId = optimisticId

    appendMessage(targetChatId, {
      _id: optimisticId,
      role: 'user',
      content: content || '',
      fileInfo: uploadedFileInfo,
      file: uploadedFileContent,
      parentId: branchParentId,
      threadRootId,
      createdAt: new Date().toISOString()
    })

    if (!threadRootId) {
      setActiveNodeId(targetChatId, optimisticId)
    }

    messageAbortControllerRef.current = new AbortController()
    const streamingId = crypto.randomUUID()

    try {
      await branchMsg(
        targetChatId,
        originalMsgId,
        content,
        selectedModel,

        (token: string) => {
          setActiveTool(null)
          appendToken(targetChatId, streamingId, token, threadRootId, currentUserMsgId)
        },

        (userMsg: any) => {
          const confirmedId = userMsg._id || optimisticId || crypto.randomUUID()
          currentUserMsgId = confirmedId
          const confirmedMsg = {
            _id: confirmedId,
            role: 'user' as const,
            content: userMsg.content || content,
            fileInfo: userMsg.fileInfo || uploadedFileInfo,
            file: userMsg.file ?? uploadedFileContent,
            parentId: userMsg.parentId !== undefined ? userMsg.parentId : branchParentId,
            threadRootId: userMsg.threadRootId !== undefined ? userMsg.threadRootId : threadRootId,
            createdAt: userMsg.createdAt || new Date().toISOString()
          }
          updateMessage(targetChatId, optimisticId, confirmedMsg)
          updateMessage(targetChatId, streamingId, { parentId: confirmedId })
          if (!confirmedMsg.threadRootId) {
            setActiveNodeId(targetChatId, confirmedId)
          }
        },

        (toolPayload: any) => {
          const tool = toolPayload?.tool_call ?? toolPayload
          const toolName = tool?.name ?? tool?.tool ?? 'unknown'
          const toolId = tool?.id ?? toolName
          const status = toolPayload?.status ?? 'running'
          if (status === 'running') setActiveTool(toolName)
          else setActiveTool(null)
          updateToolCall(targetChatId, streamingId, {
            id: toolId, name: toolName,
            status: status as 'running' | 'completed' | 'failed',
            result: toolPayload?.result, error: toolPayload?.error,
          }, threadRootId, currentUserMsgId)
        },

        async (assistantMsg: any) => {
          setActiveTool(null)
          updateMessage(targetChatId, streamingId, assistantMsg)
          if (!assistantMsg.threadRootId && targetChatId === chatId) {
            setActiveNodeId(targetChatId, assistantMsg._id || streamingId)
          }
          setLoading(targetChatId, false)
        },

        (errData: { type?: string; message: string }) => {
          setActiveTool(null)
          removeMessage(targetChatId, streamingId)
          removeMessage(targetChatId, optimisticId)
          setErrorMessage(errData.message || 'Branch streaming error.')
          setLoading(targetChatId, false)
        },

        messageAbortControllerRef.current.signal,

        (reasoningToken: string) => {
          setActiveTool(null)
          appendReasoningToken(targetChatId, streamingId, reasoningToken, threadRootId, currentUserMsgId)
        },

        uploadedFileInfo,
        uploadedFileContent,
      )
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error(err)
        setErrorMessage(err.message || 'An unexpected branch error occurred.')
      }
      setActiveTool(null)
      removeMessage(targetChatId, optimisticId)
      setLoading(targetChatId, false)
    }
  }

  const handleSendAction = async (customParentId?: string, customThreadRootId?: string) => {
    let cachedInput = input.trim()
    let fileToUpload = pendingFile

    if (loading || uploadingRef.current) return

    if (!fileToUpload && pendingCode) {
      fileToUpload = new File([pendingCode.content], pendingCode.name, { type: 'text/plain' })
    }

    if (!fileToUpload && !cachedInput) return

    // Enforce token limit on user input
    const finalInput = trimToTokenLimit(cachedInput)
    cachedInput = finalInput

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
        parentId: customParentId || parentNodeId || null,
        threadRootId: customThreadRootId,
        createdAt: new Date().toISOString()
      } as any)
      if (!customThreadRootId) {
        setActiveNodeId(targetChatId, optimisticId)
      }

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

      await sendMessage(cachedInput, targetChatId, uploadedFileInfo, uploadedFileContent, optimisticId, customParentId || parentNodeId || undefined, customThreadRootId)

    } else {
      const optimisticId = crypto.randomUUID()
      appendMessage(targetChatId, {
        _id: optimisticId,
        role: 'user',
        content: cachedInput,
        parentId: customParentId || parentNodeId || null,
        threadRootId: customThreadRootId,
        createdAt: new Date().toISOString()
      })
      if (!customThreadRootId) {
        setActiveNodeId(targetChatId, optimisticId)
      }
      setInput('')
      await sendMessage(cachedInput, targetChatId, undefined, undefined, optimisticId, customParentId || parentNodeId || undefined, customThreadRootId)
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

  // Handle paste for text content
  const handleTextPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    const trimmedText = trimToTokenLimit(text)
    setInput(trimmedText)
  }

  // Handle drag over event
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (errorMessage) return

    // Allow drop only for images
    const hasImage = Array.from(e.dataTransfer.items).some(
      item => item.type.startsWith('image/')
    )
    if (hasImage) {
      e.dataTransfer.dropEffect = 'copy'
      inputContainerRef.current?.classList.add('border-amber-400', 'ring-1', 'ring-amber-400/50')
    } else {
      e.dataTransfer.dropEffect = 'none'
    }
  }

  // Handle drag leave event
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    inputContainerRef.current?.classList.remove('border-amber-400', 'ring-1', 'ring-amber-400/50')
  }

  // Handle drop event
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    inputContainerRef.current?.classList.remove('border-amber-400', 'ring-1', 'ring-amber-400/50')

    if (errorMessage) return
    if (uploadingRef.current) return

    const files = e.dataTransfer.files
    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'))

    if (imageFiles.length === 0) {
      setErrorMessage('Please drag and drop image files only.')
      return
    }

    // Handle the first image file found
    const file = imageFiles[0]
    setPendingFile(file)
    const url = URL.createObjectURL(file)
    setPreviewUrlSync(url)
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
    input, setInput, sendMessage, branchMessage, stopGeneration, handleFileUpload, loading, uploading, runCode, isPythonReady,
    pendingFile, previewUrl, clearStaging, handleSendAction, handleKeyDown, pendingCode, setCodeContext,
    handlePaste, handleTextPaste, countTokens, onFileSelect, formatFileSize, getFileIcon, formatTime,
    activeTool, setActiveTool, errorMessage, setErrorMessage, selectedModel, setSelectedModel, clearError,
    vectorDBAvailable, handleDragOver, handleDragLeave, handleDrop, inputContainerRef
  }
}