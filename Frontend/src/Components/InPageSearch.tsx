import React, { useState, useRef, useEffect } from 'react'
import { Search, ChevronUp, ChevronDown, X } from 'lucide-react'

interface InPageSearchProps {
  chatTitle?: string
}

const InPageSearch = ({ chatTitle }: InPageSearchProps) => {
  const [searchActive, setSearchActive] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [currentMatch, setCurrentMatch] = useState(0)
  const [totalMatches, setTotalMatches] = useState(0)
  
  const searchInputRef = useRef<HTMLInputElement>(null)
  const savedRanges = useRef<Range[]>([])

  // Global hotkeys handler (Ctrl+F / Cmd+F & Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setSearchActive(true)
        setTimeout(() => searchInputRef.current?.focus(), 50)
      }
      if (e.key === 'Escape') {
        handleCloseSearch()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Scan only the active chat DOM node tree
  useEffect(() => {
    if (typeof CSS !== 'undefined' && CSS.highlights) {
      CSS.highlights.clear()
    }
    savedRanges.current = []

    if (!searchQuery.trim()) {
      setTotalMatches(0)
      setCurrentMatch(0)
      return
    }

    // CRITICAL FIX: Targets ONLY the active chat feed container
    const chatContainer = document.getElementById('active-chat-stream')
    if (!chatContainer) return

    const ranges: Range[] = []
    const walker = document.createTreeWalker(chatContainer, NodeFilter.SHOW_TEXT, null)
    let node: Node | null

    while ((node = walker.nextNode())) {
      const text = node.nodeValue || ""
      let index = text.toLowerCase().indexOf(searchQuery.toLowerCase())
      
      while (index !== -1) {
        const range = new Range()
        range.setStart(node, index)
        range.setEnd(node, index + searchQuery.length)
        ranges.push(range)
        index = text.toLowerCase().indexOf(searchQuery.toLowerCase(), index + searchQuery.length)
      }
    }

    savedRanges.current = ranges
    setTotalMatches(ranges.length)
    setCurrentMatch(ranges.length > 0 ? 1 : 0)
  }, [searchQuery, chatTitle])

  // Apply highlights to selected text nodes dynamically
  useEffect(() => {
    if (typeof CSS === 'undefined' || !CSS.highlights) return

    CSS.highlights.clear()
    if (savedRanges.current.length === 0) return

    const matchHighlight = new Highlight(...savedRanges.current)
    CSS.highlights.set('search-match', matchHighlight)

    const activeIdx = currentMatch - 1
    const activeRange = savedRanges.current[activeIdx]
    if (activeRange) {
      const activeHighlight = new Highlight(activeRange)
      CSS.highlights.set('search-match-active', activeHighlight)

      activeRange.startContainer.parentElement?.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      })
    }
  }, [currentMatch, totalMatches])

  const handleCloseSearch = () => {
    setSearchActive(false)
    setSearchQuery("")
    setTotalMatches(0)
    setCurrentMatch(0)
    if (typeof CSS !== 'undefined' && CSS.highlights) {
      CSS.highlights.clear()
    }
  }

  const navigateMatch = (direction: 'next' | 'prev') => {
    if (totalMatches === 0) return
    if (direction === 'next') {
      setCurrentMatch(prev => (prev >= totalMatches ? 1 : prev + 1))
    } else {
      setCurrentMatch(prev => (prev <= 1 ? totalMatches : prev - 1))
    }
  }

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      navigateMatch(e.shiftKey ? 'prev' : 'next')
    }
  }

  if (!searchActive) {
    return (
      <button 
        onClick={() => { setSearchActive(true); setTimeout(() => searchInputRef.current?.focus(), 50); }}
        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors cursor-pointer"
        title="Find in chat (Ctrl+F)"
      >
        <Search size={17} />
      </button>
    )
  }

  return (
    <>
      <style>{`
        ::highlight(search-match) {
          background-color: rgba(234, 179, 8, 0.35);
          color: inherit;
        }
        ::highlight(search-match-active) {
          background-color: rgb(234, 179, 8) !important;
          color: black !important;
        }
      `}</style>

      <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700/60 rounded-xl px-3 py-1.5 w-full max-w-xs sm:max-w-sm transition-all animate-in fade-in slide-in-from-top-1 duration-150">
        <Search size={15} className="text-gray-400 shrink-0" />
        <input
          ref={searchInputRef}
          type="text"
          placeholder="Find in chat..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleInputKeyDown}
          className="w-full bg-transparent text-xs font-medium text-gray-900 dark:text-white outline-none border-none p-0 focus:ring-0"
        />
        
        {searchQuery && (
          <span className="text-[11px] font-bold text-gray-400 dark:text-gray-500 whitespace-nowrap px-1 tabular-nums">
            {totalMatches > 0 ? `${currentMatch}/${totalMatches}` : '0/0'}
          </span>
        )}

        <div className="flex items-center border-l border-gray-200 dark:border-gray-700 pl-1.5 ml-0.5 shrink-0">
          <button 
            onClick={() => navigateMatch('prev')}
            disabled={totalMatches === 0}
            className="p-1 rounded-md text-gray-400 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed"
          >
            <ChevronUp size={14} />
          </button>
          <button 
            onClick={() => navigateMatch('next')}
            disabled={totalMatches === 0}
            className="p-1 rounded-md text-gray-400 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed"
          >
            <ChevronDown size={14} />
          </button>
          <button 
            onClick={handleCloseSearch}
            className="p-1 rounded-md text-gray-400 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-red-500 dark:hover:text-red-400 cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </>
  )
}

export default InPageSearch