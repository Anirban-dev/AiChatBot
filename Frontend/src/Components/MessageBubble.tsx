import { Cpu, Loader2 } from 'lucide-react'
import MarkdownRenderer from './BashComponent'

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
}

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff'])
const TEXT_EXTS = new Set(['.txt', '.md', '.json', '.js', '.ts', '.py', '.cpp', '.c', '.h', '.html', '.css', '.csv'])

const bubbleBase = 'px-4 py-2.5 text-sm leading-relaxed rounded-2xl shadow-xs'
const userBubble = `${bubbleBase} bg-blue-600 text-white rounded-br-sm`
const assistantBubble = `${bubbleBase} bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border border-gray-100 dark:border-gray-700 rounded-bl-sm`

// ─── Tool call pills ───────────────────────────────────────────────────────
const ToolCallList = ({ toolCalls }: { toolCalls: ToolCall[] }) => (
  <div className="flex flex-col gap-1.5 w-full">
    {toolCalls.map((tc) => (
      <div
        key={tc.id}
        className={`flex items-start gap-2.5 px-3 py-2.5 rounded-xl border text-xs font-medium ${
          tc.status === 'completed'
            ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-400'
            : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/40 text-amber-700 dark:text-amber-400'
        }`}
      >
        <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
          {tc.status === 'running' && (
            <div className="relative flex items-center justify-center w-4 h-4">
              <Cpu size={11} className="text-amber-500 animate-pulse" />
              <Loader2 size={16} className="animate-spin text-amber-400/60 absolute" />
            </div>
          )}
          {tc.status === 'completed' && (
            <svg className="w-3.5 h-3.5 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider opacity-70">
              {tc.status === 'running' ? 'Calling' : tc.status === 'completed' ? 'Tool Result' : 'Tool Error'}
            </span>
            <span className={`font-mono text-[11px] px-1.5 py-0.5 rounded-md font-bold ${
              tc.status === 'completed' ? 'bg-emerald-100 dark:bg-emerald-900/50' :
              tc.status === 'failed'    ? 'bg-rose-100 dark:bg-rose-900/50' :
              'bg-amber-100 dark:bg-amber-900/50'
            }`}>{tc.name}</span>
          </div>
        </div>
      </div>
    ))}
  </div>
)

// ─── Reasoning / "thought process" collapsible ─────────────────────────────
const ReasoningBlock = ({ reasoning }: { reasoning: string }) => (
  <details open className="w-full group/think border border-gray-200/60 dark:border-gray-700/60 rounded-2xl bg-gray-50/50 dark:bg-gray-800/10 mb-1.5 overflow-hidden transition-all duration-300">
    <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none text-xs font-semibold text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
      <span className="text-violet-500 animate-pulse">🧠</span>
      <span>Thought process</span>
      <svg className="w-3.5 h-3.5 ml-auto transition-transform duration-300 group-open/think:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
      </svg>
    </summary>
    <div className="px-4 pb-3 pt-1 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-150 dark:border-gray-700/40 font-serif leading-relaxed whitespace-pre-wrap">
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
  msg: MessageLike
  runCode: (code: string) => Promise<any>
  getFileIcon: (ext: string) => React.ReactNode
  formatFileSize: (size: number) => string
  formatTime: (date: string) => string
  onOpenTextPreview: (name: string, content: string) => void
}

export const MessageBubble = ({
  msg,
  runCode,
  getFileIcon,
  formatFileSize,
  formatTime,
  onOpenTextPreview,
}: MessageBubbleProps) => {
  const fileInfo = msg.fileInfo
  const ext = fileInfo?.extension?.toLowerCase() || ''
  const isTextFile = !!fileInfo && TEXT_EXTS.has(ext)
  const isUser = msg.role === 'user'

  return (
    <div className={`flex items-end gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 mb-0.5 shadow-xs ${
        isUser ? 'bg-linear-to-br from-blue-500 to-indigo-600 text-white' : 'bg-linear-to-br from-violet-500 to-purple-600 text-white'
      }`}>
        {isUser ? 'A' : '✦'}
      </div>

      <div className={`flex flex-col gap-1.5 max-w-[80%] ${isUser ? 'items-end' : 'items-start'}`}>
        {msg.role === 'assistant' && !!msg.toolCalls?.length && (
          <ToolCallList toolCalls={msg.toolCalls} />
        )}

        {msg.role === 'assistant' && msg.reasoning && (
          <ReasoningBlock reasoning={msg.reasoning} />
        )}

        {isTextFile && fileInfo ? (
          <div className={isUser ? userBubble : assistantBubble}>
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
          <div className={isUser ? userBubble : assistantBubble}>
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

        <span className="text-[10px] text-gray-400 dark:text-gray-500 px-1">{formatTime(msg.createdAt)}</span>
      </div>
    </div>
  )
}