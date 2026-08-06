// src/API/Msg.ts
import api from "../Auth/AxiosHelper"
import { fetchWithRefresh, authHeader } from "../Auth/FetchHelper"

const BASE_URL = import.meta.env.VITE_BASE_URL

export const getMsgs = async (chatId: string) => {
  const res = await api.get(`/chats/${chatId}/msgs`)
  return res.data
}

export const sendMsg = async (
  chatId: string,
  content: string,
  model: 'small' | 'large' | 'thinking' | 'critiq',
  onToken: (token: string) => void,
  onUserMessage: (msg: any) => void,
  onToolCall: (payload: { tool: string; status: string }) => void,
  onDone: (assistantMsg: any) => void,
  onError: (errData: { type?: string; message: string; threadRootId?: string | null }) => void,
  signal: AbortSignal,
  onReasoning?: (reasoning: string) => void,
  fileInfo?: any,
  file?: string,
  parentId?: string,
  threadRootId?: string
) => {
  const res = await fetchWithRefresh(`${BASE_URL}/chats/${chatId}/msgs`, {
    method: 'POST',
    headers: authHeader(),
    body: JSON.stringify({ content, model, fileInfo, file, parentId, threadRootId }),
    signal,
  })

  if (!res.ok) {
    let errorMessage = 'An unexpected server error occurred.'
    let errorType = 'SERVER_ERROR'

    try {
      const errBody = await res.json()
      errorMessage = errBody.error ?? errBody.message ?? errorMessage
      if (res.status === 429) {
        errorType = 'QUOTA_EXHAUSTED'
      }
    } catch {
      try {
        const text = await res.text()
        if (text) errorMessage = text
      } catch {}
    }

    onError({ type: errorType, message: errorMessage })
    return
  }

  if (!res.body) throw new Error('No response body')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  
  let buffer = ''
  let currentEvent = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      if (trimmed.startsWith('event:')) {
        currentEvent = trimmed.slice(6).trim()
      } else if (trimmed.startsWith('data:')) {
        const rawData = trimmed.slice(5).trim()
        
        try {
          const parsed = JSON.parse(rawData)

          switch (currentEvent) {
            case 'userMessage':
              onUserMessage(parsed)
              break
            case 'token':
              onToken(parsed.token)
              break
            case 'reasoning':
              if (onReasoning) {
                onReasoning(parsed.token)
              }
              break
            case 'tool':
              onToolCall(parsed)
              break
            case 'done':
              onDone(parsed)
              break
            case 'error':
              onError({
                type: parsed.type ?? 'STREAM_INTERRUPTED',
                message: parsed.message ?? 'An unexpected generation failure occurred.',
                threadRootId: parsed.threadRootId
              })
              break
            default:
              if (parsed.token) onToken(parsed.token)
          }
        } catch (e) {
          console.error('Failed to parse SSE payload token chunk:', rawData, e)
        }
        
        currentEvent = ''
      }
    }
  }
}

export const stopMsg = async (chatId: string) => {
  const res = await api.post(`/chats/${chatId}/msgs/stop`)
  return res.data
}

export const deleteThread = async (chatId: string, threadHeadId: string) => {
  const res = await api.delete(`/chats/${chatId}/msgs/threads/${threadHeadId}`)
  return res.data
}

export const branchMsg = async (
  chatId: string,
  msgId: string,
  content: string,
  model: 'small' | 'large' | 'thinking' | 'critiq',
  onToken: (token: string) => void,
  onUserMessage: (msg: any) => void,
  onToolCall: (payload: { tool: string; status: string }) => void,
  onDone: (assistantMsg: any) => void,
  onError: (errData: { type?: string; message: string }) => void,
  signal: AbortSignal,
  onReasoning?: (reasoning: string) => void,
  fileInfo?: any,
  file?: string,
) => {
  const res = await fetchWithRefresh(`${BASE_URL}/chats/${chatId}/msgs/${msgId}/branch`, {
    method: 'POST',
    headers: authHeader(),
    body: JSON.stringify({ content, model, fileInfo, file }),
    signal,
  })

  if (!res.ok) {
    let errorMessage = 'An unexpected server error occurred.'
    let errorType = 'SERVER_ERROR'
    try {
      const errBody = await res.json()
      errorMessage = errBody.error ?? errBody.message ?? errorMessage
      if (res.status === 429) errorType = 'QUOTA_EXHAUSTED'
    } catch {
      try {
        const text = await res.text()
        if (text) errorMessage = text
      } catch {}
    }
    onError({ type: errorType, message: errorMessage })
    return
  }

  if (!res.body) throw new Error('No response body')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let currentEvent = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      if (trimmed.startsWith('event:')) {
        currentEvent = trimmed.slice(6).trim()
      } else if (trimmed.startsWith('data:')) {
        const rawData = trimmed.slice(5).trim()
        try {
          const parsed = JSON.parse(rawData)
          switch (currentEvent) {
            case 'userMessage': onUserMessage(parsed); break
            case 'token':       onToken(parsed.token); break
            case 'reasoning':   onReasoning?.(parsed.token); break
            case 'tool':        onToolCall(parsed); break
            case 'done':        onDone(parsed); break
            case 'error':
              onError({
                type: parsed.type ?? 'STREAM_INTERRUPTED',
                message: parsed.message ?? 'An unexpected generation failure occurred.',
              })
              break
            default:
              if (parsed.token) onToken(parsed.token)
          }
        } catch (e) {
          console.error('Failed to parse branch SSE chunk:', rawData, e)
        }
        currentEvent = ''
      }
    }
  }
}
