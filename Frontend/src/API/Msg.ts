import api from "./AxiosInstance"
import { fetchWithRefresh, authHeader } from "./FetchHelper"

const BASE_URL = import.meta.env.VITE_BASE_URL

// ── API calls ─────────────────────────────────────────────────────────────────
export const getMsgs = async (chatId: string) => {
  const res = await api.get(`/chats/${chatId}/msgs`)
  return res.data
}

export const sendMsg = async (
  chatId: string,
  content: string,
  onToken: (token: string) => void,
  onUserMessage: (msg: any) => void,
  onDone: (assistantMsg: any) => void,
  onError: () => void,
  signal: AbortSignal
) => {
  // ✅ Use fetchWithRefresh so a 401 mid-session is handled automatically
  const res = await fetchWithRefresh(`${BASE_URL}/chats/${chatId}/msgs`, {
    method: 'POST',
    headers: authHeader(),
    body: JSON.stringify({ content }),
    signal,
  })

  if (!res.body) throw new Error('No response body')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value)
    const lines = chunk.split('\n').filter(Boolean)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      if (line.startsWith('event: userMessage')) {
        const data = JSON.parse(lines[i + 1].replace('data: ', ''))
        onUserMessage(data)
      } else if (line.startsWith('event: token')) {
        const data = JSON.parse(lines[i + 1].replace('data: ', ''))
        onToken(data.token)
      } else if (line.startsWith('event: done')) {
        const data = JSON.parse(lines[i + 1].replace('data: ', ''))
        onDone(data)
      } else if (line.startsWith('event: error')) {
        onError()
      }
    }
  }
}

export const stopMsg = async (chatId: string) => {
  const res = await api.post(`/chats/${chatId}/msgs/stop`)
  return res.data
}