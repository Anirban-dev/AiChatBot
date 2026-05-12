import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Plus, MessageSquare, Trash2, ChevronRight, ChevronLeft } from 'lucide-react'
import { allChat, deleteChat } from '../API/Chat'
import { useEffect, useState } from 'react'

const Sidebar = ({ isMobile, collapsed, setCollapsed, title }: any) => {

  const toggleSidebar = () => {
    setCollapsed(!collapsed)
  }

  const [chats, setChats] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    chatId: string
  } | null>(null)

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
  }, [])

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

  // Close context menu on click anywhere
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
      setChats((prev) => prev.filter(c => c.id !== contextMenu.chatId))

      // If currently viewing deleted chat, redirect to home
      if (location.pathname.includes(contextMenu.chatId)) {
        navigate('/')
      }
    } catch (err) {
      console.error(err)
    } finally {
      setContextMenu(null)
    }
  }

  return (
    <>
      {/* Overlay (mobile only) */}
      {isMobile && !collapsed && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setCollapsed(true)}
        />
      )}

      <div
        className={`h-screen flex flex-col p-4 transition-all duration-300 ease-in-out
  bg-white text-black dark:bg-gray-900 dark:text-white
  ${isMobile
            ? `fixed top-0 left-0 z-50 w-64 transform ${collapsed ? '-translate-x-full' : 'translate-x-0'}`
            : `${collapsed ? 'w-20' : 'w-64'}` // Increased collapsed width slightly for better icon centering
          }
  `}
      >
        {/* Top */}
        <div className="flex items-center justify-between mb-6 h-8">
          <div className={`overflow-hidden transition-all duration-300 ${collapsed ? 'w-0 opacity-0' : 'w-full opacity-100'}`}>
            <h1 className="text-lg font-semibold cursor-default truncate">{title}</h1>
          </div>

          <button
            onClick={toggleSidebar}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors cursor-pointer"
          >
            {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
          </button>
        </div>

        {/* New Chat */}
        <Link
          to="/"
          className="flex items-center gap-3 p-2 rounded-lg bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 transition-all duration-300"
        >
          <Plus size={18} className="shrink-0" />
          <span className={`transition-all duration-300 origin-left ${collapsed ? 'scale-0 w-0 opacity-0' : 'scale-100 w-auto opacity-100'}`}>
            New Chat
          </span>
        </Link>

        {/* Chat List */}
        <div className="mt-6 flex flex-col gap-2 overflow-y-auto overflow-x-hidden">
          {loading ? (
            <p className="text-xs">...</p>
          ) : (
            chats.map((chat) => (
              <NavLink
                key={chat.id}
                to={`/${chat.id}`}
                onContextMenu={(e) => handleRightClick(e, chat.id)}
                className={({ isActive }) =>
                  `flex items-center gap-3 p-2 rounded-lg transition-all duration-300 ${isActive
                    ? 'bg-gray-300 dark:bg-gray-600'
                    : 'hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`
                }
              >
                <MessageSquare size={16} className="shrink-0" />
                <span className={`truncate transition-all duration-300 origin-left ${collapsed ? 'scale-0 w-0 opacity-0' : 'scale-100 w-auto opacity-100'}`}>
                  {chat.title}
                </span>
              </NavLink>
            ))
          )}
        </div>

        {/* Bottom */}
        {!collapsed && (
          <div className="mt-auto pt-4 border-t 
            border-gray-300 dark:border-gray-600"
          >
            <p className="text-sm text-gray-500 dark:text-gray-400">User</p>
          </div>
        )}
      </div>
      {/* Context Menu */}
      {
        contextMenu && (
          <div
            style={{ top: contextMenu.y, left: contextMenu.x }}
            className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 
            dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[120px]"
          >
            <button
              onClick={handleDelete}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm
              text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition"
            >
              <Trash2 size={14} />
              Delete Chat
            </button>
          </div>
        )
      }
    </>
  )
}

export default Sidebar