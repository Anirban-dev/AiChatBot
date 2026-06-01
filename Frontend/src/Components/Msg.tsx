import { useRef, useEffect } from 'react'
import { Send, Square, Loader2, Paperclip, X } from 'lucide-react'
import { getMsgs } from '../API/Msg'
import { useSendMessage } from './Hook/useSendMessage'
import { useChatStore } from '../Context/ChatContext'
import MarkdownRenderer from './BashComponent'

const Msg = ({ chatId }: { chatId: string }) => {
  const { getMessages, setMessages } = useChatStore()
  const messages = getMessages(chatId)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Pull everything neatly out of your expanded hook
  const { 
    input, setInput, stopGeneration, loading, uploading, runCode,
    pendingFile, previewUrl, clearStaging, handleSendAction, handleKeyDown, 
    handlePaste, onFileSelect, formatFileSize, getFileIcon, getFileColor, formatTime
  } = useSendMessage(chatId)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`
  }, [input])

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

  return (
    <div className="flex flex-col h-full">
      {/* Messages Viewport */}
      <div id="active-chat-stream" className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-5">
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full gap-3 select-none">
            <div className="w-12 h-12 rounded-2xl bg-linear-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <span className="text-white text-xl">✦</span>
            </div>
            <p className="text-gray-400 dark:text-gray-500 text-sm">Start a conversation</p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg._id} className={`flex items-end gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 mb-0.5 ${
              msg.role === 'user' ? 'bg-linear-to-br from-blue-500 to-indigo-600 text-white' : 'bg-linear-to-br from-violet-500 to-purple-600 text-white'
            }`}>
              {msg.role === 'user' ? 'A' : '✦'}
            </div>

            <div className={`flex flex-col gap-1 max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user' ? 'bg-blue-600 text-white rounded-2xl rounded-br-sm shadow-sm' : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-2xl rounded-bl-sm border border-gray-100 dark:border-gray-700 shadow-sm'
              }`}>
                {msg.fileInfo ? (
                  <div className={`flex items-center gap-3 p-2.5 rounded-xl border ${getFileColor(msg.fileInfo.extension)}`}>
                    <div className="p-2 bg-white dark:bg-gray-900 rounded-lg shadow-sm shrink-0">
                      {getFileIcon(msg.fileInfo.extension)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate text-sm">{msg.fileInfo.name}</p>
                      <p className="text-xs opacity-60 mt-0.5">
                        {formatFileSize(msg.fileInfo.size)} · {msg.fileInfo.extension.toUpperCase().replace('.', '')}
                      </p>
                    </div>
                  </div>
                ) : (
                  <MarkdownRenderer content={msg.content} isUser={msg.role === 'user'} runCode={runCode} />
                )}
              </div>
              <span className="text-[10px] text-gray-400 dark:text-gray-500 px-1">{formatTime(msg.createdAt)}</span>
            </div>
          </div>
        ))}

        {/* Status Indicators */}
        {(loading || uploading) && (
          <div className="flex items-end gap-2.5">
            <div className="w-7 h-7 rounded-full bg-linear-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-xs shrink-0 mb-0.5">✦</div>
            <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 px-4 py-3 rounded-2xl rounded-bl-sm shadow-sm">
              {uploading ? (
                <div className="flex items-center gap-2 text-xs text-gray-400"><Loader2 size={12} className="animate-spin" />Uploading…</div>
              ) : (
                <div className="flex gap-1 items-center">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              )}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input Action Panel */}
      <div className="px-4 sm:px-6 pb-4 pt-2">
        <div className="relative">
          {previewUrl && (
            <div className="flex items-center gap-3 mb-2.5 p-2 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700/60 w-fit relative group animate-in fade-in slide-in-from-bottom-2 duration-150">
              <div className="relative h-14 w-14 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 shrink-0 shadow-xs">
                {pendingFile?.type.startsWith('image/') ? (
                  <img src={previewUrl} alt="Preview" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center bg-white dark:bg-gray-900">
                    {getFileIcon('.' + (pendingFile?.name.split('.').pop() || ''))}
                  </div>
                )}
              </div>
              <div className="flex flex-col pr-6 max-w-44 sm:max-w-xs">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate">{pendingFile?.name || 'Pasted File'}</p>
                <p className="text-[10px] text-gray-400 mt-0.5 font-medium">{formatFileSize(pendingFile?.size || 0)}</p>
              </div>
              <button onClick={clearStaging} className="absolute -top-1.5 -right-1.5 p-1 bg-gray-200 dark:bg-gray-700 hover:bg-red-500 hover:text-white dark:hover:bg-red-600 rounded-full text-gray-500 dark:text-gray-400 transition-colors shadow-sm cursor-pointer" title="Remove attachment">
                <X size={10} />
              </button>
            </div>
          )}

          <div className="flex items-end gap-2 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 px-3 py-2.5 shadow-sm focus-within:border-gray-300 dark:focus-within:border-gray-600 transition-colors">
            <input type="file" ref={fileInputRef} onChange={(e) => { onFileSelect(e); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="hidden" accept=".*" />
            <button onClick={() => !uploading && fileInputRef.current?.click()} disabled={uploading} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer disabled:opacity-40 shrink-0 mb-0.5" title="Attach file">
              <Paperclip size={17} />
            </button>

            <textarea ref={textareaRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown} onPaste={handlePaste} placeholder="Message…" rows={1} className="flex-1 bg-transparent resize-none outline-none text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 max-h-40 py-0.5 leading-relaxed" />

            {loading || uploading ? (
              <button onClick={stopGeneration} className="p-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors cursor-pointer shrink-0 mb-0.5" title={uploading ? 'Cancel upload' : 'Stop generation'}>
                <Square size={15} fill="white" />
              </button>
            ) : (
              <button onClick={handleSendAction} disabled={!input.trim() && !pendingFile} className="p-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors cursor-pointer shrink-0 mb-0.5">
                <Send size={15} />
              </button>
            )}
          </div>
          <p className="text-center text-[11px] text-gray-300 dark:text-gray-600 mt-2">Enter to send · Shift+Enter for new line</p>
        </div>
      </div>
    </div>
  )
}

export default Msg