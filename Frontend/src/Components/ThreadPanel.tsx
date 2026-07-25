import React, { useState, useRef, useEffect, useCallback } from 'react'
import { X, MessageSquare, CornerDownRight, Send, Square, Cpu } from 'lucide-react'
import { MessageBubble } from './MessageBubble'
import { useSendMessage } from './Hook/useSendMessage'
import { useChatStore } from '../Context/ChatContext'
import type { Message } from '../Context/ChatContext'

interface ThreadPanelProps {
  chatId: string
  rootMessage: Message
  allMessages: Message[]
  onClose: () => void
  runCode: (code: string) => Promise<any>
  getFileIcon: (ext: string) => React.ReactNode
  formatFileSize: (size: number) => string
  formatTime: (date: string) => string
  onOpenTextPreview: (name: string, content: string) => void
}

export const ThreadPanel: React.FC<ThreadPanelProps> = ({
  chatId,
  rootMessage,
  allMessages,
  onClose,
  runCode,
  getFileIcon,
  formatFileSize,
  formatTime,
  onOpenTextPreview,
}) => {
  const { getBranchInfo, switchBranch } = useChatStore()
  const threadHook = useSendMessage(chatId)

  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const isUserScrolledUpRef = useRef(false)

  // Messages in this thread: messages that have threadRootId matching rootMessage._id
  const threadMessages = allMessages.filter((m) => m.threadRootId === rootMessage._id)

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

  // Scroll to bottom when thread first opens
  useEffect(() => {
    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'auto' })
    }, 50)
  }, [rootMessage._id])

  // Auto-resize textarea
  useEffect(() => {
    if (!textareaRef.current) return
    textareaRef.current.style.height = 'auto'
    textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px'
  }, [input])

  const handleSend = useCallback(async () => {
    if (!input.trim() || threadHook.loading) return
    const textToSend = input.trim()
    setInput('')

    // Last message in thread or rootMessage if thread empty
    const lastThreadMsg =
      threadMessages.length > 0 ? threadMessages[threadMessages.length - 1] : rootMessage

    await threadHook.sendMessage(
      textToSend,
      chatId,
      undefined,
      undefined,
      undefined,
      lastThreadMsg._id,
      rootMessage._id
    )
  }, [input, threadMessages, rootMessage, chatId, threadHook])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const lastMsg = threadMessages[threadMessages.length - 1]
  const isStreaming = lastMsg?.role === 'assistant' && lastMsg?.content?.length > 0
  const showTypingIndicator = threadHook.loading && !isStreaming

  return (
    <div
      className="flex flex-col h-full w-full sm:w-96 md:w-[420px] shrink-0 shadow-2xl z-30"
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
          {threadMessages.length > 0 && (
            <span
              className="text-[11px] px-1.5 py-0.5 rounded-full font-mono"
              style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--border-light)' }}
            >
              {threadMessages.length} {threadMessages.length === 1 ? 'reply' : 'replies'}
            </span>
          )}
        </div>
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

      {/* Thread Content */}
      <div
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-4"
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
            const branchInfo = getBranchInfo(chatId, msg._id)
            return (
              <MessageBubble
                key={msg._id}
                msg={{ ...msg, isUser: msg.role === 'user' }}
                runCode={runCode}
                getFileIcon={getFileIcon}
                formatFileSize={formatFileSize}
                formatTime={formatTime}
                onOpenTextPreview={onOpenTextPreview}
                branchInfo={branchInfo}
                onBranchChange={(dir) => switchBranch(chatId, msg._id, dir)}
                selectedModel={threadHook.selectedModel}
                setSelectedModel={threadHook.setSelectedModel}
                onCopy={(text) => navigator.clipboard.writeText(text)}
              />
            )
          })
        )}

        {/* Typing indicator */}
        {showTypingIndicator && (
          <div className="flex items-end gap-2.5 animate-in fade-in duration-200">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-[10px] shrink-0 mb-0.5">✦</div>
            <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 px-3 py-2.5 rounded-2xl rounded-bl-sm shadow-xs">
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
          {threadHook.loading ? (
            <button
              onClick={threadHook.stopGeneration}
              className="shrink-0 p-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 transition-colors cursor-pointer mb-0.5"
              title="Stop generation"
            >
              <Square size={14} />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="shrink-0 p-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors cursor-pointer mb-0.5"
              title="Send reply"
            >
              <Send size={14} />
            </button>
          )}
        </div>
        <div className="flex items-center justify-between mt-1.5 px-1">
          <span className="text-[10px] text-gray-400">
            Model: <span className="font-medium capitalize">{threadHook.selectedModel}</span>
          </span>
          <span className="text-[10px] text-gray-400">Enter to send · Shift+Enter for newline</span>
        </div>
      </div>
    </div>
  )
}
