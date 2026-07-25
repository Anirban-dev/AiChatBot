import { useRef, useEffect, useState, useMemo } from 'react'
import { Cpu, Loader2, Camera, X, MessageSquare, Plus } from 'lucide-react'
import { getMsgs } from '../API/Msg'
import { useSendMessage } from './Hook/useSendMessage'
import { useChatStore } from '../Context/ChatContext'
import { CodeRagModal } from './CodeRag'
import { MsgChatInput } from './MsgChatInput'
import { TextFilePreviewModal } from './TextFilePreviewModal'
import { MessageBubble } from './MessageBubble'
import { ThreadPanel } from './ThreadPanel'

export const Msg = ({ chatId }: { chatId?: string }) => {
  const activeChatId = chatId || 'new'
  const {
    getMessages, setMessages, getBranchInfo, getActivePath, activeNodeId, switchBranch,
    setActiveNodeId, pendingActiveMsgId, clearPendingActiveMsgId
  } = useChatStore()
  
  // Show toast when opening a new thread
  const showNewThreadToast = () => {
    // Create a temporary toast element using setTimeout to allow React to render first
    setTimeout(() => {
      const toast = document.createElement('div')
      toast.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 z-50 bg-amber-500 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-bottom-4 duration-300'
      toast.innerHTML = `
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" class="shrink-0">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <span class="text-sm font-medium">Start a new thread to begin discussing this topic</span>
        <button class="p-1 hover:bg-white/20 rounded-full transition-colors cursor-pointer" onclick="this.parentElement.remove()">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      `
      // Add proper click handler
      const closeButton = toast.querySelector('button')
      if (closeButton) {
        closeButton.onclick = () => toast.remove()
      }
      document.body.appendChild(toast)
      setTimeout(() => toast.remove(), 4000)
    }, 100)
  }
  const activeNode = activeNodeId(activeChatId)
  const messages = getActivePath(activeChatId, activeNode || '')
  const allMessages = getMessages(activeChatId)

  // Filter main-timeline messages (no threadRootId) for display
  const mainMessages = useMemo(
    () => messages.filter((m) => !m.threadRootId),
    [messages]
  )

  // Build reply count map: rootMessageId -> count
  const threadReplyCountMap = useMemo(() => {
    const map: Record<string, number> = {}
    allMessages.forEach((m) => {
      if (m.threadRootId) {
        map[m.threadRootId] = (map[m.threadRootId] || 0) + 1
      }
    })
    return map
  }, [allMessages])

  const [activeThreadRootId, setActiveThreadRootId] = useState<string | null>(null)
  const [isNewThread, setIsNewThread] = useState<boolean>(false)
  const activeThreadRoot = activeThreadRootId
    ? allMessages.find((m) => m._id === activeThreadRootId) ?? null
    : null

  const handleOpenThread = (msgId: string) => {
    setActiveThreadRootId((prev) => (prev === msgId ? null : msgId))
  }

  const handleStartNewThread = (msgId: string) => {
    setActiveThreadRootId(msgId) // Open thread panel with this message as root
    setIsNewThread(true)
    setTimeout(() => setIsNewThread(false), 3000)
    showNewThreadToast()
  }

  // Close thread when chat changes
  useEffect(() => {
    setActiveThreadRootId(null)
    setIsNewThread(false)
  }, [activeChatId])

  // Close thread when the root message is no longer in the active branch path
  // (i.e., user switched to a different edit branch via prev/next navigator)
  useEffect(() => {
    if (!activeThreadRootId) return
    const isStillVisible = mainMessages.some(m => m._id === activeThreadRootId)
    if (!isStillVisible) {
      setActiveThreadRootId(null)
    }
  }, [mainMessages, activeThreadRootId])

  const bottomRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  const lastChatIdRef = useRef<string>(activeChatId)
  const shouldSnapInstantRef = useRef<boolean>(true)

  const [isCameraActive, setIsCameraActive] = useState(false)
  const [isCodeModalOpen, setIsCodeModalOpen] = useState(false)
  const [stream, setStream] = useState<MediaStream | null>(null)

  const [textPreviewMsg, setTextPreviewMsg] = useState<{ name: string; content: string } | null>(null)
  const [isEditing, setIsEditing] = useState<string | null>(null)
  const [editingFiles, setEditingFiles] = useState<File[]>([])
  const [editingFileInputs, setEditingFileInputs] = useState<File[]>([])
  const [, setCopiedText] = useState<string | null>(null)

  const sendHook = useSendMessage(activeChatId)

  if (lastChatIdRef.current !== activeChatId) {
    lastChatIdRef.current = activeChatId
    shouldSnapInstantRef.current = true
  }

  const isUserScrolledUpRef = useRef<boolean>(false)

  // Track scroll position to respect user's manual scroll up during streaming
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100
    isUserScrolledUpRef.current = !isAtBottom
  }

  useEffect(() => {
    if (!bottomRef.current) return
    if (messages.length === 0) return

    // Snap to bottom instantly when switching chats
    if (shouldSnapInstantRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'auto' })
      shouldSnapInstantRef.current = false
      isUserScrolledUpRef.current = false
      return
    }

    // Only auto-scroll while LLM is generating if the user hasn't explicitly scrolled up
    if (sendHook.loading && !isUserScrolledUpRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, chatId, sendHook.loading])

  useEffect(() => {
    if (!chatId || chatId === 'new') return
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

  // After messages load, apply any pending search-branch navigation:
  // walk from the pending message ID to its leaf descendant (staying on main-timeline)
  // so the user sees the full conversation on the correct branch.
  useEffect(() => {
    const pendingId = pendingActiveMsgId(activeChatId)
    if (!pendingId) return
    const msgs = getMessages(activeChatId)
    if (msgs.length === 0) return
    const target = msgs.find(m => m._id === pendingId)
    if (!target) return

    // Walk to leaf on main timeline from this message
    const mainMsgs = msgs.filter(m => !m.threadRootId)
    let currentId = pendingId
    while (true) {
      const children = mainMsgs.filter(m => m.parentId === currentId)
      if (children.length === 0) break
      currentId = children[children.length - 1]._id
    }
    setActiveNodeId(activeChatId, currentId)
    clearPendingActiveMsgId(activeChatId)
  }, [activeChatId, getMessages(activeChatId).length])

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
    if (stream) stream.getTracks().forEach((track: MediaStreamTrack) => track.stop())
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

  const startEditing = (msgId: string) => {
    const msg = messages.find(m => m._id === msgId)
    if (!msg) return

    setIsEditing(msgId)
    if (msg.fileInfo) {
      setEditingFiles([{
        name: msg.fileInfo.name,
        size: msg.fileInfo.size,
        mimeType: msg.fileInfo.mimeType,
        extension: msg.fileInfo.extension,
        file: msg.file,
        isExisting: true
      } as any])
    } else {
      setEditingFiles([])
    }
    setEditingFileInputs([])
  }

  const cancelEditing = () => {
    setIsEditing(null)
    setEditingFiles([])
    setEditingFileInputs([])
  }

  const saveAndSubmit = async (newContent: string) => {
    const msgId = isEditing
    if (!msgId) return

    const allMsgs = getMessages(activeChatId)
    const msg = allMsgs.find(m => m._id === msgId)
    if (!msg) return

    cancelEditing()

    try {
      if (editingFileInputs.length > 0) {
        const fileToUpload = editingFileInputs[0]
        let uploadedFileInfo: any = null
        let uploadedFileContent: string | undefined = undefined

        await sendHook.handleFileUpload(fileToUpload, activeChatId, (data) => {
          uploadedFileInfo = data.fileInfo
          uploadedFileContent = data.file
        })

        if (!uploadedFileInfo) {
          alert('File upload failed. Please try again.')
          return
        }

        await sendHook.sendMessage(newContent, activeChatId, uploadedFileInfo, uploadedFileContent, undefined, msg.parentId || undefined)
      } else if (editingFiles.length > 0 && (editingFiles[0] as any).isExisting) {
        const existing = editingFiles[0]
        await sendHook.sendMessage(
          newContent,
          activeChatId,
          {
            name: existing.name,
            size: existing.size,
            mimeType: (existing as any).mimeType,
            extension: (existing as any).extension
          },
          (existing as any).file,
          undefined,
          msg.parentId || undefined
        )
      } else {
        await sendHook.sendMessage(newContent, activeChatId, undefined, undefined, undefined, msg.parentId || undefined)
      }
    } catch (error) {
      console.error('Failed to save message:', error)
      alert(error instanceof Error ? error.message : 'Failed to save message. Please try again.')
    }
  }

  const handleEditFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setEditingFileInputs([e.target.files[0]])
      setEditingFiles([]) // clear any existing file since we replaced it
    }
  }

  const removeEditFile = () => {
    setEditingFileInputs([])
    setEditingFiles([])
  }

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedText(text)
    setTimeout(() => setCopiedText(null), 2000)
  }

  const lastMsg = mainMessages[mainMessages.length - 1]
  const isStreaming = lastMsg?.role === 'assistant' && lastMsg?.content?.length > 0
  const showTypingIndicator = (sendHook.loading || sendHook.uploading) && !isStreaming

  return (
    <div className="flex flex-col h-full relative overflow-hidden" style={{ backgroundColor: 'var(--bg-chat)' }}>
      {/* Main chat area + Thread panel side-by-side */}
      <div className="flex flex-1 overflow-hidden">
        <div id="active-chat-stream" onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-5">
        {mainMessages.length === 0 && !sendHook.loading && (
          <div className="flex flex-col items-center justify-center h-full gap-3 select-none">
            <div className="w-12 h-12 rounded-2xl bg-linear-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md">
              <span className="text-white text-xl">✦</span>
            </div>
            <p className="text-gray-400 dark:text-gray-500 text-sm font-medium">Start a conversation</p>
          </div>
        )}

        {mainMessages.map((msg) => {
          const isCurrentMsgEditing = isEditing === msg._id
          const isUserMessage = msg.role === 'user'
          const branchInfo = isCurrentMsgEditing ? undefined : getBranchInfo(activeChatId, msg._id)

          return (
            <MessageBubble
              key={msg._id}
              msg={{ ...msg, isUser: isUserMessage, threadReplyCount: threadReplyCountMap[msg._id] || 0 }}
              isUser={isUserMessage}
              runCode={sendHook.runCode}
              getFileIcon={sendHook.getFileIcon}
              formatFileSize={sendHook.formatFileSize}
              formatTime={sendHook.formatTime}
              onOpenTextPreview={(name, content) => setTextPreviewMsg({ name, content })}
              isEditing={isCurrentMsgEditing}
              onEditStart={() => isUserMessage && startEditing(msg._id)}
              onCancelEdit={cancelEditing}
              onSaveEdit={saveAndSubmit}
              branchInfo={branchInfo}
              onBranchChange={(dir) => switchBranch(activeChatId, msg._id, dir)}
              editingFiles={editingFiles}
              editingFileInputs={editingFileInputs}
              onEditFileSelect={handleEditFileSelect}
              onRemoveEditFile={removeEditFile}
              onCopy={handleCopy}
              onOpenThread={handleOpenThread}
              isActiveThread={activeThreadRootId === msg._id}
              threadReplyCount={threadReplyCountMap[msg._id] || 0}
              isCurrentChatEmpty={mainMessages.length === 0}
              onOpenNewThread={handleStartNewThread}
            />
          )
        })}

        {showTypingIndicator && (
          <div className="flex items-end gap-2.5 animate-in fade-in duration-200">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white text-xs shrink-0 mb-0.5 shadow-sm">✦</div>
            <div
              className="px-4 py-3 rounded-2xl rounded-bl-sm shadow-sm max-w-[80%]"
              style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-light)' }}
            >
              {sendHook.uploading ? (
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <Loader2 size={12} className="animate-spin text-blue-500" />Uploading…
                </div>
              ) : sendHook.activeTool ? (
                <div className="flex items-center gap-2.5 text-xs font-medium text-amber-600 dark:text-amber-400 py-0.5">
                  <div className="relative flex items-center justify-center">
                    <Cpu size={14} className="animate-pulse text-amber-500 shrink-0" />
                    <Loader2 size={22} className="animate-spin text-amber-500/40 absolute" />
                  </div>
                  <span className="leading-none">
                    Calling tool: <span className="font-mono bg-amber-50 dark:bg-amber-950/40 border border-amber-200/40 dark:border-amber-800/30 px-1.5 py-0.5 rounded-md text-[11px] ml-0.5">{sendHook.activeTool}</span>
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

        {/* Thread Panel - desktop right side */}
        {activeThreadRoot && (
          <div className="hidden md:flex h-full transition-all duration-200">
            <ThreadPanel
              chatId={activeChatId}
              rootMessage={activeThreadRoot}
              allMessages={allMessages}
              onOpenTextPreview={(name, content) => setTextPreviewMsg({ name, content })}
              onClose={() => setActiveThreadRootId(null)}
              runCode={sendHook.runCode}
              getFileIcon={sendHook.getFileIcon}
              formatFileSize={sendHook.formatFileSize}
              formatTime={sendHook.formatTime}
            />
          </div>
        )}
      </div>

      {/* New thread indicator toast */}
      {isNewThread && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50">
          <div className="bg-amber-500 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <MessageSquare size={16} />
            <span className="text-sm font-medium">Start a new thread to begin discussing this topic</span>
            <button
              onClick={() => setIsNewThread(false)}
              className="p-1 hover:bg-white/20 rounded-full transition-colors cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Thread Panel - mobile slide-over */}
      {activeThreadRoot && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="flex-1 bg-black/40" onClick={() => setActiveThreadRootId(null)} />
          <div className="w-[90vw] max-w-sm h-full flex shadow-2xl animate-in slide-in-from-right duration-200">
            <ThreadPanel
              chatId={activeChatId}
              rootMessage={activeThreadRoot}
              allMessages={allMessages}
              onOpenTextPreview={(name, content) => setTextPreviewMsg({ name, content })}
              onClose={() => setActiveThreadRootId(null)}
              runCode={sendHook.runCode}
              getFileIcon={sendHook.getFileIcon}
              formatFileSize={sendHook.formatFileSize}
              formatTime={sendHook.formatTime}
            />
          </div>
        </div>
      )}

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
        stopGeneration={sendHook.stopGeneration}
        handleKeyDown={sendHook.handleKeyDown}
        handlePaste={sendHook.handlePaste}
        onFileSelect={sendHook.onFileSelect}
        formatFileSize={sendHook.formatFileSize}
        getFileIcon={sendHook.getFileIcon}
        setIsCodeModalOpen={setIsCodeModalOpen}
        startCamera={startCamera}
      />

      <CodeRagModal
        isOpen={isCodeModalOpen}
        onClose={() => setIsCodeModalOpen(false)}
        onInject={sendHook.setCodeContext}
        initialData={sendHook.pendingCode}
      />

      <TextFilePreviewModal
        isOpen={!!textPreviewMsg}
        onClose={() => setTextPreviewMsg(null)}
        fileName={textPreviewMsg?.name || ''}
        content={textPreviewMsg?.content || ''}
      />

      {/* New thread indicator */}
      {isNewThread && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50">
          <div className="bg-amber-500 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <MessageSquare size={16} />
            <span className="text-sm font-medium">Start a new thread to begin discussing this topic</span>
            <button
              onClick={() => setIsNewThread(false)}
              className="p-1 hover:bg-white/20 rounded-full transition-colors cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

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