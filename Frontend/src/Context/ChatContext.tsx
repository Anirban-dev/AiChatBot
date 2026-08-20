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
  threadHeadId?: string | null
  threadReplyCount?: number
  failed?: boolean
}

interface ChatContextType {
  getMessages: (chatId: string) => Message[]
  setMessages: (chatId: string, msgs: Message[]) => void
  appendMessage: (chatId: string, msg: Message) => void
  updateMessage: (chatId: string, msgId: string, update: Partial<Message>) => void
  removeMessage: (chatId: string, msgId: string) => void
  removeMessages: (chatId: string, msgIds: string[]) => void
  appendToken: (chatId: string, msgId: string, token: string, threadRootId?: string | null, parentId?: string | null) => void
  appendReasoningToken: (chatId: string, msgId: string, token: string, threadRootId?: string | null, parentId?: string | null) => void
  updateToolCall: (chatId: string, msgId: string, toolCall: ToolCall, threadRootId?: string | null, parentId?: string | null) => void
  setLoading: (chatId: string, val: boolean) => void
  isLoading: (chatId: string) => boolean
  getActivePath: (chatId: string, activeNodeId: string) => Message[]
  setActiveNodeId: (chatId: string, nodeId: string) => void
  activeNodeId: (chatId: string) => string | null
  getBranchInfo: (chatId: string, nodeId: string, scopeThreadRootId?: string | null) => { branchCount: number; currentIndex: number }
  switchBranch: (chatId: string, currentMsgId: string, direction: 'prev' | 'next', scopeThreadRootId?: string | null) => void
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
  
  // Initialize messages from localStorage or use empty object
  const [store, setStore] = useState<Record<string, any>>(() => {
    try {
      const saved = localStorage.getItem('chatMessages')
      return saved ? JSON.parse(saved) : {}
    } catch (error) {
      console.error('Failed to load messages from localStorage:', error)
      return {}
    }
  })
  
  // Re-export the Message type for backward compatibility
  type MessageType = {
    _id: string
    role: 'user' | 'assistant'
    content: string
    reasoning?: string
    fileInfo?: {
      name: string
      size: number
      mimeType: string
      extension: string
    }
    file?: string
    toolCalls?: Array<{
      id: string
      name: string
      status: 'running' | 'completed' | 'failed'
      result?: string
      error?: string
    }>
    createdAt: string
    parentId?: string | null
    threadRootId?: string | null
    threadHeadId?: string | null
    threadReplyCount?: number
  }
  
  const setLoading = (chatId: string, val: boolean) => {
    setLoadingChats(prev => ({ ...prev, [chatId]: val }))
  }
  
  const isLoading = (chatId: string) => loadingChats[chatId] || false

  const getMessages = (chatId: string) => (store[chatId] as any) || []
  
  const saveToLocalStorage = (data: Record<string, any>) => {
    try {
      localStorage.setItem('chatMessages', JSON.stringify(data))
    } catch (error) {
      console.error('Failed to save messages to localStorage:', error)
    }
  }

  const setMessages = (chatId: string, msgs: any[]) => {
    setStore(prev => {
      const updated = { ...prev, [chatId]: msgs }
      saveToLocalStorage(updated)
      return updated
    })
    if (msgs.length > 0) {
      const mainMsgs = msgs.filter((m: any) => !m.threadRootId)
      if (mainMsgs.length > 0) {
        // Find leaves (messages that are not parents of any other main message)
        const parentIds = new Set(mainMsgs.map((m: any) => m.parentId ? String(m.parentId) : null).filter(Boolean))
        const leaves = mainMsgs.filter((m: any) => !parentIds.has(String(m._id)))
        const activeLeaf = leaves.length > 0 ? leaves[leaves.length - 1] : mainMsgs[mainMsgs.length - 1]
        setActiveNodeIds((prev: any) => ({ ...prev, [chatId]: String(activeLeaf._id) }))
      } else {
        setActiveNodeIds((prev: any) => ({ ...prev, [chatId]: String(msgs[msgs.length - 1]._id) }))
      }
    }
  }

  const appendMessage = (chatId: string, msg: any) => {
    setStore(prev => {
      const updated = {
        ...prev,
        [chatId]: [...(prev[chatId] || []), msg]
      }
      saveToLocalStorage(updated)
      return updated
    })
    if (!msg.threadRootId && msg._id) {
      setActiveNodeIds(prev => ({ ...prev, [chatId]: String(msg._id) }))
    }
  }

  const updateMessage = (chatId: string, msgId: string, update: any) => {
    const newId = update._id && update._id !== msgId ? String(update._id) : null
    setStore(prev => {
      const msgs = prev[chatId] || []
      const updatedList = msgs.map((m: any) => {
        if (m._id === msgId) {
          return { ...m, ...update }
        }
        let item = m
        if (newId && item.parentId === msgId) {
          item = { ...item, parentId: newId }
        }
        if (newId && item.threadHeadId === msgId) {
          item = { ...item, threadHeadId: newId }
        }
        return item
      })
      const updated = {
        ...prev,
        [chatId]: updatedList
      }
      saveToLocalStorage(updated)
      return updated
    })
    if (newId) {
      setActiveNodeIds(prev => prev[chatId] === msgId ? { ...prev, [chatId]: newId } : prev)
    }
  }

  const removeMessage = (chatId: string, msgId: string) => {
    setStore(prev => {
      const msgs = prev[chatId] || []
      const removed = msgs.find((m: any) => m._id === msgId)
      const updatedList = msgs.filter((m: any) => m._id !== msgId)
      const updated = {
        ...prev,
        [chatId]: updatedList
      }
      saveToLocalStorage(updated)
      return updated
    })
    setActiveNodeIds(prev => {
      if (prev[chatId] === msgId) {
        // Fall back to the parent or previous message if active node was removed
        const msgs = store[chatId] || []
        const removed = msgs.find((m: any) => m._id === msgId)
        const fallbackId = removed?.parentId || (msgs.length > 1 ? msgs[msgs.length - 2]._id : null)
        return { ...prev, [chatId]: fallbackId }
      }
      return prev
    })
  }

  const removeMessages = (chatId: string, msgIds: string[]) => {
    const setIds = new Set(msgIds)
    setStore(prev => {
      const updated = {
        ...prev,
        [chatId]: (prev[chatId] || []).filter((m: any) => !setIds.has(m._id))
      }
      saveToLocalStorage(updated)
      return updated
    })
  }

  const appendToken = (
    chatId: string,
    msgId: string,
    token: string,
    explicitThreadRootId?: string | null,
    explicitParentId?: string | null
  ) => {
    let isThread = false
    setStore(prev => {
      const msgs = prev[chatId] || []
      const exists = msgs.find((m: MessageType) => m._id === msgId)
      if (exists) {
        isThread = !!exists.threadRootId
        return {
          ...prev,
          [chatId]: msgs.map((m: MessageType) =>
            m._id === msgId ? { ...m, content: m.content + token } : m
          )
        }
      } else {
        const lastMsg = msgs[msgs.length - 1]
        const threadRootId = explicitThreadRootId !== undefined ? explicitThreadRootId : (lastMsg?.threadRootId || null)
        const parentId = explicitParentId !== undefined ? explicitParentId : (lastMsg ? lastMsg._id : null)
        isThread = !!threadRootId
        const parentMsg = msgs.find((m: MessageType) => m._id === parentId)
        const threadHeadId = threadRootId ? (parentMsg?.threadHeadId || (String(parentId) === String(threadRootId) ? msgId : parentId)) : null
        return {
          ...prev,
          [chatId]: [...msgs, {
            _id: msgId,
            role: 'assistant',
            content: token,
            parentId,
            threadRootId,
            threadHeadId,
            createdAt: new Date().toISOString(),
          }]
        }
      }
    })
    if (!isThread) {
      setActiveNodeIds(prev => ({ ...prev, [chatId]: msgId }))
    }
  }

  const appendReasoningToken = (
    chatId: string,
    msgId: string,
    token: string,
    explicitThreadRootId?: string | null,
    explicitParentId?: string | null
  ) => {
    let isThread = false
    setStore(prev => {
      const msgs = prev[chatId] || []
      const exists = msgs.find((m: MessageType) => m._id === msgId)
      if (exists) {
        isThread = !!exists.threadRootId
        return {
          ...prev,
          [chatId]: msgs.map((m: MessageType) =>
            m._id === msgId ? { ...m, reasoning: (m.reasoning || '') + token } : m
          )
        }
      } else {
        const lastMsg = msgs[msgs.length - 1]
        const threadRootId = explicitThreadRootId !== undefined ? explicitThreadRootId : (lastMsg?.threadRootId || null)
        const parentId = explicitParentId !== undefined ? explicitParentId : (lastMsg ? lastMsg._id : null)
        isThread = !!threadRootId
        const parentMsg = msgs.find((m: MessageType) => m._id === parentId)
        const threadHeadId = threadRootId ? (parentMsg?.threadHeadId || (String(parentId) === String(threadRootId) ? msgId : parentId)) : null
        return {
          ...prev,
          [chatId]: [...msgs, {
            _id: msgId,
            role: 'assistant',
            content: '',
            reasoning: token,
            parentId,
            threadRootId,
            threadHeadId,
            createdAt: new Date().toISOString(),
          }]
        }
      }
    })
    if (!isThread) {
      setActiveNodeIds(prev => ({ ...prev, [chatId]: msgId }))
    }
  }

  const updateToolCall = (
    chatId: string,
    msgId: string,
    toolCall: ToolCall,
    explicitThreadRootId?: string | null,
    explicitParentId?: string | null
  ) => {
    let isThread = false
    setStore(prev => {
      const msgs = prev[chatId] || []
      const existingIdx = msgs.findIndex((m: MessageType) => m._id === msgId)
      if (existingIdx > -1) {
        isThread = !!msgs[existingIdx].threadRootId
        return {
          ...prev,
          [chatId]: msgs.map((m: MessageType) => {
            if (m._id !== msgId) return m
            const existingCalls = m.toolCalls || []
            const tcIdx = existingCalls.findIndex((tc: ToolCall) => tc.id === toolCall.id)
            const updatedCalls = tcIdx > -1
              ? existingCalls.map((tc: ToolCall, i: number) => i === tcIdx ? toolCall : tc)
              : [...existingCalls, toolCall]
            return { ...m, toolCalls: updatedCalls }
          })
        }
      } else {
        const lastMsg = msgs[msgs.length - 1]
        const threadRootId = explicitThreadRootId !== undefined ? explicitThreadRootId : (lastMsg?.threadRootId || null)
        const parentId = explicitParentId !== undefined ? explicitParentId : (lastMsg ? lastMsg._id : null)
        isThread = !!threadRootId
        const parentMsg = msgs.find((m: MessageType) => m._id === parentId)
        const threadHeadId = threadRootId ? (parentMsg?.threadHeadId || (String(parentId) === String(threadRootId) ? msgId : parentId)) : null
        return {
          ...prev,
          [chatId]: [...msgs, {
            _id: msgId,
            role: 'assistant',
            content: '',
            parentId,
            threadRootId,
            threadHeadId,
            toolCalls: [toolCall],
            createdAt: new Date().toISOString(),
          }]
        }
      }
    })
    if (!isThread) {
      setActiveNodeIds(prev => ({ ...prev, [chatId]: msgId }))
    }
  }

  const setActiveNodeId = (chatId: string, nodeId: string) => {
    setActiveNodeIds(prev => ({ ...prev, [chatId]: nodeId }))
  }

  const activeNodeId = (chatId: string) => activeNodeIds[chatId] || null

  const getActivePath = (chatId: string, activeNodeId: string): Message[] => {
    const msgs = store[chatId] || []
    const mainMsgs = msgs.filter((m: MessageType) => !m.threadRootId)
    if (mainMsgs.length === 0) return []

    let targetId = activeNodeId
    if (!targetId || !msgs.some((m: MessageType) => m._id === targetId)) {
      const lastMsg = mainMsgs[mainMsgs.length - 1]
      targetId = lastMsg._id
    }
    
    const path: Message[] = []
    const visited = new Set<string>()
    let currentId: string | null = targetId
    
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId)
      const msg = msgs.find((m: MessageType) => m._id === currentId)
      if (!msg) break
      
      // Do not include thread messages in main timeline active path
      if (!msg.threadRootId) {
        path.unshift(msg)
      }

      currentId = msg.parentId || null
    }
    
    return path
  }

  const sameScope = (a: Message, b: Message, scopeThreadRootId?: string | null) => {
    if (scopeThreadRootId) {
      const sameHead = (a.threadHeadId && b.threadHeadId)
        ? String(a.threadHeadId) === String(b.threadHeadId)
        : true
      return String(a.threadRootId) === String(scopeThreadRootId) &&
        String(b.threadRootId) === String(scopeThreadRootId) &&
        sameHead
    }
    return !a.threadRootId && !b.threadRootId
  }

  const getBranchInfo = (
    chatId: string,
    nodeId: string,
    scopeThreadRootId?: string | null
  ): { branchCount: number; currentIndex: number } => {
    const msgs = store[chatId] || []
    const msg = msgs.find((m: MessageType) => m._id === nodeId)
    if (!msg) return { branchCount: 0, currentIndex: 0 }

    const siblings = msgs.filter((m: MessageType) =>
      m.role === msg.role &&
      (m.parentId === msg.parentId || (!m.parentId && !msg.parentId)) &&
      sameScope(m, msg, scopeThreadRootId)
    )
    if (siblings.length <= 1) {
      return { branchCount: 0, currentIndex: 0 }
    }

    const currentIndex = siblings.findIndex((s: MessageType) => s._id === nodeId)
    return {
      branchCount: siblings.length,
      currentIndex: currentIndex + 1
    }
  }

  const switchBranch = (
    chatId: string,
    currentMsgId: string,
    direction: 'prev' | 'next',
    scopeThreadRootId?: string | null
  ) => {
    const msgs = store[chatId] || []
    const msg = msgs.find((m: MessageType) => m._id === currentMsgId)
    if (!msg) return

    const siblings = msgs.filter((m: MessageType) =>
      m.role === msg.role &&
      (m.parentId === msg.parentId || (!m.parentId && !msg.parentId)) &&
      sameScope(m, msg, scopeThreadRootId)
    )
    if (siblings.length <= 1) return

    const currentIndex = siblings.findIndex((s: MessageType) => s._id === currentMsgId)
    let newIndex = currentIndex

    if (direction === 'prev') {
      newIndex = currentIndex > 0 ? currentIndex - 1 : siblings.length - 1
    } else {
      newIndex = currentIndex < siblings.length - 1 ? currentIndex + 1 : 0
    }

    const targetSibling = siblings[newIndex]

    let currentId = targetSibling._id
    while (true) {
      const children = msgs.filter((m: MessageType) =>
        m.parentId === currentId && sameScope(m, targetSibling, scopeThreadRootId)
      )
      if (children.length === 0) break
      currentId = children[children.length - 1]._id
    }

    if (scopeThreadRootId) return
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
      updateMessage, removeMessage, removeMessages, appendToken, appendReasoningToken, updateToolCall, setLoading, isLoading,
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