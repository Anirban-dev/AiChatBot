import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { createChat } from '../API/Chat'

const HomePage = () => {
  const navigate = useNavigate()

  useEffect(() => {
    const init = async () => {
      try {
        const chat = await createChat()
        console.log(chat)
        navigate(`/${chat.id}`, { replace: true })
      } catch (err) {
        console.error(err)
      }
    }

    init()
  }, [])

  return <p>Creating chat...</p>
}

export default HomePage