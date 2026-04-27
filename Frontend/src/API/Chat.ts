const BASE_URL = import.meta.env.VITE_BASE_URL;

const authHeader = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('token')}`
})

export const getChat = async (chatId: string) => {
  const res = await fetch(`${BASE_URL}/chats/${chatId}`, {
    headers: authHeader()
  })
  if (!res.ok) throw new Error('Failed to fetch chat')
  return res.json()
}

export const createChat = async () => {
  const res = await fetch(`${BASE_URL}/chats`, {
    method: 'POST',
    headers: authHeader()
  })

  if (!res.ok) throw new Error('Failed to create chat')
  return res.json()
}

export const allChat = async () => {
  const res = await fetch(`${BASE_URL}/chats/allchats`, {
    headers: authHeader()
  })

  if (!res.ok) throw new Error("Failed to fetch chat")
  return res.json()
}

export const deleteChat = async (chatId: string) => {
  const res = await fetch(`${BASE_URL}/chats/${chatId}`, {
    method: 'DELETE',
    headers: authHeader()
  })
  if (!res.ok) throw new Error('Failed to delete chat')
  return res.json()
}