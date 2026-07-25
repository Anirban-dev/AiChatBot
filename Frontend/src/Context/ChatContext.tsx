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
  file?: string | undefined
  toolCalls?: ToolCall[]
  createdAt: string
  parentId?: string | null
  threadRootId?: string | null
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
  getActivePath: (chatId: string, activeNodeId: string) => Message[]
  setActiveNodeId: (chatId: string, nodeId: string) => void
  activeNodeId: (chatId: string) => string | null
  getBranchInfo: (chatId: string, nodeId: string) => { branchCount: number; currentIndex: number }
  switchBranch: (chatId: string, currentMsgId: string, direction: 'prev' | 'next') => void
  // Search-branch navigation: store a pending message ID to activate after messages load
  setPendingActiveMsgId: (chatId: string, msgId: string) => void
  pendingActiveMsgId: (chatId: string) => string | null
  clearPendingActiveMsgId: (chatId: string) => void
}

const ChatContext = createContext<ChatContextType | null>(null)

export const ChatProvider = ({ children }: { children: React.ReactNode }) => {
  const [loadingChats, setLoadingChats] = useState<Record<string, boolean>>({})
  const [activeNodeIds, setActiveNodeIds] = useState<Record<string, string | null>>({})
  const [pendingActiveMsgIds, setPendingActiveMsgIds] = useState<Record<string, string | null>>({})
  
  const setLoading = (chatId: string, val: boolean) => {
    setLoadingChats(prev => ({ ...prev, [chatId]: val }))
  }
  
  const isLoading = (chatId: string) => loadingChats[chatId] || false

  const [store, setStore] = useState<Record<string, Message[]>>({})

  const getMessages = (chatId: string) => store[chatId] || []

  const setMessages = (chatId: string, msgs: Message[]) => {
    setStore(prev => ({ ...prev, [chatId]: msgs }))
    if (msgs.length > 0) {
      const lastMsg = msgs[msgs.length - 1]
      setActiveNodeIds(prev => ({ ...prev, [chatId]: lastMsg._id }))
    }
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

  const setActiveNodeId = (chatId: string, nodeId: string) => {
    setActiveNodeIds(prev => ({ ...prev, [chatId]: nodeId }))
  }

  const activeNodeId = (chatId: string) => activeNodeIds[chatId] || null

  const getActivePath = (chatId: string, activeNodeId: string): Message[] => {
    const msgs = store[chatId] || []
    if (!activeNodeId) {
      if (msgs.length === 0) return []
      const lastMsg = msgs[msgs.length - 1]
      return getActivePath(chatId, lastMsg._id)
    }
    
    const path: Message[] = []
    let currentId: string | null = activeNodeId
    
    while (currentId) {
      const msg = msgs.find(m => m._id === currentId)
      if (!msg) break
      
      path.unshift(msg)
      currentId = msg.parentId || null
    }
    
    return path
  }

  const getBranchInfo = (chatId: string, nodeId: string): { branchCount: number; currentIndex: number } => {
    const msgs = store[chatId] || []
    const msg = msgs.find(m => m._id === nodeId)
    if (!msg) return { branchCount: 0, currentIndex: 0 }
    
    const siblings = msgs.filter(m => m.role === msg.role && (m.parentId === msg.parentId || (!m.parentId && !msg.parentId)))
    if (siblings.length <= 1) {
      return { branchCount: 0, currentIndex: 0 }
    }
    
    const currentIndex = siblings.findIndex(s => s._id === nodeId)
    return {
      branchCount: siblings.length,
      currentIndex: currentIndex + 1
    }
  }

  const switchBranch = (chatId: string, currentMsgId: string, direction: 'prev' | 'next') => {
    const msgs = store[chatId] || []
    const msg = msgs.find(m => m._id === currentMsgId)
    if (!msg) return
    
    const siblings = msgs.filter(m => m.role === msg.role && (m.parentId === msg.parentId || (!m.parentId && !msg.parentId)))
    if (siblings.length <= 1) return
    
    const currentIndex = siblings.findIndex(s => s._id === currentMsgId)
    let newIndex = currentIndex
    
    if (direction === 'prev') {
      newIndex = currentIndex > 0 ? currentIndex - 1 : siblings.length - 1
    } else {
      newIndex = currentIndex < siblings.length - 1 ? currentIndex + 1 : 0
    }
    
    const targetSibling = siblings[newIndex]
    
    let currentId = targetSibling._id
    while (true) {
      const children = msgs.filter(m => m.parentId === currentId)
      if (children.length === 0) break
      currentId = children[children.length - 1]._id
    }
    
    setActiveNodeId(chatId, currentId)
  }

  const setPendingActiveMsgId = (chatId: string, msgId: string) =>
    setPendingActiveMsgIds(prev => ({ ...prev, [chatId]: msgId }))

  const pendingActiveMsgId = (chatId: string) => pendingActiveMsgIds[chatId] || null

  const clearPendingActiveMsgId = (chatId: string) =>
    setPendingActiveMsgIds(prev => ({ ...prev, [chatId]: null }))

  return (
    <ChatContext.Provider value={{
      getMessages, setMessages, appendMessage,
      updateMessage, removeMessage, appendToken, appendReasoningToken, updateToolCall, setLoading, isLoading,
      getActivePath, setActiveNodeId, activeNodeId, getBranchInfo, switchBranch,
      setPendingActiveMsgId, pendingActiveMsgId, clearPendingActiveMsgId
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