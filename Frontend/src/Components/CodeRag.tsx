import { useState, useEffect, useRef } from 'react'
import { Code, X } from 'lucide-react'

interface CodeRagModalProps {
  isOpen: boolean
  onClose: () => void
  onInject: (name: string, content: string) => void
  initialData: { name: string; content: string } | null
}

export const CodeRagModal = ({ isOpen, onClose, onInject, initialData }: CodeRagModalProps) => {
  const [codeSnippet, setCodeSnippet] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Sync internal form state and manage focus window states
  useEffect(() => {
    if (isOpen) {
      setCodeSnippet(initialData?.content || '')
      
      const focusTimeout = setTimeout(() => {
        textareaRef.current?.focus()
      }, 60)
      
      return () => clearTimeout(focusTimeout)
    }
  }, [isOpen, initialData])

  // Handle Close on Escape (Esc) keypress
  useEffect(() => {
    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    if (isOpen) {
      window.addEventListener('keydown', handleEscapeKey)
    }

    return () => {
      window.removeEventListener('keydown', handleEscapeKey)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleSaveCodeContext = () => {
    if (!codeSnippet.trim()) return
    
    const genericName = initialData?.name || 'snippet.txt'
    onInject(genericName, codeSnippet) 
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col h-[70vh] max-h-[85vh]">
        
        {/* Header */}
        <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between shrink-0">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white flex items-center gap-2">
            <Code size={16} className="text-indigo-500" /> 
            {initialData ? 'Edit Staged Code Context' : 'Inject Code RAG Context'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-4 flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 flex flex-col min-h-0">
            <label className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider block mb-2">
              Paste Source Code Blocks
            </label>
            <textarea 
              ref={textareaRef}
              value={codeSnippet}
              onChange={e => setCodeSnippet(e.target.value)}
              placeholder="Paste raw data structures, long configuration profiles, multi-file contents or target execution scripts directly..."
              className="w-full flex-1 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-mono text-xs p-4 rounded-xl border border-gray-200 dark:border-gray-700/80 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 resize-none leading-relaxed shadow-inner"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-3 shrink-0 bg-gray-50 dark:bg-gray-800/40">
          <button onClick={onClose} className="px-4 py-2 border border-gray-200 dark:border-gray-700 text-xs font-medium rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer">
            Cancel
          </button>
          <button 
            onClick={handleSaveCodeContext} 
            disabled={!codeSnippet.trim()}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium rounded-xl flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
          >
            {initialData ? 'Update Context' : 'Inject Context'}
          </button>
        </div>
      </div>
    </div>
  )
}