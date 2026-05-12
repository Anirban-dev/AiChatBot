import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface MarkdownRendererProps {
  content: string
  isUser: boolean
}

// Internal Terminal Component for Bash Blocks
const BashTerminal = ({ children }: { children: React.ReactNode }) => (
  <div className="my-2 rounded-md overflow-hidden border border-gray-800 bg-[#0d1117] font-mono text-[13px] shadow-sm w-full">
    <div className="flex items-center justify-between bg-[#161b22] px-2.5 py-1 border-b border-gray-800/50">
      <div className="flex gap-1">
        <div className="w-2 h-2 rounded-full bg-[#ff5f56]/80" />
        <div className="w-2 h-2 rounded-full bg-[#ffbd2e]/80" />
        <div className="w-2 h-2 rounded-full bg-[#27c93f]/80" />
      </div>
      <span className="text-gray-500 text-[9px] uppercase font-semibold">bash</span>
    </div>
    <div className="px-3 py-2 overflow-x-auto leading-relaxed">
      <div className="flex gap-2">
        <span className="text-pink-500/90 select-none">$</span>
        <code className="text-gray-200 whitespace-pre-wrap flex-1">{children}</code>
      </div>
    </div>
  </div>
)

const MarkdownRenderer = ({ content, isUser }: MarkdownRendererProps) => {
  return (
    <div className={`prose prose-sm max-w-none ${isUser ? 'text-white' : 'dark:text-gray-100'}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Handle Code Blocks
          code({ node, inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '')
            const language = match ? match[1] : ''

            // If it's a bash block
            if (!inline && ['bash', 'sh', 'shell'].includes(language)) {
              return <BashTerminal>{String(children).replace(/\n$/, '')}</BashTerminal>
            }

            // Default Code Block (Python, JS, etc.)
            return inline ? (
              <code className={`px-1 rounded font-mono ${isUser ? 'bg-white/20' : 'bg-black/10 dark:bg-white/10 text-pink-500'}`} {...props}>
                {children}
              </code>
            ) : (
              <pre className="bg-gray-800 text-gray-100 p-3 rounded-lg overflow-x-auto my-2 font-mono border border-gray-700">
                <code className={className} {...props}>
                  {children}
                </code>
              </pre>
            )
          },
          // Customize other markdown elements to be tighter
          p: ({ children }) => <p className="m-0 leading-relaxed">{children}</p>,
          strong: ({ children }) => <strong className={`font-bold ${isUser ? 'text-white' : 'text-blue-500 dark:text-blue-400'}`}>{children}</strong>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

export default MarkdownRenderer