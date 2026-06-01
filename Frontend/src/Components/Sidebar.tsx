import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Plus, MessageSquare, Trash2, ChevronRight, ChevronLeft, Edit2, Search } from 'lucide-react'
import { allChat, deleteChat, renameChat } from '../API/Chat'
import { useEffect, useState } from 'react'
import { getCurrentUser } from '../Auth/authHelper'
import SearchModal from './SearchChat'

interface SidebarProps {
  isMobile: boolean
  collapsed: boolean
  setCollapsed: (collapsed: boolean) => void
}

const Sidebar = ({ isMobile, collapsed, setCollapsed }: SidebarProps) => {
  const toggleSidebar = () => setCollapsed(!collapsed)

  const [chats, setChats] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState("")
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; chatId: string } | null>(null)
  const [isSearchOpen, setIsSearchOpen] = useState(false)

  const currentUser = getCurrentUser() || { name: 'User', email: '' }
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const fetchChats = async () => {
      try {
        const data = await allChat()
        setChats(data)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    fetchChats()
  }, [location.pathname])

  // Listens for updates across components
  useEffect(() => {
    const handleAutoRename = (e: Event) => {
      const { chatId, title } = (e as CustomEvent).detail
      setChats(prev => prev.map(c => c.id === chatId ? { ...c, title } : c))
    }
    window.addEventListener('chat-auto-renamed', handleAutoRename)
    return () => window.removeEventListener('chat-auto-renamed', handleAutoRename)
  }, [])

  useEffect(() => {
    const handleClick = () => setContextMenu(null)
    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [])

  const handleRightClick = (e: React.MouseEvent, chatId: string) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, chatId })
  }

  const handleDelete = async () => {
    if (!contextMenu) return
    try {
      await deleteChat(contextMenu.chatId)
      setChats(prev => prev.filter(c => c.id !== contextMenu.chatId))
      if (location.pathname.includes(contextMenu.chatId)) navigate('/')
    } catch (err) {
      console.error(err)
    } finally {
      setContextMenu(null)
    }
  }
  
  const handleRenameClick = () => {
    if (!contextMenu) return
    setRenamingChatId(contextMenu.chatId)
    const chat = chats.find(c => c.id === contextMenu.chatId)
    setNewTitle(chat?.title || "")
    setContextMenu(null)
  }

  const handleRenameSubmit = async (e: React.FormEvent, chatId: string) => {
    e.preventDefault()
    if (!newTitle.trim()) return setRenamingChatId(null)
    try {
      await renameChat(chatId, newTitle)
      
      // 💥 FIXED: Dispatches event so Parent Chat state & Navbar catch manual renames immediately!
      window.dispatchEvent(new CustomEvent('chat-auto-renamed', {
        detail: { chatId, title: newTitle }
      }))

      setChats(prev => prev.map(c => c.id === chatId ? { ...c, title: newTitle } : c))
    } catch (err) {
      console.error(err)
    } finally {
      setRenamingChatId(null)
    }
  }

  const groupChats = (chatsList: any[]) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const weekAgo = new Date(today)
    weekAgo.setDate(weekAgo.getDate() - 7)

    const groups: Record<string, any[]> = {
      Today: [],
      Yesterday: [],
      'Previous 7 days': [],
      Older: [],
    }

    chatsList.forEach(chat => {
      const d = new Date(chat.createdAt || Date.now())
      d.setHours(0, 0, 0, 0)
      if (d >= today) groups['Today'].push(chat)
      else if (d >= yesterday) groups['Yesterday'].push(chat)
      else if (d >= weekAgo) groups['Previous 7 days'].push(chat)
      else groups['Older'].push(chat)
    })

    return Object.entries(groups).filter(([, items]) => items.length > 0)
  }

  const grouped = groupChats(chats)

  return (
    <>
      {isMobile && !collapsed && (
        <div
          className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm transition-opacity duration-300"
          onClick={() => setCollapsed(true)}
        />
      )}

      <div
        className={`
          h-screen flex flex-col transition-all duration-300 ease-in-out
          bg-gray-50 dark:bg-gray-950
          border-r border-gray-200/80 dark:border-gray-800/60
          ${isMobile
            ? `fixed top-0 left-0 z-50 w-68 transform ${collapsed ? '-translate-x-full' : 'translate-x-0'}`
            : `${collapsed ? 'w-20' : 'w-68'}`
          }
        `}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200 dark:border-gray-800 h-16">
          <div className={`overflow-hidden transition-all duration-200 ${collapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
            <span className="text-base font-bold tracking-tight text-gray-900 dark:text-white pl-1">ChatAI</span>
          </div>
          <button
            onClick={toggleSidebar}
            className="p-2 rounded-xl hover:bg-gray-200/70 dark:hover:bg-gray-800/70 text-gray-500 dark:text-gray-400 transition-all cursor-pointer shrink-0"
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        <div className="px-3 pt-4 pb-2 space-y-1.5">
          <Link
            to="/"
            className={`flex items-center gap-3 px-4 py-3 rounded-xl
              bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800
              hover:border-gray-300 dark:hover:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900/60
              text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white
              text-sm font-semibold shadow-xs transition-all duration-200 cursor-pointer
              ${collapsed ? 'justify-center px-3 py-3' : ''}
            `}
          >
            <Plus size={18} className="shrink-0 text-blue-500" />
            <span className={`transition-all duration-200 whitespace-nowrap ${collapsed ? 'hidden' : 'block'}`}>
              New chat
            </span>
          </Link>

          <button
            onClick={() => setIsSearchOpen(true)}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl
              bg-gray-100/70 dark:bg-gray-900/40 hover:bg-gray-200/50 dark:hover:bg-gray-900/80
              text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200
              text-xs font-medium transition-all duration-200 border border-transparent hover:border-gray-200 dark:hover:border-gray-800 cursor-pointer
              ${collapsed ? 'justify-center px-3' : ''}
            `}
          >
            <Search size={16} className="shrink-0 text-gray-400 dark:text-gray-500" />
            <span className={`transition-all duration-200 whitespace-nowrap ${collapsed ? 'hidden' : 'block'}`}>
              Search history...
            </span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 space-y-4 custom-scrollbar">
          {loading ? (
            <div className="space-y-3 px-1">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-10 bg-gray-200 dark:bg-gray-800 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : collapsed ? (
            <div className="space-y-2">
              {chats.map(chat => (
                <NavLink
                  key={chat.id}
                  to={`/${chat.id}`}
                  onContextMenu={e => handleRightClick(e, chat.id)}
                  title={!chat.title || chat.title === chat.id ? 'New Chat' : chat.title}
                  className={({ isActive }) =>
                    `flex items-center justify-center p-3 rounded-xl transition-all duration-200 cursor-pointer ${
                      isActive
                        ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium'
                        : 'text-gray-500 dark:text-gray-400 hover:bg-gray-200/50 dark:hover:bg-gray-800/40 hover:text-gray-900 dark:hover:text-white'
                    }`
                  }
                >
                  <MessageSquare size={18} />
                </NavLink>
              ))}
            </div>
          ) : (
            grouped.map(([label, items]) => (
              <div key={label} className="space-y-1.5">
                <p className="px-3 text-[11px] font-bold text-gray-400/80 dark:text-gray-500 uppercase tracking-wider">
                  {label}
                </p>
                <div className="space-y-1">
                  {items.map(chat => (
                    renamingChatId === chat.id ? (
                      <form 
                        key={chat.id} 
                        onSubmit={(e) => handleRenameSubmit(e, chat.id)} 
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-blue-500/5 dark:bg-blue-500/10 border border-blue-500/50"
                      >
                        <MessageSquare size={16} className="shrink-0 text-blue-500" />
                        <input 
                          autoFocus
                          value={newTitle}
                          onChange={(e) => setNewTitle(e.target.value)}
                          onBlur={() => setRenamingChatId(null)}
                          onKeyDown={(e) => { if (e.key === 'Escape') setRenamingChatId(null) }}
                          className="w-full bg-transparent text-sm text-gray-900 dark:text-white outline-none font-medium border-none p-0 focus:ring-0"
                        />
                      </form>
                    ) : (
                      <NavLink
                        key={chat.id}
                        to={`/${chat.id}`}
                        onContextMenu={e => handleRightClick(e, chat.id)}
                        className={({ isActive }) =>
                          `group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 cursor-pointer ${
                            isActive
                              ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold'
                              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200/50 dark:hover:bg-gray-800/40 hover:text-gray-900 dark:hover:text-white'
                          }`
                        }
                      >
                        <MessageSquare size={16} className="shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
                        <span className="truncate flex-1">
                          {!chat.title || chat.title === chat.id ? 'New Chat' : chat.title}
                        </span>
                      </NavLink>
                    )
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {!collapsed && (
          <div className="px-3 py-3 border-t border-gray-200 dark:border-gray-800">
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-200/50 dark:hover:bg-gray-800/40 cursor-pointer transition-all duration-200">
              <div className="w-8 h-8 rounded-full bg-linear-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-xs">
                {currentUser.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">{currentUser.name}</p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate mt-0.5">{currentUser.email}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {contextMenu && (
        <div
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className="fixed z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-xl py-1.5 min-w-40 backdrop-blur-md"
        >
          <button
            onClick={handleRenameClick}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/60 transition-colors cursor-pointer"
          >
            <Edit2 size={15} className="text-gray-400" />
            Rename
          </button>
          <button
            onClick={handleDelete}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors cursor-pointer"
          >
            <Trash2 size={15} />
            Delete
          </button>
        </div>
      )}

      <SearchModal 
        isOpen={isSearchOpen} 
        onClose={() => setIsSearchOpen(false)} 
        recentChats={chats.slice(0, 5)} 
      />
    </>
  )
}

export default Sidebar