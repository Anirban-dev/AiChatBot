import api from "../Auth/AxiosHelper"

export const getChat = async (chatId: string) => {
  const res = await api.get(`/chats/${chatId}`)
  return res.data
}

export const createChat = async (title?: string) => {
  const res = await api.post(`/chats`, { title })
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

export const renameChat = async (chatId: string, newTitle: string) => {
  const res = await api.put(`/chats/${chatId}`, { title: newTitle });
  return res.data;
};

export const searchChats = async (query: string) => {
  const res = await api.get(`/chats/search/query?q=${encodeURIComponent(query)}`)
  return res.data
}