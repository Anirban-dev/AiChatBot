import { X, Paperclip, Send, Edit2, Copy, ChevronLeft, ChevronRight, MessageSquare, Plus, GitBranch, AlertTriangle, RotateCw } from 'lucide-react'
import MarkdownRenderer from './BashComponent'
import { useState, useEffect, useRef } from 'react'

export interface FileInfo {
  name: string
  size: number
  mimeType?: string
  extension: string
}

export interface ToolCall {
  id: string
  name: string
  status: 'running' | 'completed' | 'failed'
  result?: string
  error?: string
}

export interface MessageLike {
  _id: string
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  fileInfo?: FileInfo
  file?: string
  toolCalls?: ToolCall[]
  createdAt: string
  parentId?: string | null
  threadRootId?: string | null
  threadHeadId?: string | null
  threadReplyCount?: number
  isUser?: boolean
  isEdited?: boolean
  failed?: boolean
}

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff'])
const TEXT_EXTS = new Set(['.txt', '.md', '.json', '.js', '.ts', '.py', '.cpp', '.c', '.h', '.html', '.css', '.csv'])

const bubbleBase = 'px-4 py-2.5 text-sm leading-relaxed rounded-2xl shadow-sm max-w-full break-words [overflow-wrap:anywhere]'
const userBubble = `${bubbleBase} bg-blue-600 text-white rounded-br-sm`
const assistantBubble = `${bubbleBase} rounded-bl-sm`

// ─── Tool call pills ───────────────────────────────────────────────────────
const ToolCallList = ({ toolCalls, isVectorDbTool }: { toolCalls: ToolCall[], isVectorDbTool?: boolean }) => (
  <div className="flex flex-wrap gap-1.5 w-full mb-1">
    {toolCalls.map((tc) => {
      const isRunning = tc.status === 'running'
      const isCompleted = tc.status === 'completed'
      const isFailed = tc.status === 'failed'
      const isVectorDb = tc.name === 'vector_db_search'

      return (
        <div
          key={tc.id}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-all duration-200 ${
            isRunning
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
              : isCompleted
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
          } ${isVectorDb ? 'border-violet-500/40 bg-violet-500/5 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400' : ''}`}
          title={tc.error || tc.result || tc.name}
        >
          {isRunning && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
          )}
          {isCompleted && (
            <span className="inline-flex items-center justify-center h-2 w-2 rounded-full bg-emerald-500 text-white">
              <svg className="w-1.5 h-1.5 stroke-[3]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </span>
          )}
          {isFailed && (
            <span className="inline-flex items-center justify-center h-2 w-2 rounded-full bg-rose-500 text-white">
              <svg className="w-1.5 h-1.5 stroke-[3]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </span>
          )}
          <span className="font-mono text-[11px] font-semibold flex items-center gap-1">
            {isVectorDb && <span className="text-xs">📊</span>}
            {tc.name}
          </span>
        </div>
      )
    })}
  </div>
)

// ─── Reasoning / "thought process" collapsible ─────────────────────────────
const ReasoningBlock = ({ reasoning }: { reasoning: string }) => (
  <details className="w-fit max-w-full group/think border border-gray-200/60 dark:border-gray-700/60 rounded-xl bg-gray-50/50 dark:bg-gray-800/10 mb-1.5 overflow-hidden transition-all duration-200">
    <summary className="inline-flex items-center gap-1.5 px-2.5 py-1 cursor-pointer select-none text-xs font-semibold text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 list-none">
      <span className="text-violet-500 animate-pulse">🧠</span>
      <span>Thought process</span>
    </summary>
    <div className="px-3 pb-2.5 pt-1 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-150 dark:border-gray-700/40 font-serif leading-relaxed whitespace-pre-wrap">
      {reasoning}
    </div>
  </details>
)

// ─── Text-file attachment (code-block style card) ──────────────────────────
const TextFileAttachmentCard = ({
  file,
  onOpen,
}: {
  fileInfo: FileInfo
  file?: string
  onOpen: () => void
}) => {
  const preview = (file || '').split('\n').slice(0, 4).join('\n')

  return (
    <div
      onClick={onOpen}
      className="flex flex-col w-64 rounded-xl border border-gray-800 bg-gray-950 overflow-hidden relative group cursor-pointer transition-all select-none hover:border-gray-600 shadow-md"
      title="Click to preview file contents"
    >

      <div className="p-2.5 font-mono text-[10px] leading-relaxed max-h-20 overflow-hidden relative text-gray-400">
        <pre className="whitespace-pre-wrap truncate-lines">
          {preview || 'Empty file'}
        </pre>
        <div className="absolute bottom-0 left-0 right-0 h-4 pointer-events-none bg-linear-to-t from-gray-950 to-transparent" />
      </div>
    </div>
  )
}

// ─── Generic file attachment (image / doc / etc.) ──────────────────────────
const FileAttachmentPreview = ({
  fileInfo,
  file,
  getFileIcon,
  formatFileSize,
}: {
  fileInfo: FileInfo
  file?: string
  getFileIcon: (ext: string) => React.ReactNode
  formatFileSize: (size: number) => string
}) => {
  const ext = fileInfo.extension?.toLowerCase() || ''
  const isImage = IMAGE_EXTS.has(ext) && !!file && file.startsWith('data:')

  // For images, only render the image without metadata blocks
  if (isImage) {
    return (
      <img
        src={file}
        alt={fileInfo.name}
        className="rounded-xl max-h-48 max-w-64 w-auto object-contain border border-gray-200/60 dark:border-gray-700/40 shadow-sm"
      />
    )
  }

  // For generic files, apply fixed width and standard metadata
  return (
    <div className="flex flex-col gap-2 w-64">
      <div className={`flex items-center gap-3 p-2.5 rounded-xl bg-black/30`}>
        <div className="p-2 bg-white dark:bg-gray-900 rounded-lg shadow-sm shrink-0">
          {getFileIcon(ext)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm line-clamp-2 break-all">{fileInfo.name}</p>
          <p className="text-xs opacity-60 mt-0.5">
            {formatFileSize(fileInfo.size)} · {ext.toUpperCase().replace('.', '')}
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── The bubble itself ──────────────────────────────────────────────────────
interface MessageBubbleProps {
  msg: MessageLike & { threadRootId?: string | null }
  runCode: (code: string) => Promise<any>
  getFileIcon: (ext: string) => React.ReactNode
  formatFileSize: (size: number) => string
  formatTime: (date: string) => string
  onOpenTextPreview: (name: string, content: string) => void
  isEditing?: boolean
  isUser?: boolean
  onEditStart?: () => void
  onCancelEdit?: () => void
  onSaveEdit?: (content: string) => void
  branchInfo?: { branchCount: number; currentIndex: number }
  onBranchChange?: (direction: 'prev' | 'next') => void
  editingFiles?: File[]
  editingFileInputs?: File[]
  onEditFileSelect?: (e: React.ChangeEvent<HTMLInputElement>) => void
  onRemoveEditFile?: (index: number) => void
  onCopy?: (content: string) => void
  threadCount?: number
  threadIndex?: number
  onThreadNavigate?: (direction: 'prev' | 'next') => void
  onOpenNewThread?: (msgId: string) => void
  onOpenExistingThread?: (msgId: string) => void
  isActiveThread?: boolean
  onRetryFailed?: (msg: MessageLike) => void
}

export const MessageBubble = ({
  msg,
  runCode,
  getFileIcon,
  formatFileSize,
  formatTime,
  onOpenTextPreview,
  isEditing = false,
  onEditStart,
  onCancelEdit,
  onSaveEdit,
  branchInfo,
  onBranchChange,
  editingFiles = [],
  editingFileInputs = [],
  onEditFileSelect,
  onRemoveEditFile,
  onCopy,
  threadCount = 0,
  onThreadNavigate,
  onOpenNewThread,
  onOpenExistingThread,
  isActiveThread = false,
  isUser = false,
  onRetryFailed,
}: MessageBubbleProps) => {
  const fileInfo = msg.fileInfo
  const ext = fileInfo?.extension?.toLowerCase() || ''
  const isTextFile = !!fileInfo && TEXT_EXTS.has(ext)
  const [copied, setCopied] = useState(false)
  const [editText, setEditText] = useState(msg.content)
  const editFileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setEditText(msg.content)
  }, [msg.content, isEditing])

  if (isEditing) {
    return (
      <div className={`flex items-end gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 mb-0.5 shadow-xs ${isUser ? 'bg-linear-to-br from-blue-500 to-indigo-600 text-white' : 'bg-linear-to-br from-violet-500 to-purple-600 text-white'
          }`}>
          {isUser ? 'A' : '✦'}
        </div>

        <div className={`flex flex-col gap-2 max-w-[80%] ${isUser ? 'items-end' : 'items-start'}`}>
          <div className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-3 shadow-sm w-full`}>
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="w-full bg-transparent resize-none outline-none text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 max-h-40 py-0.5 leading-relaxed"
              rows={3}
              placeholder="Edit your message..."
            />

            {(editingFileInputs.length > 0 || editingFiles.length > 0) && (
              <div className="flex flex-wrap gap-3 mt-3 mb-1">
                {/* Newly selected file */}
                {editingFileInputs.map((file, index) => {
                  const isImage = file.type.startsWith('image/');
                  const previewUrl = isImage ? URL.createObjectURL(file) : '';
                  return (
                    <div
                      key={`new-${index}`}
                      className="flex items-center gap-3 p-2 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700/60 w-fit relative group animate-in fade-in slide-in-from-bottom-2 duration-150"
                    >
                      <div className="relative h-12 w-12 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 shrink-0 shadow-xs">
                        {isImage ? (
                          <img src={previewUrl} alt="Preview" className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center bg-white dark:bg-gray-900">
                            {getFileIcon('.' + (file.name.split('.').pop() || ''))}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col pr-6 max-w-40 sm:max-w-xs">
                        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate">{file.name}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5 font-medium">{formatFileSize(file.size)}</p>
                      </div>
                      <button
                        onClick={() => onRemoveEditFile?.(index)}
                        className="absolute -top-1.5 -right-1.5 p-1 bg-gray-200 dark:bg-gray-700 hover:bg-red-500 hover:text-white dark:hover:bg-red-600 rounded-full text-gray-500 dark:text-gray-400 transition-colors shadow-xs cursor-pointer"
                        title="Remove attachment"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  );
                })}

                {/* Retained existing file */}
                {editingFiles.map((file, index) => {
                  const fileExt = file.name.split('.').pop()?.toLowerCase() || '';
                  const isImage = IMAGE_EXTS.has('.' + fileExt) && !!(file as any).file;
                  return (
                    <div
                      key={`existing-${index}`}
                      className="flex items-center gap-3 p-2 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700/60 w-fit relative group animate-in fade-in slide-in-from-bottom-2 duration-150"
                    >
                      <div className="relative h-12 w-12 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 shrink-0 shadow-xs">
                        {isImage ? (
                          <img src={(file as any).file} alt="Existing Preview" className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center bg-white dark:bg-gray-900">
                            {getFileIcon('.' + fileExt)}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col pr-6 max-w-40 sm:max-w-xs">
                        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate">{file.name}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5 font-medium">{formatFileSize(file.size)}</p>
                      </div>
                      <button
                        onClick={() => onRemoveEditFile?.(index)}
                        className="absolute -top-1.5 -right-1.5 p-1 bg-gray-200 dark:bg-gray-700 hover:bg-red-500 hover:text-white dark:hover:bg-red-600 rounded-full text-gray-500 dark:text-gray-400 transition-colors shadow-xs cursor-pointer"
                        title="Remove attachment"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-between gap-2 mt-3 pt-2 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  ref={editFileInputRef}
                  onChange={onEditFileSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => editFileInputRef.current?.click()}
                  className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-lg transition-colors cursor-pointer"
                  title="Attach file/image"
                >
                  <Paperclip size={15} />
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={onCancelEdit}
                  className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-lg transition-colors cursor-pointer"
                  title="Cancel edit"
                >
                  <X size={15} />
                </button>
                <button
                  onClick={() => onSaveEdit?.(editText)}
                  className="p-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors cursor-pointer"
                  title="Send edited message"
                >
                  <Send size={15} />
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 px-1">
            <span className="text-[10px] text-gray-400 dark:text-gray-500">{formatTime(msg.createdAt)}</span>
            {branchInfo && branchInfo.branchCount > 1 && (
              <span className="text-[10px] text-gray-400 dark:text-gray-500">
                ({branchInfo.currentIndex} of {branchInfo.branchCount})
              </span>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`relative flex items-end gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Thread connector line on main timeline */}
      {isActiveThread && (
        <div
          className="absolute right-0 top-0 bottom-0 w-1 rounded-full bg-amber-400/80 dark:bg-amber-500/70 -mr-1 z-10"
          style={{ boxShadow: '0 0 8px rgba(251, 191, 36, 0.5)' }}
          title="Thread open"
        />
      )}
      {isActiveThread && (
        <div className="absolute -right-2 top-1/2 -translate-y-1/2 hidden md:flex items-center z-10">
          <div className="w-3 h-px bg-amber-400/70" />
          <MessageSquare size={12} className="text-amber-500 ml-0.5" />
        </div>
      )}
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 mb-0.5 shadow-xs ${isUser ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white' : 'bg-gradient-to-br from-amber-500 to-orange-600 text-white'
        }`}>
        {isUser ? 'A' : '✦'}
      </div>

      <div className={`flex flex-col gap-1 max-w-[80%] ${isUser ? 'items-end' : 'items-start'}`}>
        {msg.role === 'assistant' && !!msg.toolCalls?.length && (
          <ToolCallList toolCalls={msg.toolCalls} isVectorDbTool={msg.toolCalls.some(tc => tc.name === 'vector_db_search')} />
        )}

        {msg.role === 'assistant' && msg.reasoning && (
          <ReasoningBlock reasoning={msg.reasoning} />
        )}

        {isTextFile && fileInfo ? (
          <div
            className={`${isUser ? userBubble : assistantBubble} relative group`}
            style={!isUser ? { backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' } : undefined}
          >
            <div className="flex flex-col gap-2">
              <TextFileAttachmentCard
                fileInfo={fileInfo}
                file={msg.file}
                onOpen={() => onOpenTextPreview(fileInfo.name, msg.file || '')}
              />
              {msg.content && (
                <div className={`pt-2 border-t ${isUser ? 'border-white/20' : 'border-gray-100 dark:border-gray-700/60'}`}>
                  <MarkdownRenderer content={msg.content} isUser={isUser} runCode={runCode} />
                </div>
              )}
            </div>
          </div>
        ) : (
          <div
            className={`${isUser ? userBubble : assistantBubble} relative group`}
            style={!isUser ? { backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' } : undefined}
          >
            {fileInfo ? (
              <div className="flex flex-col gap-2">
                <FileAttachmentPreview
                  fileInfo={fileInfo}
                  file={msg.file}
                  getFileIcon={getFileIcon}
                  formatFileSize={formatFileSize}
                />
                {msg.content && (
                  <div className="border-t border-white/20 dark:border-gray-700/60 pt-2 mt-1">
                    <MarkdownRenderer content={msg.content} isUser={isUser} runCode={runCode} />
                  </div>
                )}
              </div>
            ) : (
              <MarkdownRenderer content={msg.content} isUser={isUser} runCode={runCode} />
            )}
          </div>
        )}

        <div className="flex items-center gap-3 px-1 mt-0 text-[11px] text-gray-400 dark:text-gray-500 select-none">
          <span>{formatTime(msg.createdAt)}</span>
          {msg.isEdited && (
            <span>(edited)</span>
          )}
          {isUser && msg.failed && onRetryFailed && (
            <button
              onClick={() => onRetryFailed(msg)}
              className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/10 border border-rose-500/40 text-rose-600 dark:text-rose-400 text-[10px] font-semibold hover:bg-rose-500/20 transition-colors cursor-pointer"
              title="Message was not delivered. Return it to the input box to retry."
            >
              <AlertTriangle size={10} />
              Not sent
              <RotateCw size={10} />
            </button>
          )}
          {isUser && onEditStart && !isEditing && (
            <button
              onClick={onEditStart}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
              title="Edit message"
            >
              <Edit2 size={12} />
            </button>
          )}
          {/* ─── Thread indicator (amber) ─────────────────────────────────── */}
          {isUser && onOpenNewThread && !isEditing && (
            <div className="flex items-center gap-1">
              {/* New thread button */}
              <button
                onClick={() => onOpenNewThread(msg._id)}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium transition-all cursor-pointer ${
                  isActiveThread
                    ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 ring-1 ring-amber-400/50'
                    : 'text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30'
                }`}
                title="Start new thread"
              >
                <MessageSquare size={11} />
                <span>+</span>
              </button>

              {/* Existing threads navigator */}
              {threadCount > 0 && (
                <div className={`flex items-center gap-0.5 rounded-md border px-0.5 py-0.5 ${
                  isActiveThread
                    ? 'bg-amber-100/80 dark:bg-amber-900/30 border-amber-300/60 dark:border-amber-700/50'
                    : 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-200/40 dark:border-amber-800/30'
                }`}>
                  <button
                    onClick={() => onThreadNavigate?.('prev')}
                    className="p-0.5 hover:bg-amber-200/60 dark:hover:bg-amber-800/40 rounded transition-colors cursor-pointer text-amber-600 dark:text-amber-400"
                    title="Previous thread"
                  >
                    <ChevronLeft size={10} />
                  </button>
                  <button
                    onClick={() => onOpenExistingThread?.(msg._id)}
                    className="flex items-center gap-0.5 text-[10px] font-semibold min-w-[42px] justify-center text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors cursor-pointer"
                    title="Open thread"
                  >
                    <MessageSquare size={9} />
                    <span>{threadCount}</span>
                  </button>
                  <button
                    onClick={() => onThreadNavigate?.('next')}
                    className="p-0.5 hover:bg-amber-200/60 dark:hover:bg-amber-800/40 rounded transition-colors cursor-pointer text-amber-600 dark:text-amber-400"
                    title="Next thread"
                  >
                    <ChevronRight size={10} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ─── Copy button ─────────────────────────────────────────────── */}
          {onCopy && !isEditing && (
            <button
              onClick={() => {
                onCopy(msg.content)
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              }}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 flex items-center gap-1 cursor-pointer"
              title="Copy message"
            >
              <Copy size={12} />
              {copied && <span className="text-[10px] text-blue-500">Copied!</span>}
            </button>
          )}

          {/* ─── Branch indicator (blue/violet) ──────────────────────────── */}
          {branchInfo && branchInfo.branchCount > 1 && !isEditing && (
            <div className="flex items-center gap-0.5 bg-violet-50/80 dark:bg-violet-950/20 border border-violet-200/50 dark:border-violet-700/30 rounded-md px-0.5 py-0.5">
              <button
                onClick={() => onBranchChange?.('prev')}
                className="p-0.5 hover:bg-violet-100 dark:hover:bg-violet-800/40 rounded transition-colors cursor-pointer text-violet-500 dark:text-violet-400"
                title="Previous version"
              >
                <ChevronLeft size={10} />
              </button>
              <span className="flex items-center gap-0.5 text-[10px] font-semibold min-w-[42px] justify-center text-violet-600 dark:text-violet-400">
                <GitBranch size={9} />
                <span>v{branchInfo.currentIndex}/{branchInfo.branchCount}</span>
              </span>
              <button
                onClick={() => onBranchChange?.('next')}
                className="p-0.5 hover:bg-violet-100 dark:hover:bg-violet-800/40 rounded transition-colors cursor-pointer text-violet-500 dark:text-violet-400"
                title="Next version"
              >
                <ChevronRight size={10} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
