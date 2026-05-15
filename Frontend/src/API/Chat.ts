import api from "./AxiosInstance"

export const getChat = async (chatId: string) => {
  const res = await api.get(`/chats/${chatId}`)
  return res.data
}

export const createChat = async () => {
  const res = await api.post(`/chats`)
  return res.data
}

export const allChat = async () => {
  const res = await api.get(`/chats/allchats`)
  return res.data
}

export const deleteChat = async (chatId: string) => {
  const res = await api.delete(`/chats/${chatId}`)
  return res.data
}