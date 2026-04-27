const BASE_URL = import.meta.env.VITE_BASE_URL

const authHeader = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('token')}`
})

export const getMsgs = async (chatId: string) => {
  const res = await fetch(`${BASE_URL}/chats/${chatId}/msgs`, {
    headers: authHeader()
  })
  if (!res.ok) throw new Error('Failed to fetch msgs')
  return res.json()
}

export const sendMsg = async (chatId: string, content: string) => {
  const res = await fetch(`${BASE_URL}/chats/${chatId}/msgs`, {
    method: 'POST',
    headers: authHeader(),
    body: JSON.stringify({ content })
  })
  if (!res.ok) throw new Error('Failed to send message')
  return res.json() // returns { userMessage, assistantMessage }
}