import api from './AxiosInstance'

export const uploadFile = async (file: File, chatId: string, signal?: AbortSignal) => {
  const formData = new FormData()
  formData.append('chatId', chatId)
  formData.append('file', file)

  const response = await api.post(`/files/upload`, formData, { signal })
  return response.data
}

export const deleteFileFromRAG = async (filename: string) => {
  const response = await api.post(`/files/delete`, { filename })
  return response.data
}