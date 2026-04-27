import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { getChat } from '../API/Chat'
import Sidebar from '../Components/Sidebar'
import Navbar from '../Components/Navbar'
import Msg from '../Components/Msg'

function Chat() {
  const [dark, setDark] = useState(true)
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

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
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

  return (
    <div className="flex h-screen">

      <Sidebar 
        isMobile={isMobile}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        title={chat?.title}
       />

      <div className="flex-1 flex flex-col">
        <Navbar 
          dark={dark}
          setDark={setDark} 
          toggleSidebar={() => setCollapsed(false)}
        />

        <div className="flex-1 bg-white dark:bg-gray-800 text-black dark:text-white p-4 min-h-0">
          {loading ? "Loading..." : <Msg chatId={chatId!}/>}
        </div>
      </div>
    </div>
  )
}

export default Chat