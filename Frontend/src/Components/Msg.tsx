import { useRef, useEffect, useState } from 'react'
import { Send, Square, Loader2, Paperclip, X, AlertTriangle, Cpu, Image, FileText, Camera, Video, Code } from 'lucide-react'
import { getMsgs } from '../API/Msg'
import { useSendMessage } from './Hook/useSendMessage'
import { useChatStore } from '../Context/ChatContext'
import MarkdownRenderer from './BashComponent'
import { CodeRagModal } from './CodeRag'

const Msg = ({ chatId }: { chatId: string }) => {
  const { getMessages, setMessages } = useChatStore()
  const messages = getMessages(chatId)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  // Stream toggles & display controls
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isCameraActive, setIsCameraActive] = useState(false)
  const [isCodeModalOpen, setIsCodeModalOpen] = useState(false)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [fileAcceptType, setFileAcceptType] = useState<string>('.*')

  const { 
    input, setInput, stopGeneration, loading, uploading, runCode,
    pendingFile, previewUrl, clearStaging, handleSendAction, handleKeyDown, 
    handlePaste, onFileSelect, formatFileSize, getFileIcon, getFileColor, formatTime,
    activeTool, errorMessage, selectedModel, setSelectedModel, clearError, pendingCode, setCodeContext
  } = useSendMessage(chatId)

  // Close attachment dropdown when clicking outside
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, activeTool])

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

  // Native Camera Handlers
  const startCamera = async () => {
    try {
      setIsMenuOpen(false)
      setIsCameraActive(true)
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
      setStream(mediaStream)
      if (videoRef.current) videoRef.current.srcObject = mediaStream
    } catch (err) {
      console.error("Camera access denied or unavailable", err)
      alert("Could not access system camera device.")
      setIsCameraActive(false)
    }
  }

  const closeCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
    }
    setStream(null)
    setIsCameraActive(false)
  }

  const capturePhoto = () => {
    if (!videoRef.current) return
    const canvas = document.createElement('canvas')
    canvas.width = videoRef.current.videoWidth
    canvas.height = videoRef.current.videoHeight
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new window.File([blob], `snapshot_${Date.now()}.jpg`, { type: 'image/jpeg' })
          const dataTransfer = new DataTransfer()
          dataTransfer.items.add(file)
          const syntheticEvent = {
            target: { files: dataTransfer.files }
          } as React.ChangeEvent<HTMLInputElement>
          onFileSelect(syntheticEvent)
        }
      }, 'image/jpeg')
    }
    closeCamera()
  }

  const triggerNativeUpload = (acceptType: string) => {
    setFileAcceptType(acceptType)
    setIsMenuOpen(false)
    setTimeout(() => {
      fileInputRef.current?.click()
    }, 50)
  }

  return (
    <div className="flex flex-col h-full bg-gray-50/50 dark:bg-gray-900/20 relative">
      {/* Messages Viewport */}
      <div id="active-chat-stream" className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-5">
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full gap-3 select-none">
            <div className="w-12 h-12 rounded-2xl bg-linear-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md">
              <span className="text-white text-xl">✦</span>
            </div>
            <p className="text-gray-400 dark:text-gray-500 text-sm font-medium">Start a conversation</p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg._id} className={`flex items-end gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 mb-0.5 shadow-xs ${
              msg.role === 'user' ? 'bg-linear-to-br from-blue-500 to-indigo-600 text-white' : 'bg-linear-to-br from-violet-500 to-purple-600 text-white'
            }`}>
              {msg.role === 'user' ? 'A' : '✦'}
            </div>

            <div className={`flex flex-col gap-1 max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user' ? 'bg-blue-600 text-white rounded-2xl rounded-br-sm shadow-xs' : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-2xl rounded-bl-sm border border-gray-100 dark:border-gray-700 shadow-xs'
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
          <div className="flex items-end gap-2.5 animate-in fade-in duration-200">
            <div className="w-7 h-7 rounded-full bg-linear-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-xs shrink-0 mb-0.5 shadow-xs">✦</div>
            <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 px-4 py-3 rounded-2xl rounded-bl-sm shadow-xs max-w-[80%]">
              {uploading ? (
                <div className="flex items-center gap-2 text-xs text-gray-400"><Loader2 size={12} className="animate-spin text-blue-500" />Uploading…</div>
              ) : activeTool ? (
                <div className="flex items-center gap-2.5 text-xs font-medium text-amber-600 dark:text-amber-400 py-0.5">
                  <div className="relative flex items-center justify-center">
                    <Cpu size={14} className="animate-pulse text-amber-500 shrink-0" />
                    <Loader2 size={22} className="animate-spin text-amber-500/40 absolute" />
                  </div>
                  <span className="leading-none">
                    Agent executing tool: <span className="font-mono bg-amber-50 dark:bg-amber-950/40 border border-amber-200/40 dark:border-amber-800/30 px-1.5 py-0.5 rounded-md text-[11px] ml-0.5">{activeTool}</span>
                  </span>
                </div>
              ) : (
                <div className="flex gap-1 items-center py-1 px-1.5">
                  <span className="w-1.5 h-1.5 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              )}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input Action Panel */}
      <div className="px-4 sm:px-6 pb-4 pt-2 border-t border-gray-100 dark:border-gray-800/60 bg-white dark:bg-gray-900">
        <div className="relative max-w-4xl mx-auto">
          
          {/* File Attachment Upload Preview Box */}
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

          {/* Claude-Style Code Block Preview Card */}
          {pendingCode && (
            <div 
              onClick={() => setIsCodeModalOpen(true)}
              className="flex flex-col mb-2.5 bg-gray-950 text-gray-200 rounded-xl border border-gray-800 dark:border-gray-700/70 w-64 overflow-hidden relative group cursor-pointer hover:border-indigo-500/80 transition-all shadow-md select-none animate-in fade-in slide-in-from-bottom-2 duration-150"
              title="Click to edit code snippet context"
            >
              {/* Virtual File Banner */}
              <div className="flex items-center justify-between px-3 py-2 bg-gray-900 border-b border-gray-800 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <Code size={13} className="text-indigo-400 shrink-0" />
                  <span className="text-[11px] font-mono font-medium text-gray-300 truncate">{pendingCode.name}</span>
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); clearStaging(); }} 
                  className="p-0.5 rounded-md hover:bg-gray-800 text-gray-400 hover:text-red-400 transition-colors"
                  title="Remove snippet"
                >
                  <X size={13} />
                </button>
              </div>
              
              {/* Micro Text Snippet Pane */}
              <div className="p-2.5 font-mono text-[10px] leading-relaxed text-gray-400 max-h-20 overflow-hidden relative mask-linear-gradient">
                <pre className="whitespace-pre-wrap truncate-lines">
                  {pendingCode.content.split('\n').slice(0, 4).join('\n') || 'Empty block'}
                </pre>
                {/* Bottom fade mask block */}
                <div className="absolute bottom-0 left-0 right-0 h-4 bg-linear-to-t from-gray-950 to-transparent pointer-events-none" />
              </div>
            </div>
          )}

          {/* Structured Network Error Alert Header */}
          {errorMessage && (
            <div className="flex items-center justify-between gap-3 mb-2.5 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-400 text-xs rounded-xl shadow-xs animate-in fade-in slide-in-from-bottom-2 duration-150">
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="text-red-500 shrink-0" />
                <p className="font-medium leading-relaxed">{errorMessage}</p>
              </div>
              {clearError && (
                <button onClick={clearError} className="p-1 text-red-400 hover:text-red-600 dark:hover:text-red-300 rounded-lg hover:bg-red-100 dark:hover:bg-red-950/40 transition-colors cursor-pointer" title="Dismiss message">
                  <X size={14} />
                </button>
              )}
            </div>
          )}

          {/* Core Chat Console Layout */}
          <div className={`flex items-end gap-2 bg-white dark:bg-gray-800 rounded-2xl border px-3 py-2.5 shadow-sm transition-all focus-within:ring-1 focus-within:ring-gray-300 dark:focus-within:ring-gray-600 ${
            errorMessage ? 'border-red-300 dark:border-red-900/60 bg-red-50/10' : 'border-gray-200 dark:border-gray-700 focus-within:border-gray-300 dark:focus-within:border-gray-600'
          }`}>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={(e) => { onFileSelect(e); if (fileInputRef.current) fileInputRef.current.value = ''; }} 
              className="hidden" 
              accept={fileAcceptType} 
            />
            
            {/* Attachment Actions Selector Menu */}
            <div className="relative" ref={menuRef}>
              <button 
                onClick={() => !uploading && !errorMessage && setIsMenuOpen(!isMenuOpen)} 
                disabled={uploading || !!errorMessage} 
                className={`p-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0 mb-0.5 ${
                  isMenuOpen ? 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-white' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`} 
                title="Attach features"
              >
                <Paperclip size={17} />
              </button>

              {/* Float Dropdown Action List */}
              {isMenuOpen && (
                <div className="absolute bottom-full left-0 mb-2 w-56 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-xl py-1.5 z-50 animate-in fade-in slide-in-from-bottom-3 duration-200">
                  <button onClick={() => triggerNativeUpload('image/*')} className="w-full px-3 py-2 text-left text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/60 flex items-center gap-2.5 transition-colors cursor-pointer">
                    <Image size={15} className="text-blue-500" />
                    <span>Upload image</span>
                  </button>
                  <button onClick={() => triggerNativeUpload('.pdf,.doc,.docx,.txt,.csv,.json')} className="w-full px-3 py-2 text-left text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/60 flex items-center gap-2.5 transition-colors cursor-pointer">
                    <FileText size={15} className="text-purple-500" />
                    <span>Upload document</span>
                  </button>
                  <button onClick={startCamera} className="w-full px-3 py-2 text-left text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/60 flex items-center gap-2.5 transition-colors cursor-pointer">
                    <Camera size={15} className="text-emerald-500" />
                    <span>Photo (Camera snap)</span>
                  </button>
                  <button onClick={() => { setIsMenuOpen(false); alert("Live context video stream execution is coming soon!"); }} className="w-full px-3 py-2 text-left text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/60 flex items-center gap-2.5 opacity-60 transition-colors cursor-not-allowed">
                    <Video size={15} className="text-orange-500" />
                    <span className="flex-1">Video Live</span>
                    <span className="text-[9px] font-bold bg-gray-100 dark:bg-gray-900 px-1 py-0.5 rounded text-gray-400">UI ONLY</span>
                  </button>
                  <div className="h-px bg-gray-100 dark:bg-gray-700/60 my-1" />
                  <button onClick={() => { setIsMenuOpen(false); setIsCodeModalOpen(true); }} className="w-full px-3 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/60 flex items-center gap-2.5 transition-colors cursor-pointer">
                    <Cpu size={15} className="text-indigo-500" />
                    <span>Inject Code RAG Context</span>
                  </button>
                </div>
              )}
            </div>

            <textarea 
              ref={textareaRef} 
              value={input} 
              onChange={e => setInput(e.target.value)} 
              onKeyDown={handleKeyDown} 
              onPaste={handlePaste} 
              disabled={!!errorMessage}
              placeholder={errorMessage ? "Resolve engine block exception to continue..." : "Message…"} 
              rows={1} 
              className="flex-1 bg-transparent resize-none outline-none text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 max-h-40 py-0.5 leading-relaxed disabled:opacity-50" 
            />

            {/* Combined Tier Selector & Action Trigger Wrapper Group */}
            <div className="flex items-center gap-2 shrink-0 mb-0.5">
              <select 
                value={selectedModel || 'small'} 
                onChange={(e) => setSelectedModel?.(e.target.value as 'small' | 'large' | 'thinking' | 'critiq')}
                disabled={loading || uploading}
                className="text-xs bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 px-2.5 py-1.5 rounded-xl text-gray-600 dark:text-gray-300 outline-none focus:border-gray-300 dark:focus:border-gray-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-all hover:bg-gray-100 dark:hover:bg-gray-600 shadow-2xs"
              >
                <option value="small">✦ Chat (Small)</option>
                <option value="large">⚡ Tools (Large)</option>
                <option value="thinking">🧠 Reason (Thinking)</option>
                <option value="critique">🧐 Critique (Review)</option>
              </select>

              {loading || uploading ? (
                <button onClick={stopGeneration} className="p-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors cursor-pointer" title={uploading ? 'Cancel upload' : 'Stop generation'}>
                  <Square size={15} fill="white" />
                </button>
              ) : (
                <button 
                  onClick={handleSendAction} 
                  disabled={(!input.trim() && !pendingFile) || !!errorMessage} 
                  className="p-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 dark:disabled:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors cursor-pointer"
                >
                  <Send size={15} />
                </button>
              )}
            </div>
          </div>
          <p className="text-center text-[11px] text-gray-400 dark:text-gray-500 mt-2">Enter to send · Shift+Enter for new line</p>
        </div>
      </div>

      {/* Isolated External Component Flow */}
      <CodeRagModal 
        isOpen={isCodeModalOpen} 
        onClose={() => setIsCodeModalOpen(false)} 
        onInject={setCodeContext} 
        initialData={pendingCode}
      />

      {/* CAMERA VIEWER WINDOW LAYER */}
      {isCameraActive && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                <Camera size={16} className="text-emerald-500" /> Camera Snap Capture
              </h3>
              <button onClick={closeCamera} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"><X size={18} /></button>
            </div>
            <div className="relative bg-black aspect-video flex items-center justify-center">
              <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover transform -scale-x-100" />
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-800/40 flex justify-center gap-3">
              <button onClick={closeCamera} className="px-4 py-2 border border-gray-200 dark:border-gray-700 text-xs font-medium rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer">
                Cancel
              </button>
              <button onClick={capturePhoto} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-xl flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer">
                Capture Frame
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Msg