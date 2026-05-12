import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface MarkdownRendererProps {
  content: string
  isUser: boolean
}

const BashTerminal = ({ children }: { children: React.ReactNode }) => (
  <div className="my-2 rounded-lg overflow-hidden border font-mono bg-gray-50 border-gray-200 text-black dark:bg-[#0d1117] dark:border-gray-700 dark:text-gray-300 shadow-md w-full">
    <div className="flex items-center justify-between bg-gray-100 border-gray-200 dark:bg-[#161b22] dark:border-gray-700/40 px-3 py-1.5 border-b">
      <div className="flex gap-1.5">
        <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]/80" />
        <div className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]/80" />
        <div className="w-2.5 h-2.5 rounded-full bg-[#27c93f]/80" />
      </div>
      <span className="text-gray-500 text-[9px] uppercase tracking-widest font-semibold">bash</span>
    </div>
    <div className="px-4 py-3 overflow-x-auto">
      <div className="flex gap-2 items-start">
        <span className="text-pink-500/90 select-none">$</span>
        <code className="text-gray-500 dark:text-gray-200 whitespace-pre-wrap break-words flex-1 leading-relaxed">{children}</code>
      </div>
    </div>
  </div>
)

const MarkdownRenderer = ({ content, isUser }: MarkdownRendererProps) => {
  // User bubble: always white text on colored bg
  // Assistant light mode: dark gray text
  // Assistant dark mode: light gray text
  const baseText = isUser
    ? 'text-white'
    : 'text-gray-800 dark:text-gray-100'

  return (
    <div className={`text-sm leading-relaxed ${baseText}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Block code — detect bash vs generic
          pre: ({ children }) => {
            const codeChild = React.Children.toArray(children)[0] as React.ReactElement<any>
            const className = codeChild?.props?.className ?? ''
            const match = /language-(\w+)/.exec(className)
            const language = match?.[1] ?? ''
            const codeText = String(codeChild?.props?.children ?? '').replace(/\n$/, '')

            if (['bash', 'sh', 'shell'].includes(language)) {
              return <BashTerminal>{codeText}</BashTerminal>
            }

            return (
              <pre className="
                bg-gray-100 text-gray-800 border-gray-200
                dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700/50
                px-4 py-3 rounded-lg overflow-x-auto my-2 font-mono text-[12.5px] border leading-relaxed
              ">
                {children}
              </pre>
            )
          },

          // Inline code
          code: ({ className, children, ...props }) => (
            <code
              className={`px-1.5 py-0.5 rounded text-[12px] font-mono ${isUser
                ? 'bg-white/25 text-white'
                : 'bg-gray-100 text-pink-600 border border-gray-200 dark:bg-gray-800/80 dark:text-pink-400 dark:border-gray-700/40'
                } ${className ?? ''}`}
              {...props}
            >
              {children}
            </code>
          ),

          p: ({ children }) => (
            <p className="mb-1.5 last:mb-0 leading-relaxed">{children}</p>
          ),

          strong: ({ children }) => (
            <strong className={`font-semibold ${isUser ? 'text-white' : 'text-blue-600 dark:text-blue-400'
              }`}>
              {children}
            </strong>
          ),

          em: ({ children }) => <em className="italic opacity-80">{children}</em>,

          h1: ({ children }) => <h1 className="text-base font-bold mt-3 mb-1 first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="text-sm font-bold mt-2.5 mb-1 first:mt-0">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-0.5 first:mt-0">{children}</h3>,

          ul: ({ children }) => (
            <ul className="list-disc list-outside pl-4 my-1 space-y-0.5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-outside pl-4 my-1 space-y-0.5">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,

          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-blue-400 pl-3 my-2 italic text-gray-500 dark:text-gray-400">
              {children}
            </blockquote>
          ),

          hr: () => <hr className="my-3 border-gray-200 dark:border-gray-700/50" />,

          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:text-blue-500 dark:hover:text-blue-300 transition-colors"
            >
              {children}
            </a>
          ),

          table: ({ children }) => (
            <div className="overflow-x-auto my-2 rounded-lg border border-gray-200 dark:border-gray-700/50">
              <table className="w-full text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-gray-100 dark:bg-gray-800/60">{children}</thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/40">{children}</tbody>
          ),
          tr: ({ children }) => (
            <tr className="divide-x divide-gray-100 dark:divide-gray-700/40">{children}</tr>
          ),
          th: ({ children }) => (
            <th className="px-3 py-1.5 text-left font-semibold text-gray-700 dark:text-gray-300">{children}</th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400">{children}</td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

export default MarkdownRenderer