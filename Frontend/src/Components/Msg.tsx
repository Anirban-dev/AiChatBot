import { useRef, useEffect, useState, useMemo, useCallback } from 'react'
import { Cpu, Loader2, Camera, X, Info } from 'lucide-react'
import { getMsgs } from '../API/Msg'
import api from '../Auth/AxiosHelper'
import { useSendMessage } from './Hook/useSendMessage'
import { useChatStore } from '../Context/ChatContext'
import { CodeRagModal } from './CodeRag'
import { MsgChatInput } from './MsgChatInput'
import { TextFilePreviewModal } from './TextFilePreviewModal'
import { MessageBubble } from './MessageBubble'
import { ThreadPanel } from './ThreadPanel'
import { getThreadHeads } from '../utils/threadUtils'

export const Msg = ({ chatId }: { chatId?: string }) => {
  const activeChatId = chatId || 'new'
  const {
    getMessages, setMessages, getBranchInfo, getActivePath, activeNodeId, switchBranch,
    setActiveNodeId, pendingActiveMsgId, clearPendingActiveMsgId
  } = useChatStore()

  const sendHook = useSendMessage(activeChatId, true)
  const activeNode = activeNodeId(activeChatId)
  const messages = getActivePath(activeChatId, activeNode || '')
  const allMessages = getMessages(activeChatId)

  const [activeThreadRootId, setActiveThreadRootId] = useState<string | null>(null)
  const [activeThreadHeadId, setActiveThreadHeadId] = useState<string | null>(null)
  const [isComposingNewThread, setIsComposingNewThread] = useState(false)
  const [threadBrowseIndex, setThreadBrowseIndex] = useState<Record<string, number>>({})
  const [apiConfigured, setApiConfigured] = useState<boolean | null>(null)

  // Probe whether the admin has enabled any AI provider so we can show an
  // actionable notice instead of a cryptic error when the user first sends.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await api.get('/config-status')
        if (!cancelled) setApiConfigured(res.data?.configured ?? true)
      } catch {
        if (!cancelled) setApiConfigured(null) // unknown → don't block the UI
      }
    })()
    return () => { cancelled = true }
  }, [])
  
  // Build thread count map: anchorMessageId -> number of threads
  const threadCountMap = useMemo(() => {
    const map: Record<string, number> = {}
    const anchors = new Set<string>()
    allMessages.forEach((m) => {
      if (m.threadRootId) anchors.add(m.threadRootId)
    })
    anchors.forEach((anchorId) => {
      map[anchorId] = getThreadHeads(allMessages, anchorId).length
    })
    return map
  }, [allMessages])

  const activeThreadRoot = activeThreadRootId
    ? allMessages.find((m) => m._id === activeThreadRootId) ?? null
    : null

  // Main-timeline active path messages (only messages without threadRootId)
  const mainMessages = useMemo(
    () => messages.filter((m) => !m.threadRootId),
    [messages]
  )

  const getThreadIndexForAnchor = useCallback((anchorId: string) => {
    const count = threadCountMap[anchorId] || 0
    if (count === 0) return 0
    const stored = threadBrowseIndex[anchorId] ?? 0
    return Math.min(stored, count - 1)
  }, [threadCountMap, threadBrowseIndex])

  const openThreadAtIndex = useCallback((anchorId: string, index: number) => {
    const heads = getThreadHeads(allMessages, anchorId)
    setIsComposingNewThread(false)
    setActiveThreadRootId(anchorId)
    setThreadBrowseIndex(prev => ({ ...prev, [anchorId]: index }))
    setActiveThreadHeadId(heads[index] ? heads[index]._id : null)
  }, [allMessages])

  const handleOpenExistingThread = (msgId: string) => {
    const index = getThreadIndexForAnchor(msgId)
    openThreadAtIndex(msgId, index)
  }

  const handleComposeConsumed = useCallback(() => setIsComposingNewThread(false), [])

  const handleStartNewThread = (msgId: string) => {
  setIsComposingNewThread(true)
  setActiveThreadRootId(msgId)
  setActiveThreadHeadId(null)
  if (activeThreadRootId === msgId) {
    setThreadBrowseIndex(prev => ({ ...prev, [msgId]: threadCountMap[msgId] || 0 }))
  }
}

  const handleThreadNavigate = (msgId: string, direction: 'prev' | 'next') => {
    const count = threadCountMap[msgId] || 0
    if (count === 0) return
    const current = getThreadIndexForAnchor(msgId)
    const newIndex = direction === 'prev'
      ? (current > 0 ? current - 1 : count - 1)
      : (current < count - 1 ? current + 1 : 0)
    setThreadBrowseIndex(prev => ({ ...prev, [msgId]: newIndex }))
    if (activeThreadRootId === msgId) {
      const heads = getThreadHeads(allMessages, msgId)
      setActiveThreadHeadId(heads[newIndex]?._id ?? null)
    }
  }

  const handleThreadHeadCreated = useCallback((headId: string) => {
    setActiveThreadHeadId(headId)
    if (activeThreadRootId) {
      const heads = getThreadHeads(allMessages, activeThreadRootId)
      const idx = heads.findIndex(h => h._id === headId)
      if (idx >= 0) {
        setThreadBrowseIndex(prev => ({ ...prev, [activeThreadRootId]: idx }))
      }
    }
  }, [activeThreadRootId, allMessages])

  // Close thread when chat changes
  useEffect(() => {
    setActiveThreadRootId(null)
    setActiveThreadHeadId(null)
  }, [activeChatId])

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

        await sendHook.branchMessage(msgId, newContent, activeChatId, uploadedFileInfo, uploadedFileContent)
      } else if (editingFiles.length > 0 && (editingFiles[0] as any).isExisting) {
        const existing = editingFiles[0]
        await sendHook.branchMessage(
          msgId,
          newContent,
          activeChatId,
          {
            name: existing.name,
            size: existing.size,
            mimeType: (existing as any).mimeType,
            extension: (existing as any).extension
          },
          (existing as any).file,
        )
      } else {
        await sendHook.branchMessage(msgId, newContent, activeChatId)
      }
    } catch (error) {
      console.error('Failed to create message branch:', error)
      alert(error instanceof Error ? error.message : 'Failed to create branch. Please try again.')
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
  const isMainLoading = sendHook.loading && !allMessages.some(m => m.threadRootId && m._id === allMessages[allMessages.length - 1]?._id)
  const showTypingIndicator = (isMainLoading || sendHook.uploading) && !isStreaming

  return (
    <div className="flex h-full relative overflow-hidden" style={{ backgroundColor: 'var(--bg-chat)' }}>
      {/* Main chat column */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <div id="active-chat-stream" onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-5 min-h-0">
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
              msg={{ ...msg, isUser: isUserMessage }}
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
              isActiveThread={activeThreadRootId === msg._id}
              threadCount={threadCountMap[msg._id] || 0}
              threadIndex={getThreadIndexForAnchor(msg._id)}
              onThreadNavigate={(dir) => handleThreadNavigate(msg._id, dir)}
              onOpenNewThread={handleStartNewThread}
              onOpenExistingThread={handleOpenExistingThread}
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

        {/* Proactive notice: no AI provider configured */}
        {apiConfigured === false && (
          <div className="mb-3 flex items-start gap-2.5 p-3.5 rounded-xl border border-amber-200 bg-amber-50/70 dark:bg-amber-950/20 dark:border-amber-800/40 text-amber-800 dark:text-amber-300">
            <Info size={16} className="mt-0.5 shrink-0 text-amber-500" />
            <p className="text-xs leading-relaxed">
              AI APIs have not been configured yet. Ask your administrator to add provider API keys in
              <span className="font-semibold"> Admin → AI APIs</span>. You won't be able to get responses until one is set up.
            </p>
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
          handleTextPaste={sendHook.handleTextPaste}
          handleDragOver={sendHook.handleDragOver}
          handleDragLeave={sendHook.handleDragLeave}
          handleDrop={sendHook.handleDrop}
          onFileSelect={sendHook.onFileSelect}
          formatFileSize={sendHook.formatFileSize}
          getFileIcon={sendHook.getFileIcon}
          setIsCodeModalOpen={setIsCodeModalOpen}
          startCamera={startCamera}
          tokenCount={sendHook.countTokens(sendHook.input)}
        />
      </div>

      {/* Thread Panel - desktop: full height beside main column */}
      {activeThreadRoot && (
        <div className="hidden md:flex h-full transition-all duration-200">
          <ThreadPanel
            chatId={activeChatId}
            rootMessage={activeThreadRoot}
            threadHeadId={activeThreadHeadId}
            threadIndex={getThreadIndexForAnchor(activeThreadRoot._id)}
            threadCount={threadCountMap[activeThreadRoot._id] || 0}
            allMessages={allMessages}
            onOpenTextPreview={(name, content) => setTextPreviewMsg({ name, content })}
            onClose={() => { setActiveThreadRootId(null); setActiveThreadHeadId(null) }}
            onNewThread={() => handleStartNewThread(activeThreadRoot._id)}
            onOpenThreadAtIndex={(index) => openThreadAtIndex(activeThreadRoot._id, index)}
            onThreadHeadCreated={handleThreadHeadCreated}
            runCode={sendHook.runCode}
            getFileIcon={sendHook.getFileIcon}
            formatFileSize={sendHook.formatFileSize}
            formatTime={sendHook.formatTime}
            isComposingNewThread={isComposingNewThread}
            onComposeConsumed={handleComposeConsumed}
          />
        </div>
      )}

      {/* Thread Panel - mobile slide-over (full screen height) */}
      {activeThreadRoot && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="flex-1 bg-black/40" onClick={() => { setActiveThreadRootId(null); setActiveThreadHeadId(null) }} />
          <div className="w-[90vw] max-w-sm h-full flex shadow-2xl animate-in slide-in-from-right duration-200">
            <ThreadPanel
              chatId={activeChatId}
              rootMessage={activeThreadRoot}
              threadHeadId={activeThreadHeadId}
              threadIndex={getThreadIndexForAnchor(activeThreadRoot._id)}
              threadCount={threadCountMap[activeThreadRoot._id] || 0}
              allMessages={allMessages}
              onOpenTextPreview={(name, content) => setTextPreviewMsg({ name, content })}
              onClose={() => { setActiveThreadRootId(null); setActiveThreadHeadId(null) }}
              onNewThread={() => handleStartNewThread(activeThreadRoot._id)}
              onOpenThreadAtIndex={(index) => openThreadAtIndex(activeThreadRoot._id, index)}
              onThreadHeadCreated={handleThreadHeadCreated}
              runCode={sendHook.runCode}
              getFileIcon={sendHook.getFileIcon}
              formatFileSize={sendHook.formatFileSize}
              formatTime={sendHook.formatTime}
              isComposingNewThread={isComposingNewThread}
              onComposeConsumed={handleComposeConsumed}
            />
          </div>
        </div>
      )}

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
