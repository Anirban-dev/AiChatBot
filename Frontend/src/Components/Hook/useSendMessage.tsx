import { useRef, useState, useEffect } from 'react'
// CHANGED: Renamed 'File' import to 'FileIcon' to prevent state/constructor overrides
import { FileText, FileSpreadsheet, Image as ImageIcon, File as FileIcon } from 'lucide-react'
import { sendMsg, stopMsg } from '../../API/Msg'
import { uploadFile, deleteFileFromRAG } from '../../API/File'
import { renameChat } from '../../API/Chat' 
import { useChatStore } from '../../Context/ChatContext'
import { usePython } from './usePython'

export const useSendMessage = (chatId: string) => {
  const [input, setInput] = useState('')
  const { getMessages, setMessages, appendMessage, appendToken, updateMessage, removeMessage, isLoading, setLoading } = useChatStore()
  const { runCode, isReady: isPythonReady } = usePython()

  const abortControllerRef = useRef<AbortController | null>(null)
  const [uploading, setUploading] = useState(false)
  const currentFileName = useRef<string | null>(null)
  const [pendingCode, setPendingCode] = useState<{name: string, content: string} | null>(null);
  const loading = isLoading(chatId)

  // ── INFRASTRUCTURE CONTROLS ──────────────────────────────────────────────
  const [selectedModel, setSelectedModel] = useState<'small' | 'large' | 'thinking' | 'critiq'>('small')
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const clearError = () => setErrorMessage(null)

  // File Attachment & Staging States - Now safely references native browser File type
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  // Object URL cleanup
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const clearStaging = () => {
  setPendingFile(null);
  setPendingCode(null); // Clear the code too
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  }
};

const setCodeContext = (name: string, content: string) => {
  setPendingCode({ name, content });
};

  const stopGeneration = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    if (uploading && currentFileName.current) {
      try {
        await deleteFileFromRAG(currentFileName.current)
      } catch (err) {
        console.error("Cleanup error:", err)
      } finally {
        setUploading(false)
        currentFileName.current = null
      }
      return 
    }
    try {
      await stopMsg(chatId)
    } catch (err) {
      console.error("Stop error:", err)
    } finally {
      setLoading(chatId, false)
      setActiveTool(null) // Reset tool indicator on manual stop
    }
  }

  const handleFileUpload = async (file: File, onUploaded: (data: any) => void) => {
    if (!file || !chatId || uploading || loading) return
    setUploading(true)
    currentFileName.current = file.name
    abortControllerRef.current = new AbortController()
    try {
      const res = await uploadFile(file, chatId, abortControllerRef.current.signal)
      if (res.data) onUploaded(res.data)
    } catch (err: any) {
      if (err.name !== 'AbortError' && err.name !== 'CanceledError') {
        console.error(err)
      }
    } finally {
      setUploading(false)
      currentFileName.current = null
      abortControllerRef.current = null
    }
  }

  const sendMessage = async (forcedContent?: string) => {
    const content = forcedContent || input.trim()
    if (!content && !forcedContent) return

    if (!forcedContent) setInput('')
    setLoading(chatId, true)
    
    // Clear out pipeline alerts on fresh execution cycles
    setErrorMessage(null)
    setActiveTool(null)

    abortControllerRef.current = new AbortController()
    const streamingId = crypto.randomUUID()
    const targetChatId = chatId 

    try {
      await sendMsg(
        targetChatId,      // #1: chatId
        content,           // #2: content
        selectedModel,     // #3: model tier selection ('small' | 'large' | 'thinking' | "critiq")
        
        // #4: onToken
        (token: string) => {
          setActiveTool(null) // Drop tool status banner once standard text tokens start arriving
          appendToken(targetChatId, streamingId, token)
        },
        
        // #5: onUserMessage
        (userMsg: any) => {
          appendMessage(targetChatId, {
            _id: userMsg._id || crypto.randomUUID(),
            role: 'user',
            content: userMsg.content || content,
            createdAt: userMsg.createdAt || new Date().toISOString()
          })
        },
        
        // #6: onToolCall (Captures our active custom tool stream keys)
        (toolPayload: any) => {
          if (toolPayload?.status === 'running' && toolPayload?.tool_call?.name) {
            setActiveTool(toolPayload.tool_call.name)
          } else {
            setActiveTool(null)
          }
        },
        
        // #7: onDone
        async (assistantMsg) => {
          setActiveTool(null)
          updateMessage(targetChatId, streamingId, assistantMsg)
          if (targetChatId === chatId) setLoading(chatId, false)

          const history = getMessages(targetChatId)
          const assistantResponses = history.filter(m => m.role === 'assistant')

          if (assistantResponses.length <= 1) {
            const firstUserMsg = history.find(m => m.role === 'user')
            const titleSource = firstUserMsg ? firstUserMsg.content : content
            
            const firstLine = titleSource.split('\n')[0].trim()
            const autoGeneratedTitle = firstLine.length > 28 ? firstLine.slice(0, 25) + '...' : firstLine
            
            try {
              await renameChat(targetChatId, autoGeneratedTitle)
              window.dispatchEvent(new CustomEvent('chat-auto-renamed', {
                detail: { chatId: targetChatId, title: autoGeneratedTitle }
              }))
            } catch (renameError) {
              console.error("Failed to automatically update chat title:", renameError)
            }
          }
        },
        
        // #8: onError (Handles explicit error packets streaming from Python agent loop)
        (errData: { type?: string; message: string }) => {
          setActiveTool(null)
          removeMessage(targetChatId, streamingId)
          setErrorMessage(errData.message || "A streaming worker pipeline exception occurred.")
          if (targetChatId === chatId) setLoading(chatId, false)
        },
        
        // #9: AbortSignal
        abortControllerRef.current.signal
      )
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error(err)
        setErrorMessage(err.message || "An unexpected engine execution fault occurred.")
      }
      setActiveTool(null)
      setLoading(chatId, false)
    }
  }

  // Sequenced Send Process Manager
  const handleSendAction = async () => {
    if (pendingFile) {
      const fileToUpload = pendingFile
      const cachedInput = input.trim()
      
      clearStaging()

      await handleFileUpload(fileToUpload, (data) => {
        setMessages(chatId, [...getMessages(chatId), data])
      })

      if (cachedInput) {
        sendMessage(cachedInput)
      }
    } else if (input.trim()) {
      sendMessage()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // If an error exists, block the enter key submission path
    if (errorMessage) return

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
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
          setPreviewUrl(URL.createObjectURL(file))
          break
        }
      }
    }
  }

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPendingFile(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  // File presentation helpers
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  // CHANGED: Now returns instantiated elements safely using JSX style notation inside arrays
  const getFileIcon = (ext: string) => {
    const e = ext.toLowerCase()
    if (['.pdf', '.doc', '.docx', '.txt', '.md'].includes(e)) return <FileText size={18} className="text-blue-500" />
    if (['.csv', '.xlsx', '.xls'].includes(e)) return <FileSpreadsheet size={18} className="text-green-500" />
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(e)) return <ImageIcon size={18} className="text-purple-500" />
    return <FileIcon size={18} className="text-gray-400" />
  }

  const getFileColor = (ext: string) => {
    const e = ext.toLowerCase()
    if (['.pdf'].includes(e)) return 'border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/5'
    if (['.doc', '.docx', '.txt', '.md'].includes(e)) return 'border-blue-200 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/5'
    if (['.csv', '.xlsx', '.xls'].includes(e)) return 'border-green-200 dark:border-green-500/20 bg-green-50 dark:bg-green-500/5'
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(e)) return 'border-purple-200 dark:border-purple-500/20 bg-purple-50 dark:bg-purple-500/5'
    return 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800'
  }

  const formatTime = (date: string) =>
    new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  // Clear runtime errors automatically when the user begins typing
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