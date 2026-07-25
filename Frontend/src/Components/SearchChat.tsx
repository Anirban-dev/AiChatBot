import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X, MessageSquare } from 'lucide-react'
import { searchChats } from '../API/Chat'
import { useChatStore } from '../Context/ChatContext'

interface SearchModalProps {
  isOpen: boolean
  onClose: () => void
  recentChats: any[]
}

const SearchModal = ({ isOpen, onClose, recentChats }: SearchModalProps) => {
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const navigate = useNavigate()
  const { setPendingActiveMsgId } = useChatStore()

  // Reset inputs on open/close toggle
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("")
      setSearchResults([])
    }
  }, [isOpen])

  // Global keydown listener to close modal on 'Escape'
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown)
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  // Handle Search Input Queries
  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (searchQuery.trim().length > 0) {
        setIsSearching(true)
        try {
          const results = await searchChats(searchQuery)
          setSearchResults(results)
        } catch (err) {
          console.error(err)
        } finally {
          setIsSearching(false)
        }
      } else {
        setSearchResults([])
      }
    }, 300)

    return () => clearTimeout(delayDebounceFn)
  }, [searchQuery])

  const highlightText = (text: string, highlight: string) => {
    if (!highlight.trim()) return <span>{text}</span>
    const parts = text.split(new RegExp(`(${highlight.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi'))
    return (
      <span>
        {parts.map((part, i) => 
          part.toLowerCase() === highlight.toLowerCase() ? (
            <mark key={i} className="bg-yellow-500/30 text-yellow-600 dark:text-yellow-400 font-semibold px-0.5 rounded-sm">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </span>
    )
  }

  if (!isOpen) return null

  const isQueryEmpty = searchQuery.trim().length === 0

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4 bg-black/60 backdrop-blur-xs">
      {/* Backdrop Close Click */}
      <div className="fixed inset-0 cursor-default" onClick={onClose} />

      {/* Modal Frame */}
      <div
        className="relative w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[60vh] transition-all transform scale-100 animate-in fade-in zoom-in-95 duration-150"
        style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-medium)' }}
      >
        
        {/* Header Search Area */}
        <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: '1px solid var(--border-medium)' }}>
          <Search size={18} className="shrink-0" style={{ color: 'var(--text-secondary)' }} />
          <input
            autoFocus
            type="text"
            placeholder="Search keywords inside your messages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent border-none outline-none text-sm font-medium p-0 focus:ring-0"
            style={{ color: 'var(--text-primary)' }}
          />
          <button 
            onClick={onClose}
            className="p-1 rounded-lg transition-all cursor-pointer"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--border-light)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <X size={16} />
          </button>
        </div>

        {/* Dynamic Display Segment */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 custom-scrollbar">
          {isSearching ? (
            <div className="text-center py-8 text-sm text-gray-400 dark:text-gray-500 font-medium">
              Searching conversation logs...
            </div>
          ) : isQueryEmpty ? (
            /* CASE 1: EMPTY PROMPT — TOP 5 CHATS */
            <div className="space-y-1.5">
              <p className="px-3 pb-1 text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                Recent Conversations
              </p>
              {recentChats.length > 0 ? (
                recentChats.map((chat) => (
                  <button
                    key={chat.id}
                    onClick={() => {
                      onClose()
                      navigate(`/${chat.id}`)
                    }}
                    className="w-full text-left p-3 rounded-xl transition-all flex items-center gap-3 group cursor-pointer"
                    style={{ backgroundColor: 'var(--border-light)', border: '1px solid var(--border-medium)' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--border-medium)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-medium)'; (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--border-light)' }}
                  >
                    <MessageSquare size={16} className="text-amber-500 transition-colors shrink-0" />
                    <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                      {chat.title}
                    </span>
                  </button>
                ))
              ) : (
                <div className="text-center py-6 text-xs text-gray-400 dark:text-gray-500 italic">
                  No historical chats available.
                </div>
              )}
            </div>
          ) : searchResults.length > 0 ? (
            /* CASE 2: FILTERED TERM RESULTS MATCHED */
            searchResults.map((result) => (
              <button
                key={result.messageId}
                onClick={() => {
                  // Tag the message to activate the right branch after navigation
                  setPendingActiveMsgId(result.chatId, result.messageId)
                  onClose()
                  navigate(`/${result.chatId}`)
                }}
                className="w-full text-left p-3 rounded-xl border border-gray-100 dark:border-gray-800/40 hover:border-blue-500/30 bg-gray-50/50 dark:bg-gray-950/30 hover:bg-blue-500/5 dark:hover:bg-blue-500/5 transition-all flex flex-col gap-1 group cursor-pointer"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <MessageSquare size={13} className="text-blue-500 opacity-70 shrink-0" />
                  <span className="text-xs font-bold text-gray-800 dark:text-gray-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate">
                    {result.chatTitle}
                  </span>
                  {result.isThread && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[10px] font-semibold text-blue-500 dark:text-blue-400 shrink-0">
                      <MessageSquare size={9} />
                      In thread
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed font-normal line-clamp-2 pl-5">
                  {highlightText(result.content, searchQuery)}
                </p>
              </button>
            ))
          ) : (
            /* CASE 3: TEXT TYPED BUT 0 MATCHES FOUND */
            <div className="text-center py-8 text-sm text-gray-400 dark:text-gray-500 font-medium">
              No matches found for "{searchQuery}"
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default SearchModal