import { useRef, useEffect, useState } from 'react'
import { Cpu, Loader2, Camera, X } from 'lucide-react'
import { getMsgs } from '../API/Msg'
import { useSendMessage } from './Hook/useSendMessage'
import { useChatStore } from '../Context/ChatContext'
import MarkdownRenderer from './BashComponent'
import { CodeRagModal } from './CodeRag'
import { MsgChatInput } from './MsgChatInput'

// Changed to a named export to match your Chat.tsx import statement
export const Msg = ({ chatId }: { chatId: string }) => {
  const { getMessages, setMessages } = useChatStore()
  const messages = getMessages(chatId)
  
  const bottomRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  
  // Track structural room switches to block smooth layouts on first frame arrivals
  const lastChatIdRef = useRef<string>(chatId)
  const shouldSnapInstantRef = useRef<boolean>(true)

  const [isCameraActive, setIsCameraActive] = useState(false)
  const [isCodeModalOpen, setIsCodeModalOpen] = useState(false)
  const [stream, setStream] = useState<MediaStream | null>(null)

  const sendHook = useSendMessage(chatId)

  // Track if room/URL context shifted underneath the component lifecycle
  if (lastChatIdRef.current !== chatId) {
    lastChatIdRef.current = chatId
    shouldSnapInstantRef.current = true
  }

  // ◄ SNAP INITIAL VIEWS: Stops text-flow jumping on navigation entries
  useEffect(() => {
    if (!bottomRef.current) return

    if (messages.length > 0) {
      if (shouldSnapInstantRef.current) {
        bottomRef.current.scrollIntoView({ behavior: 'auto' })
        shouldSnapInstantRef.current = false
      } else {
        bottomRef.current.scrollIntoView({ behavior: 'smooth' })
      }
    }
  }, [messages, chatId, sendHook.activeTool])

  // Fetch histories when room is empty
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

  // Native Camera System Controls
  const startCamera = async () => {
    try {
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
    if (stream) stream.getTracks().forEach(track => track.stop())
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
          sendHook.onFileSelect(syntheticEvent)
        }
      }, 'image/jpeg')
    }
    closeCamera()
  }

  return (
    <div className="flex flex-col h-full bg-gray-50/50 dark:bg-gray-900/20 relative">
      {/* Messages Viewport Container */}
      <div id="active-chat-stream" className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-5">
        {messages.length === 0 && !sendHook.loading && (
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
                  <div className={`flex items-center gap-3 p-2.5 rounded-xl border ${sendHook.getFileColor(msg.fileInfo.extension)}`}>
                    <div className="p-2 bg-white dark:bg-gray-900 rounded-lg shadow-sm shrink-0">
                      {sendHook.getFileIcon(msg.fileInfo.extension)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate text-sm">{msg.fileInfo.name}</p>
                      <p className="text-xs opacity-60 mt-0.5">
                        {sendHook.formatFileSize(msg.fileInfo.size)} · {msg.fileInfo.extension.toUpperCase().replace('.', '')}
                      </p>
                    </div>
                  </div>
                ) : (
                  <MarkdownRenderer content={msg.content} isUser={msg.role === 'user'} runCode={sendHook.runCode} />
                )}
              </div>
              <span className="text-[10px] text-gray-400 dark:text-gray-500 px-1">{sendHook.formatTime(msg.createdAt)}</span>
            </div>
          </div>
        ))}

        {/* Status Indicators Layer */}
        {(sendHook.loading || sendHook.uploading) && (
          <div className="flex items-end gap-2.5 animate-in fade-in duration-200">
            <div className="w-7 h-7 rounded-full bg-linear-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-xs shrink-0 mb-0.5 shadow-xs">✦</div>
            <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 px-4 py-3 rounded-2xl rounded-bl-sm shadow-xs max-w-[80%]">
              {sendHook.uploading ? (
                <div className="flex items-center gap-2 text-xs text-gray-400"><Loader2 size={12} className="animate-spin text-blue-500" />Uploading…</div>
              ) : sendHook.activeTool ? (
                <div className="flex items-center gap-2.5 text-xs font-medium text-amber-600 dark:text-amber-400 py-0.5">
                  <div className="relative flex items-center justify-center">
                    <Cpu size={14} className="animate-pulse text-amber-500 shrink-0" />
                    <Loader2 size={22} className="animate-spin text-amber-500/40 absolute" />
                  </div>
                  <span className="leading-none">
                    Agent executing tool: <span className="font-mono bg-amber-50 dark:bg-amber-950/40 border border-amber-200/40 dark:border-amber-800/30 px-1.5 py-0.5 rounded-md text-[11px] ml-0.5">{sendHook.activeTool}</span>
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

      {/* Structured Input Subcomponent Component Injection */}
      <MsgChatInput 
        input={sendHook.input}
        setInput={sendHook.setInput}
        loading={sendHook.loading}
        uploading={sendHook.uploading}
        errorMessage={sendHook.errorMessage}
        clearError={sendHook.clearError}
        selectedModel={sendHook.selectedModel}
        setSelectedModel={sendHook.setSelectedModel}
        pendingFile={sendHook.pendingFile}
        previewUrl={sendHook.previewUrl}
        pendingCode={sendHook.pendingCode}
        activeTool={sendHook.activeTool}
        clearStaging={sendHook.clearStaging}
        handleSendAction={sendHook.handleSendAction}
        handleKeyDown={sendHook.handleKeyDown}
        handlePaste={sendHook.handlePaste}
        onFileSelect={sendHook.onFileSelect}
        formatFileSize={sendHook.formatFileSize}
        getFileIcon={sendHook.getFileIcon}
        setIsCodeModalOpen={setIsCodeModalOpen}
        startCamera={startCamera}
      />

      {/* Code Injection Overlay Backdrop */}
      <CodeRagModal 
        isOpen={isCodeModalOpen} 
        onClose={() => setIsCodeModalOpen(false)} 
        onInject={sendHook.setCodeContext} 
        initialData={sendHook.pendingCode}
      />

      {/* Video Framing Render Window */}
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