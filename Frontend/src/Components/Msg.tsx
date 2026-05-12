import { useRef, useEffect } from 'react'
import { Send, Square, FileText, FileSpreadsheet, Image as ImageIcon, File, Loader2 } from 'lucide-react'
import { getMsgs } from '../API/Msg'
import { useSendMessage } from './Hook/SendMessage'
import { useChatStore } from '../Context/ChatContext'
import MarkdownRenderer from './BashComponent'

const Msg = ({ chatId }: { chatId: string }) => {
  const { getMessages, setMessages } = useChatStore()

  const messages = getMessages(chatId)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { input, setInput, sendMessage, stopGeneration, handleFileUpload, loading, uploading } = useSendMessage(chatId)

  // Auto-scroll to bottom on new message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [input])

  // Get all messages
  useEffect(() => {
    if (!chatId) return
    if (getMessages(chatId).length > 0) return
    const fetchMsgs = async () => {
      try {
        const data = await getMsgs(chatId)
        setMessages(chatId, data)
      } catch (err) {
        console.error(err)
      }
    }
    fetchMsgs()
  }, [chatId])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const onFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    await handleFileUpload(file, (data) => {
      setMessages(chatId, [...messages, data])
    })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getFileIcon = (ext: string) => {
    const e = ext.toLowerCase()
    if (['.pdf', '.doc', '.docx', '.txt', '.md'].includes(e)) return <FileText className="text-blue-500" />
    if (['.csv', '.xlsx', '.xls'].includes(e)) return <FileSpreadsheet className="text-green-500" />
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(e)) return <ImageIcon className="text-purple-500" />
    return <File className="text-gray-500" />
  }

  const getFileColor = (ext: string) => {
    const e = ext.toLowerCase()
    if (['.pdf'].includes(e)) return 'border-red-500/20 bg-red-500/5'
    if (['.doc', '.docx', '.txt', '.md'].includes(e)) return 'border-blue-500/20 bg-blue-500/5'
    if (['.csv', '.xlsx', '.xls'].includes(e)) return 'border-green-500/20 bg-green-500/5'
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(e)) return 'border-purple-500/20 bg-purple-500/5'
    return 'border-gray-500/20 bg-gray-500/5'
  }

  return (
    <div className="flex flex-col h-full">

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4 ">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-[95%]">
            <p className="text-gray-400 dark:text-gray-500 text-sm">
              Start a conversation...
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg._id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm
                ${msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-sm'
                  : 'bg-gray-200 dark:bg-gray-700 text-black dark:text-white rounded-bl-sm border border-gray-100 dark:border-gray-700'
                }`}
            >
              {msg.fileInfo ? (
                <div className={`flex items-center gap-3 p-3 rounded-xl border ${getFileColor(msg.fileInfo.extension)} mb-1`}>
                  <div className="p-2 bg-white dark:bg-gray-900 rounded-lg shadow-sm">
                    {getFileIcon(msg.fileInfo.extension)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-sm">
                      {msg.fileInfo.name}
                    </p>
                    <p className={`text-xs opacity-70`}>
                      {formatFileSize(msg.fileInfo.size)} • {msg.fileInfo.extension.toUpperCase().replace('.', '')}
                    </p>
                  </div>
                </div>
              ) : (
                <MarkdownRenderer 
                  content={msg.content} 
                  isUser={msg.role === 'user'} 
                />
              )}
              <p className={`text-[10px] mt-1.5 opacity-60 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {(loading || uploading) && (
          <div className="flex justify-start">
            <div className="bg-gray-200 dark:bg-gray-700 px-4 py-3 rounded-2xl rounded-bl-sm">
              <div className="flex gap-1 items-center">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
                <span className="ml-2 text-xs text-gray-500">{uploading ? 'Uploading...' : ''}</span>
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-end gap-2 bg-slate-200 dark:bg-slate-700 rounded-2xl px-4 py-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={onFileSelect}
            className="hidden"
            accept=".*"
          />
          <div
            className={`group relative flex items-center justify-center w-10 h-10 rounded-full transition-all duration-200
              ${uploading
                ? 'bg-blue-100 dark:bg-blue-900/30'
                : 'hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer'}`}
            onClick={() => !uploading && fileInputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 size={20} className="text-blue-600 animate-spin" />
            ) : (
              <span className="text-2xl text-gray-500 group-hover:text-blue-600">+</span>
            )}
          </div>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
            rows={1}
            className="flex-1 bg-transparent resize-none outline-none text-sm 
              text-black dark:text-white placeholder-gray-400 max-h-40 py-1"
          />
          {/* Send or stop button */}
          {loading || uploading ? (
            <button
              onClick={stopGeneration}
              className="mb-1 p-1.5 rounded-full bg-red-500 hover:bg-red-600 transition text-white cursor-pointer"
              title={uploading ? "Cancel Upload" : "Stop Generation"}
            >
              <Square size={14} fill="white" />
            </button>
          ) : (
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading || uploading}
              className="mb-1 p-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 
                disabled:opacity-40 disabled:cursor-not-allowed transition text-white"
            >
              <Send size={16} />
            </button>
          )}
        </div>
      </div>

    </div>
  )
}

export default Msg