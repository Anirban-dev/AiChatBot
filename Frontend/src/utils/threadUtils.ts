import type { Message } from '../Context/ChatContext'

/** Get effective threadHeadId for a message. */
export function getEffectiveThreadHeadId(messages: Message[], msg: Message): string | null {
  if (!msg.threadRootId) return null
  if (msg.threadHeadId) return msg.threadHeadId

  let curr: Message | undefined = msg
  while (curr) {
    if (String(curr.parentId) === String(msg.threadRootId) || !curr.parentId) {
      return curr.threadHeadId || curr._id
    }
    const parentId: string | null = curr.parentId ?? null
    if (!parentId) break
    const parent: Message | undefined = messages.find((m) => String(m._id) === String(parentId))
    if (!parent || String(parent.threadRootId) !== String(msg.threadRootId)) {
      return curr.threadHeadId || curr._id
    }
    curr = parent
  }
  return msg._id
}

/** Distinct thread heads for an anchor — each represents a separate thread conversation. */
export function getThreadHeads(messages: Message[], anchorId: string): Message[] {
  const threadMsgs = messages.filter((m) => String(m.threadRootId) === String(anchorId))
  const headMap = new Map<string, Message>()

  for (const m of threadMsgs) {
    const headId = getEffectiveThreadHeadId(messages, m)
    if (!headId) continue
    if (!headMap.has(headId)) {
      const headMsg = messages.find((x) => String(x._id) === String(headId)) || m
      headMap.set(headId, headMsg)
    }
  }

  return Array.from(headMap.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )
}

/** Walk to the leaf descendant within a thread subtree. */
export function getThreadLeafId(messages: Message[], startId: string, threadRootId: string): string {
  const headId = getEffectiveThreadHeadId(messages, messages.find(m => m._id === startId) || { _id: startId, threadRootId } as Message)
  const threadMsgs = messages.filter((m) =>
    String(m.threadRootId) === String(threadRootId) &&
    getEffectiveThreadHeadId(messages, m) === headId
  )
  let currentId = startId
  while (true) {
    const children = threadMsgs.filter((m) => String(m.parentId) === String(currentId))
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
  const head = messages.find((m) => String(m._id) === String(threadHeadId))
  if (!head?.threadRootId) return []

  const threadRootId = String(head.threadRootId)
  const effectiveHeadId = getEffectiveThreadHeadId(messages, head) || threadHeadId

  const threadMsgs = messages.filter(
    (m) => String(m.threadRootId) === threadRootId && getEffectiveThreadHeadId(messages, m) === effectiveHeadId
  )

  if (threadMsgs.length === 0) return []

  let leafId = activeNodeId
  if (!leafId || !threadMsgs.some((m) => String(m._id) === String(leafId))) {
    leafId = getThreadLeafId(messages, threadHeadId, threadRootId)
  }

  const path: Message[] = []
  let currentId: string | null = leafId
  while (currentId) {
    const msg = threadMsgs.find((m) => String(m._id) === String(currentId))
    if (!msg) break
    path.unshift(msg)
    if (String(msg._id) === String(effectiveHeadId) || String(msg.parentId) === threadRootId) break
    currentId = msg.parentId ?? null
  }
  return path
}
