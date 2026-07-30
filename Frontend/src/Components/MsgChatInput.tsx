import React, { useRef, useEffect, useState } from 'react'
import { Send, Square, Paperclip, X, AlertTriangle, Cpu, Image, FileText, Camera, Video, Code } from 'lucide-react'
import { ModelSelector } from './ModelSelector'

interface MsgChatInputProps {
  input: string
  setInput: (value: string) => void
  loading: boolean
  uploading: boolean
  errorMessage: string | null
  clearError: (() => void) | undefined
  selectedModel: string
  setSelectedModel: (model: 'small' | 'large' | 'thinking' | 'critiq') => void
  pendingFile: File | null
  previewUrl: string | null
  pendingCode: { name: string; content: string } | null
  activeTool: string | null // NOTE: Currently unused, can be removed or implemented
  clearStaging: () => void
  handleSendAction: () => void
  stopGeneration: () => void
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  handlePaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void
  handleTextPaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void
  handleDragOver: (e: React.DragEvent<HTMLDivElement>) => void
  handleDragLeave: (e: React.DragEvent<HTMLDivElement>) => void
  handleDrop: (e: React.DragEvent<HTMLDivElement>) => void
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
  formatFileSize: (size: number) => string
  getFileIcon: (ext: string) => React.ReactNode
  setIsCodeModalOpen: (open: boolean) => void
  startCamera: () => void
  tokenCount: number
}

export const MsgChatInput = ({
  input,
  setInput,
  loading,
  uploading,
  errorMessage,
  clearError,
  selectedModel,
  setSelectedModel,
  pendingFile,
  previewUrl,
  pendingCode,
  clearStaging,
  handleSendAction,
  stopGeneration,
  handleKeyDown,
  handlePaste,
  handleTextPaste,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  onFileSelect,
  formatFileSize,
  getFileIcon,
  setIsCodeModalOpen,
  startCamera,
  tokenCount
}: MsgChatInputProps) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [fileAcceptType, setFileAcceptType] = useState<string>('.*')
  
  const menuRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const inputContainerRef = useRef<HTMLDivElement>(null)
  const [editingFileInputs, setEditingFileInputs] = useState<File[]>([])

  const removeEditFile = (index: number) => {
    setEditingFileInputs(prev => prev.filter((_, i) => i !== index))
  }

  // Auto-resize message text box console
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`
  }, [input])

  // Track snippet changes to auto-refocus chat box upon successful modal close context handoffs
  useEffect(() => {
    if (pendingCode) {
      textareaRef.current?.focus()
    }
  }, [pendingCode])

  // Handle outside dropdown context drop close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])


  const triggerNativeUpload = (acceptType: string) => {
    setFileAcceptType(acceptType)
    setIsMenuOpen(false)
    setTimeout(() => {
      fileInputRef.current?.click()
    }, 50)
  }

  return (
    <div
      className="px-4 sm:px-6 pb-4 pt-2 shrink-0"
      style={{
        backgroundColor: 'var(--bg-navbar)',
        borderTop: '1px solid var(--border-medium)'
      }}
    >
      <div className="relative max-w-4xl mx-auto">
        
        {/* File Attachment Upload Preview Box */}
        {previewUrl && (
          <div className="flex items-center gap-3 mb-2.5 p-2 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700/60 w-fit relative group animate-in fade-in slide-in-from-bottom-2 duration-150">
            <div className="relative h-14 w-14 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 shrink-0 shadow-sm">
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
            className="flex flex-col mb-2.5 bg-gray-50 dark:bg-gray-950 text-gray-800 dark:text-gray-200 rounded-xl border border-gray-200 dark:border-gray-800/80 w-64 overflow-hidden relative group cursor-pointer hover:border-indigo-500/80 dark:hover:border-indigo-500/80 transition-all shadow-md select-none animate-in fade-in slide-in-from-bottom-2 duration-150"
            title="Click to edit code snippet context"
          >
            <div className="flex items-center justify-between px-3 py-2 bg-gray-100 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Code size={13} className="text-indigo-500 dark:text-indigo-400 shrink-0" />
                <span className="text-[11px] font-mono font-medium text-gray-600 dark:text-gray-300 truncate">{pendingCode.name}</span>
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); clearStaging(); }} 
                className="p-0.5 rounded-md hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                title="Remove snippet"
              >
                <X size={13} />
              </button>
            </div>
            
            <div className="p-2.5 font-mono text-[10px] leading-relaxed text-gray-500 dark:text-gray-400 max-h-20 overflow-hidden relative mask-linear-gradient">
              <pre className="whitespace-pre-wrap truncate-lines">
                {pendingCode.content.split('\n').slice(0, 4).join('\n') || 'Empty block'}
              </pre>
              <div className="absolute bottom-0 left-0 right-0 h-4 bg-linear-to-t from-gray-50 dark:from-gray-950 to-transparent pointer-events-none" />
            </div>
          </div>
        )}

        {/* Structured Network Error Alert Header */}
        {errorMessage && (
          <div className="flex items-center justify-between gap-3 mb-2.5 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-400 text-xs rounded-xl shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-150">
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

        {/* Inline Editing File Attachments */}
        {editingFileInputs.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2.5">
            {editingFileInputs.map((file, index) => (
              <div
                key={index}
                className="flex items-center gap-2 px-2 py-1 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
              >
                <Paperclip size={12} className="text-gray-500" />
                <span className="text-xs text-gray-700 dark:text-gray-300 max-w-32 truncate">{file.name}</span>
                <button
                  onClick={() => removeEditFile(index)}
                  className="p-0.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-gray-400 hover:text-red-500"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Core Chat Console Layout */}
        <div
          ref={inputContainerRef}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`flex items-end gap-2 rounded-2xl border px-3 py-2.5 shadow-sm transition-all focus-within:ring-1 focus-within:ring-amber-400/30 ${errorMessage ? 'border-red-300 dark:border-red-900/60' : ''}`}
          style={{
            backgroundColor: 'var(--bg-card)',
            border: errorMessage ? undefined : `1.5px solid var(--border-medium)`
          }}
        >
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
            onPaste={(e) => { handleTextPaste(e); handlePaste(e); }}
            disabled={!!errorMessage}
            placeholder={errorMessage ? "Resolve engine block exception to continue..." : "Message…"}
            rows={1}
            className="flex-1 bg-transparent resize-none outline-none text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 max-h-40 py-0.5 leading-relaxed disabled:opacity-50"
          />
          {/* Token count indicator */}
          <div className="text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap ml-2 shrink-0">
            {tokenCount} tokens
          </div>

          {/* Combined Tier Selector & Action Trigger Wrapper Group */}
          <div className="flex items-center gap-2 shrink-0 mb-0.5">
            <ModelSelector
              value={selectedModel || 'small'}
              onChange={setSelectedModel}
              disabled={loading || uploading}
              size="compact"
            />

            {/* FIXED: The onClick below now routes to stopGeneration when active */}
            {loading || uploading ? (
              <button onClick={stopGeneration} className="p-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors cursor-pointer" title={uploading ? 'Cancel upload' : 'Stop generation'}>
                <Square size={15} fill="white" />
              </button>
            ) : (
              <button 
                onClick={handleSendAction} 
                disabled={(!input.trim() && !pendingFile && !pendingCode) || !!errorMessage}
                className="p-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 dark:disabled:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors cursor-pointer"
              >
                <Send size={15} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}