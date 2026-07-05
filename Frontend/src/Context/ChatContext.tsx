// src/context/ChatContext.tsx
import { createContext, useContext, useState } from 'react'

interface FileMetadata {
    name: string,
    size: number,
    mimeType: string,
    extension: string,
}

export interface ToolCall {
  id: string
  name: string
  status: 'running' | 'completed' | 'failed'
  result?: string
  error?: string
}

export interface Message {
  _id: string
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  fileInfo?: FileMetadata
  toolCalls?: ToolCall[]
  createdAt: string
}

interface ChatContextType {
  getMessages: (chatId: string) => Message[]
  setMessages: (chatId: string, msgs: Message[]) => void
  appendMessage: (chatId: string, msg: Message) => void
  updateMessage: (chatId: string, msgId: string, update: Partial<Message>) => void
  removeMessage: (chatId: string, msgId: string) => void
  appendToken: (chatId: string, msgId: string, token: string) => void
  appendReasoningToken: (chatId: string, msgId: string, token: string) => void
  updateToolCall: (chatId: string, msgId: string, toolCall: ToolCall) => void
  setLoading: (chatId: string, val: boolean) => void
  isLoading: (chatId: string) => boolean
}

const ChatContext = createContext<ChatContextType | null>(null)

export const ChatProvider = ({ children }: { children: React.ReactNode }) => {
  const [loadingChats, setLoadingChats] = useState<Record<string, boolean>>({})
  
  const setLoading = (chatId: string, val: boolean) => {
    setLoadingChats(prev => ({ ...prev, [chatId]: val }))
  }
  
  const isLoading = (chatId: string) => loadingChats[chatId] || false

  const [store, setStore] = useState<Record<string, Message[]>>({})

  const getMessages = (chatId: string) => store[chatId] || []

  const setMessages = (chatId: string, msgs: Message[]) => {
    setStore(prev => ({ ...prev, [chatId]: msgs }))
  }

  const appendMessage = (chatId: string, msg: Message) => {
    setStore(prev => ({
      ...prev,
      [chatId]: [...(prev[chatId] || []), msg]
    }))
  }

  const updateMessage = (chatId: string, msgId: string, update: Partial<Message>) => {
    setStore(prev => ({
      ...prev,
      [chatId]: (prev[chatId] || []).map(m =>
        m._id === msgId ? { ...m, ...update } : m
      )
    }))
  }

  const removeMessage = (chatId: string, msgId: string) => {
    setStore(prev => ({
      ...prev,
      [chatId]: (prev[chatId] || []).filter(m => m._id !== msgId)
    }))
  }

  const appendToken = (chatId: string, msgId: string, token: string) => {
    setStore(prev => {
      const msgs = prev[chatId] || []
      const exists = msgs.find(m => m._id === msgId)
      if (exists) {
        return {
          ...prev,
          [chatId]: msgs.map(m =>
            m._id === msgId ? { ...m, content: m.content + token } : m
          )
        }
      } else {
        return {
          ...prev,
          [chatId]: [...msgs, {
            _id: msgId,
            role: 'assistant',
            content: token,
            createdAt: new Date().toISOString(),
          }]
        }
      }
    })
  }

  const appendReasoningToken = (chatId: string, msgId: string, token: string) => {
    setStore(prev => {
      const msgs = prev[chatId] || []
      const exists = msgs.find(m => m._id === msgId)
      if (exists) {
        return {
          ...prev,
          [chatId]: msgs.map(m =>
            m._id === msgId ? { ...m, reasoning: (m.reasoning || '') + token } : m
          )
        }
      } else {
        return {
          ...prev,
          [chatId]: [...msgs, {
            _id: msgId,
            role: 'assistant',
            content: '',
            reasoning: token,
            createdAt: new Date().toISOString(),
          }]
        }
      }
    })
  }

  const updateToolCall = (chatId: string, msgId: string, toolCall: ToolCall) => {
    setStore(prev => {
      const msgs = prev[chatId] || []
      return {
        ...prev,
        [chatId]: msgs.map(m => {
          if (m._id !== msgId) return m
          const existingCalls = m.toolCalls || []
          const existingIdx = existingCalls.findIndex(tc => tc.id === toolCall.id)
          const updatedCalls = existingIdx > -1
            ? existingCalls.map((tc, i) => i === existingIdx ? toolCall : tc)
            : [...existingCalls, toolCall]
          return { ...m, toolCalls: updatedCalls }
        })
      }
    })
  }

  return (
    <ChatContext.Provider value={{
      getMessages, setMessages, appendMessage,
      updateMessage, removeMessage, appendToken, appendReasoningToken, updateToolCall, setLoading, isLoading
    }}>
      {children}
    </ChatContext.Provider>
  )
}

export const useChatStore = () => {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error('useChatStore must be used within ChatProvider')
  return ctx
}