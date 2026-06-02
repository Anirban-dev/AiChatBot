import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { getChat } from '../API/Chat'
import Sidebar from '../Components/Sidebar'
import Navbar from '../Components/Navbar'
import { Msg } from '../Components/Msg'

function Chat() {
  // 1. Initialize state by checking localStorage first, falling back to system preferences
  const [dark, setDark] = useState<boolean>(() => {
    const savedTheme = localStorage.getItem('theme')
    if (savedTheme) {
      return savedTheme === 'dark'
    }
    // Optional fallback: Match the user's OS light/dark theme default if nothing is saved yet
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  const [collapsed, setCollapsed] = useState(window.innerWidth < 640)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640)
  const { chatId } = useParams()
  const [chat, setChat] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 640
      setIsMobile(mobile)
      if (mobile) setCollapsed(true)
      else setCollapsed(false)
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // 2. Synchronize theme switches with DOM tree and save state choices locally
  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }, [dark])

  useEffect(() => {
    if (!chatId) return
    const fetchChat = async () => {
      try {
        const data = await getChat(chatId)
        setChat(data)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    fetchChat()
  }, [chatId])

  // RENAME LISTENER
  useEffect(() => {
    const handleGlobalRename = (e: Event) => {
      const { chatId: renamedId, title: newTitle } = (e as CustomEvent).detail
      
      if (renamedId === chatId) {
        setChat((prev: any) => prev ? { ...prev, title: newTitle } : { title: newTitle })
      }
    }

    window.addEventListener('chat-auto-renamed', handleGlobalRename)
    return () => window.removeEventListener('chat-auto-renamed', handleGlobalRename)
  }, [chatId])

  return (
    <div className="flex h-screen bg-white dark:bg-gray-900 overflow-hidden">
      <Sidebar
        isMobile={isMobile}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <Navbar
          dark={dark}
          setDark={setDark}
          toggleSidebar={() => setCollapsed(false)}
          chatTitle={chat?.title}
        />

        <div className="flex-1 min-h-0 bg-gray-50 dark:bg-gray-800/50">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <Msg chatId={chatId!} />
          )}
        </div>
      </div>
    </div>
  )
}

export default Chat