import axios from 'axios'
import { getCookie } from "../Auth/authHelper"

const API_URL = import.meta.env.VITE_BASE_URL

export const uploadFile = async (file: File, chatId: string, signal?: AbortSignal) => {
  const token = getCookie('token')
  const formData = new FormData()
  formData.append('chatId', chatId)
  formData.append('file', file)

  const response = await axios.post(`${API_URL}/files/upload`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
      'Authorization': `Bearer ${token}`
    },
    signal
  })
  return response.data
}

export const deleteFileFromRAG = async (filename: string) => {
  const token = getCookie('token')
  const response = await axios.post(`${API_URL}/files/delete`, { filename }, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  })
  return response.data
}
