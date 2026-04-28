import { useRef, useEffect } from 'react'
import { Send, Square } from 'lucide-react'
import { getMsgs } from '../API/Msg'
import { useSendMessage } from './Hook/SendMessage'
import { useChatStore } from '../Context/ChatContext'

const Msg = ({ chatId }: { chatId: string }) => {
  const { getMessages, setMessages } = useChatStore()

  const messages = getMessages(chatId)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { input, setInput, sendMessage, stopGeneration, loading } = useSendMessage(chatId)

  // Auto-scroll to bottom on new message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [input])

  // Get all messages
  useEffect(() => {
    if (!chatId) return
    if (getMessages(chatId).length > 0) return
    const fetchMsgs = async () => {
      try {
        const data = await getMsgs(chatId)
        setMessages(chatId, data)
      } catch (err) {
        console.error(err)
      }
    }
    fetchMsgs()
  }, [chatId])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="flex flex-col h-full">

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4 ">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-[95%]">
            <p className="text-gray-400 dark:text-gray-500 text-sm">
              Start a conversation...
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg._id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[75%] px-4 py-2 rounded-2xl text-sm leading-relaxed
                ${msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-sm'
                  : 'bg-gray-100 dark:bg-gray-700 text-black dark:text-white rounded-bl-sm'
                }`}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
              <p className={`text-xs mt-1 ${msg.role === 'user' ? 'text-blue-200' : 'text-gray-400'}`}>
                {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 dark:bg-gray-700 px-4 py-3 rounded-2xl rounded-bl-sm">
              <div className="flex gap-1 items-center">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-end gap-2 bg-gray-100 dark:bg-gray-800 rounded-2xl px-4 py-2">
          <div
            className='cursor-pointer text-2xl'
            // onCmaick={}
          >+</div>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
            rows={1}
            className="flex-1 bg-transparent resize-none outline-none text-sm 
              text-black dark:text-white placeholder-gray-400 max-h-40 py-1"
          />
          {/* Send or stop button */}
          {loading ? (
            <button
              onClick={stopGeneration}
              className="mb-1 p-1.5 rounded-lg bg-red-500 hover:bg-red-600 transition text-white cursor-pointer"
            >
              <Square size={16} fill="white" />
            </button>
          ) : (
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              className="mb-1 p-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 
                disabled:opacity-40 disabled:cursor-not-allowed transition text-white"
            >
              <Send size={16} />
            </button>
          )}
        </div>
      </div>

    </div>
  )
}

export default Msg