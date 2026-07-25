import type { Message } from '../Context/ChatContext'

/** Direct replies to an anchor — each starts a separate thread conversation. */
export function getThreadHeads(messages: Message[], anchorId: string): Message[] {
  return messages
    .filter((m) => m.threadRootId === anchorId && m.parentId === anchorId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
}

/** Walk to the leaf descendant within a thread subtree. */
export function getThreadLeafId(messages: Message[], startId: string, threadRootId: string): string {
  const threadMsgs = messages.filter((m) => m.threadRootId === threadRootId)
  let currentId = startId
  while (true) {
    const children = threadMsgs.filter((m) => m.parentId === currentId)
    if (children.length === 0) break
    currentId = children[children.length - 1]._id
  }
  return currentId
}

/** Active path within a single thread chain (from head to leaf). */
export function getThreadPath(
  messages: Message[],
  threadHeadId: string,
  activeNodeId?: string | null
): Message[] {
  const head = messages.find((m) => m._id === threadHeadId)
  if (!head?.threadRootId) return []

  const threadRootId = head.threadRootId
  const threadMsgs = messages.filter((m) => m.threadRootId === threadRootId)

  let leafId = activeNodeId
  if (!leafId || !threadMsgs.some((m) => m._id === leafId)) {
    leafId = getThreadLeafId(messages, threadHeadId, threadRootId)
  }

  const path: Message[] = []
  let currentId: string | null = leafId
  while (currentId) {
    const msg = threadMsgs.find((m) => m._id === currentId)
    if (!msg) break
    path.unshift(msg)
    if (currentId === threadHeadId) break
    currentId = msg.parentId ?? null
  }
  return path
}
