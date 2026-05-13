import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Play, Loader2 } from 'lucide-react';

interface MarkdownRendererProps {
  content: string
  isUser: boolean
  runCode?: (code: string) => Promise<any> // Add the function prop
}

// 1. Separate component for Python Execution
const PythonTerminal = ({ code, runCode }: { code: string, runCode?: (code: string) => Promise<any> }) => {
  const [result, setResult] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const handleRun = async () => {
    if (!runCode) return;
    setIsRunning(true);
    try {
      const output = await runCode(code);
      setResult(String(output));
    } catch (err) {
      setResult(`${err}`);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="my-3 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0d1117] shadow-sm">
      <div className="flex items-center justify-between bg-gray-100 dark:bg-[#161b22] px-3 py-1.5 border-b border-gray-200 dark:border-gray-700">
        <span className="text-gray-500 text-[10px] font-mono uppercase tracking-wider">python</span>
        <button
          onClick={handleRun}
          disabled={isRunning || !runCode}
          className="flex items-center gap-1.5 text-[11px] bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-2.5 py-1 rounded-md transition-all active:scale-95"
        >
          {isRunning ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} fill="currentColor" />}
          Run Code
        </button>
      </div>
      <div className="px-4 py-3 overflow-x-auto bg-gray-50 dark:bg-gray-900/50">
        <code className="text-[12.5px] font-mono text-gray-700 dark:text-gray-300 whitespace-pre">{code}</code>
      </div>
      {result !== null && (
        <div className="px-4 py-2 bg-gray-100 dark:bg-black border-t border-gray-200 dark:border-gray-800">
          <div className="text-[10px] text-gray-400 uppercase mb-1">Output</div>
          <pre className="text-[12px] font-mono text-green-600 dark:text-green-400 whitespace-pre-wrap">{result}</pre>
        </div>
      )}
    </div>
  );
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

const MarkdownRenderer = ({ content, isUser, runCode }: MarkdownRendererProps) => {
  const baseText = isUser ? 'text-white' : 'text-gray-800 dark:text-gray-100'

  return (
    <div className={`text-sm leading-relaxed ${baseText}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children }) => {
            const codeChild = React.Children.toArray(children)[0] as React.ReactElement<any>
            const className = codeChild?.props?.className ?? ''
            const match = /language-(\w+)/.exec(className)
            const language = match?.[1] ?? ''
            const codeText = String(codeChild?.props?.children ?? '').replace(/\n$/, '')

            if (['bash', 'sh', 'shell'].includes(language)) {
              return <BashTerminal>{codeText}</BashTerminal>
            }

            if (language === 'python') {
              return <PythonTerminal code={codeText} runCode={runCode} />
            }

            return (
              <pre className="bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700/50 px-4 py-3 rounded-lg overflow-x-auto my-2 font-mono text-[12.5px] border leading-relaxed">
                {children}
              </pre>
            )
          },
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
          p: ({ children }) => <p className="mb-1.5 last:mb-0 leading-relaxed">{children}</p>,
          // ... rest of your existing component overrides (strong, em, h1, ul, etc.)
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

export default MarkdownRenderer