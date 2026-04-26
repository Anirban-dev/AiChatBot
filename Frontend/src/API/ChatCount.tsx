const BASE_URL = import.meta.env.VITE_BASE_URL;

export const getChat = async (chatId: string) => {
  const res = await fetch(`${BASE_URL}/chats/${chatId}`)

  if (!res.ok) throw new Error("Failed to fetch chat")

  return res.json()
}

export const createChat = async () => {
  const res = await fetch(`${BASE_URL}/chats`, {
    method: "POST",
  })

  if (!res.ok) throw new Error("Failed to create chat")

  return res.json()
}

export const allChat = async () => {
  const res = await fetch(`${BASE_URL}/chats/allchats`)

  if (!res.ok) throw new Error("Failed to fetch chat")

  return res.json()
}