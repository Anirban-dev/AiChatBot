import { useEffect, useState } from 'react'
import { Copy, Check } from 'lucide-react'

interface TextFilePreviewModalProps {
  isOpen: boolean
  onClose: () => void
  fileName: string
  content: string
}

export const TextFilePreviewModal = ({ isOpen, onClose, content }: TextFilePreviewModalProps) => {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) window.addEventListener('keydown', handleEscapeKey)
    return () => window.removeEventListener('keydown', handleEscapeKey)
  }, [isOpen, onClose])

  useEffect(() => {
    setCopied(false)
  }, [isOpen, content])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy text: ', err)
    }
  }

  if (!isOpen) return null

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose} // <-- 1. Click on backdrop closes modal
    >
      <div 
        className="relative bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col h-[70vh] max-h-[85vh]"
        onClick={(e) => e.stopPropagation()} // <-- 2. Stops click inside modal from bubbling to backdrop
      >
        
        {/* Body Container - Locks the height to let the inner box scroll */}
        <div className="p-3 flex-1 overflow-hidden flex flex-col">
          
          {/* Inner Box Wrapper - Relative so the button pins inside it */}
          <div className="relative flex-1 w-full bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700/80 shadow-inner overflow-hidden">
            
            {/* Bare Floating Copy Button */}
            <div className="absolute top-2 right-2 z-10">
              <button 
                onClick={handleCopy} 
                title="Copy content"
                className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 cursor-pointer p-1.5 rounded-lg hover:bg-gray-200/60 dark:hover:bg-gray-700/60 transition-all flex items-center gap-1.5"
              >
                {copied ? (
                  <>
                    <Check size={16} className="text-green-500" />
                    <span className="text-[10px] text-green-500 font-bold pr-0.5">Copied!</span>
                  </>
                ) : (
                  <Copy size={16} />
                )}
              </button>
            </div>

            {/* The actual scrolling text box */}
            <pre className="w-full h-full overflow-y-auto text-gray-900 dark:text-gray-100 font-mono text-xs p-3 pr-14 whitespace-pre-wrap leading-relaxed outline-none">
              {content || 'No preview available.'}
            </pre>
            
          </div>
        </div>

        {/* Footer */}
        <div className="py-2 px-4 border-t border-gray-100 dark:border-gray-700 flex justify-end shrink-0 bg-gray-50 dark:bg-gray-800/40">
          <button onClick={onClose} className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 text-xs font-medium rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}