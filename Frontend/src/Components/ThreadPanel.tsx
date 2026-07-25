import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { X, MessageSquare, CornerDownRight, Send, Square, Cpu, ChevronLeft, ChevronRight } from 'lucide-react'
import { MessageBubble } from './MessageBubble'
import { useSendMessage } from './Hook/useSendMessage'
import { useChatStore } from '../Context/ChatContext'
import type { Message } from '../Context/ChatContext'
import { getThreadHeads, getThreadPath, getThreadLeafId } from '../utils/threadUtils'
import { ModelSelector } from './ModelSelector'

interface ThreadPanelProps {
  chatId: string
  rootMessage: Message
  threadHeadId: string | null
  threadIndex: number
  threadCount: number
  allMessages: Message[]
  onClose: () => void
  onNewThread: () => void
  onOpenThreadAtIndex: (index: number) => void
  onThreadHeadCreated: (headId: string) => void
  runCode: (code: string) => Promise<any>
  getFileIcon: (ext: string) => React.ReactNode
  formatFileSize: (size: number) => string
  formatTime: (date: string) => string
  onOpenTextPreview: (name: string, content: string) => void
}

export const ThreadPanel: React.FC<ThreadPanelProps> = ({
  chatId,
  rootMessage,
  threadHeadId,
  threadIndex,
  threadCount,
  allMessages,
  onClose,
  onNewThread,
  onOpenThreadAtIndex,
  onThreadHeadCreated,
  runCode,
  getFileIcon,
  formatFileSize,
  formatTime,
  onOpenTextPreview,
}) => {
  const { getBranchInfo, getMessages } = useChatStore()
  const threadHook = useSendMessage(chatId)

  const [input, setInput] = useState('')
  const [threadActiveNodeId, setThreadActiveNodeId] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState<string | null>(null)
  const [editingFiles, setEditingFiles] = useState<File[]>([])
  const [editingFileInputs, setEditingFileInputs] = useState<File[]>([])

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const isUserScrolledUpRef = useRef(false)

  const threadRootId = rootMessage._id

  const threadMessages = useMemo(() => {
    if (!threadHeadId) return []
    return getThreadPath(allMessages, threadHeadId, threadActiveNodeId)
  }, [allMessages, threadHeadId, threadActiveNodeId])

  useEffect(() => {
    if (!threadHeadId) {
      setThreadActiveNodeId(null)
      return
    }
    const leaf = getThreadLeafId(allMessages, threadHeadId, threadRootId)
    setThreadActiveNodeId(leaf)
  }, [threadHeadId, allMessages, threadRootId])

  const switchThreadBranch = useCallback((currentMsgId: string, direction: 'prev' | 'next') => {
    const msgs = allMessages
    const msg = msgs.find(m => m._id === currentMsgId)
    if (!msg) return

    const siblings = msgs.filter(m =>
      m.role === msg.role &&
      (m.parentId === msg.parentId || (!m.parentId && !msg.parentId)) &&
      String(m.threadRootId) === String(threadRootId)
    )
    if (siblings.length <= 1) return

    const currentIndex = siblings.findIndex(s => s._id === currentMsgId)
    let newIndex = direction === 'prev'
      ? (currentIndex > 0 ? currentIndex - 1 : siblings.length - 1)
      : (currentIndex < siblings.length - 1 ? currentIndex + 1 : 0)

    const targetSibling = siblings[newIndex]
    let currentId = targetSibling._id
    while (true) {
      const children = msgs.filter(m =>
        m.parentId === currentId && String(m.threadRootId) === String(threadRootId)
      )
      if (children.length === 0) break
      currentId = children[children.length - 1]._id
    }
    setThreadActiveNodeId(currentId)
  }, [allMessages, threadRootId])

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    isUserScrolledUpRef.current = !isAtBottom
  }

  useEffect(() => {
    if (!bottomRef.current) return
    if (threadHook.loading && !isUserScrolledUpRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [threadMessages.length, threadHook.loading])

  useEffect(() => {
    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'auto' })
    }, 50)
  }, [threadHeadId, rootMessage._id])

  useEffect(() => {
    if (!textareaRef.current) return
    textareaRef.current.style.height = 'auto'
    textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px'
  }, [input])

  const handleSend = useCallback(async () => {
    if (!input.trim() || threadHook.loading) return
    const textToSend = input.trim()
    setInput('')

    const lastThreadMsg =
      threadMessages.length > 0 ? threadMessages[threadMessages.length - 1] : rootMessage

    const wasNewThread = !threadHeadId

    await threadHook.sendMessage(
      textToSend,
      chatId,
      undefined,
      undefined,
      undefined,
      lastThreadMsg._id,
      threadRootId
    )

    if (wasNewThread) {
      const heads = getThreadHeads(getMessages(chatId), threadRootId)
      const newest = heads[heads.length - 1]
      if (newest) onThreadHeadCreated(newest._id)
    }
  }, [input, threadMessages, rootMessage, chatId, threadHook, threadHeadId, threadRootId, getMessages, onThreadHeadCreated])

  // After send completes, pick up newly created thread head — removed; handled in handleSend

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const startEditing = (msgId: string) => {
    const msg = threadMessages.find(m => m._id === msgId)
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
    const msg = allMessages.find(m => m._id === msgId)
    if (!msg) return
    cancelEditing()

    await threadHook.sendMessage(
      newContent,
      chatId,
      undefined,
      undefined,
      undefined,
      msg.parentId || undefined,
      threadRootId
    )
  }

  const handleEditFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setEditingFileInputs([e.target.files[0]])
      setEditingFiles([])
    }
  }

  const removeEditFile = () => {
    setEditingFileInputs([])
    setEditingFiles([])
  }

  const lastMsg = threadMessages[threadMessages.length - 1]
  const isStreaming = lastMsg?.role === 'assistant' && lastMsg?.content?.length > 0
  const showTypingIndicator = threadHook.loading && !isStreaming

  const navigateThread = (dir: 'prev' | 'next') => {
    if (threadCount === 0) return
    const newIndex = dir === 'prev'
      ? (threadIndex > 0 ? threadIndex - 1 : threadCount - 1)
      : (threadIndex < threadCount - 1 ? threadIndex + 1 : 0)
    onOpenThreadAtIndex(newIndex)
  }

  return (
    <div
      className="flex flex-col h-full w-full sm:w-[320px] md:w-[380px] lg:w-[440px] shrink-0 shadow-2xl z-30"
      style={{
        backgroundColor: 'var(--bg-sidebar)',
        borderLeft: '1.5px solid var(--border-medium)'
      }}
    >
      {/* Thread Header */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{
          borderBottom: '1.5px solid var(--border-medium)',
          backgroundColor: 'var(--bg-navbar)'
        }}
      >
        <div className="flex items-center gap-2">
          <MessageSquare size={15} className="text-amber-500" />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Thread</h3>
          {threadCount > 0 && (
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => navigateThread('prev')}
                className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                title="Previous thread"
              >
                <ChevronLeft size={14} />
              </button>
              <span
                className="text-[11px] px-1.5 py-0.5 rounded-full font-mono min-w-[40px] text-center"
                style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--border-light)' }}
              >
                {threadIndex + 1}/{threadCount}
              </span>
              <button
                onClick={() => navigateThread('next')}
                className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                title="Next thread"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onNewThread}
            className="p-1.5 rounded-lg transition-colors cursor-pointer text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/30"
            title="New thread"
          >
            <span className="text-lg leading-none font-light">+</span>
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors cursor-pointer"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--border-light)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
            title="Close Thread"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Thread Content */}
      <div
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-5 min-h-0"
      >
        {/* Root Message Anchor */}
        <div
          className="p-3 rounded-xl"
          style={{
            backgroundColor: 'var(--border-light)',
            border: '1px solid var(--border-medium)'
          }}
        >
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400 mb-1.5">
            <CornerDownRight size={12} />
            <span>Original message</span>
          </div>
          <p className="text-xs line-clamp-4 leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
            {rootMessage.content}
          </p>
          <span className="text-[10px] mt-1.5 block" style={{ color: 'var(--text-secondary)' }}>
            {formatTime(rootMessage.createdAt)}
          </span>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center"><div className="w-full h-px" style={{ backgroundColor: 'var(--border-medium)' }} /></div>
          <div className="relative flex justify-center">
            <span className="px-2 text-[10px]" style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-sidebar)' }}>replies</span>
          </div>
        </div>

        {/* Thread Messages */}
        {threadMessages.length === 0 && !threadHook.loading ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
              <MessageSquare size={18} className="text-blue-400" />
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              No replies yet. Start the thread below!
            </p>
          </div>
        ) : (
          threadMessages.map((msg) => {
            const isUserMessage = msg.role === 'user'
            const isCurrentMsgEditing = isEditing === msg._id
            const branchInfo = isCurrentMsgEditing
              ? undefined
              : getBranchInfo(chatId, msg._id, threadRootId)

            return (
              <MessageBubble
                key={msg._id}
                msg={{ ...msg, isUser: isUserMessage }}
                isUser={isUserMessage}
                runCode={runCode}
                getFileIcon={getFileIcon}
                formatFileSize={formatFileSize}
                formatTime={formatTime}
                onOpenTextPreview={onOpenTextPreview}
                isEditing={isCurrentMsgEditing}
                onEditStart={() => isUserMessage && startEditing(msg._id)}
                onCancelEdit={cancelEditing}
                onSaveEdit={saveAndSubmit}
                branchInfo={branchInfo}
                onBranchChange={(dir) => switchThreadBranch(msg._id, dir)}
                editingFiles={editingFiles}
                editingFileInputs={editingFileInputs}
                onEditFileSelect={handleEditFileSelect}
                onRemoveEditFile={removeEditFile}
                onCopy={(text) => navigator.clipboard.writeText(text)}
              />
            )
          })
        )}

        {showTypingIndicator && (
          <div className="flex items-end gap-2.5 animate-in fade-in duration-200">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white text-xs shrink-0 mb-0.5 shadow-sm">✦</div>
            <div
              className="px-4 py-3 rounded-2xl rounded-bl-sm shadow-sm max-w-[80%]"
              style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-light)' }}
            >
              {threadHook.activeTool ? (
                <div className="flex items-center gap-2 text-xs font-medium text-amber-600 dark:text-amber-400">
                  <Cpu size={12} className="animate-pulse text-amber-500" />
                  <span>Using <span className="font-mono">{threadHook.activeTool}</span>…</span>
                </div>
              ) : (
                <div className="flex gap-1 items-center py-0.5 px-1">
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

      {/* Thread Input */}
      <div
        className="px-3 pt-2 pb-3 shrink-0"
        style={{
          borderTop: '1.5px solid var(--border-medium)',
          backgroundColor: 'var(--bg-navbar)'
        }}
      >
        {threadHook.errorMessage && (
          <div className="mb-2 flex items-center gap-2 text-xs text-rose-500 bg-rose-50 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-800/30 px-3 py-2 rounded-xl">
            <span className="flex-1 line-clamp-2">{threadHook.errorMessage}</span>
            <button onClick={threadHook.clearError} className="shrink-0 cursor-pointer"><X size={13} /></button>
          </div>
        )}
        <div
          className="flex items-end gap-2 rounded-2xl px-3 py-2 focus-within:ring-1 focus-within:ring-amber-400/30 transition-colors"
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1.5px solid var(--border-medium)'
          }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={threadHook.loading}
            placeholder="Reply in thread…"
            rows={1}
            className="flex-1 bg-transparent resize-none outline-none text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 leading-relaxed py-0.5 min-h-[22px] max-h-[120px] overflow-y-auto"
          />
          <div className="flex items-center gap-1.5 shrink-0 mb-0.5">
            <ModelSelector
              value={threadHook.selectedModel || 'small'}
              onChange={threadHook.setSelectedModel}
              disabled={threadHook.loading}
              size="compact"
            />
            {threadHook.loading ? (
              <button
                onClick={threadHook.stopGeneration}
                className="shrink-0 p-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 transition-colors cursor-pointer"
                title="Stop generation"
              >
                <Square size={14} />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="shrink-0 p-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors cursor-pointer"
                title="Send reply"
              >
                <Send size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
