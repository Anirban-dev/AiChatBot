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

export const sendMsg = async (
  chatId: string,
  content: string,
  onToken: (token: string) => void,     // called for each word
  onUserMessage: (msg: any) => void,     // called when user msg is saved
  onDone: (assistantMsg: any) => void,   // called when stream ends
  onError: () => void
) => {
  const res = await fetch(`${BASE_URL}/chats/${chatId}/msgs`, {
    method: 'POST',
    headers: authHeader(),
    body: JSON.stringify({ content }),
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