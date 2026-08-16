import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Play, Loader2, Copy, Check, Trash2, ChevronDown, ChevronRight, Code2 } from 'lucide-react'

interface MarkdownRendererProps {
  content: string
  isUser: boolean
  runCode?: (code: string) => Promise<any>
}

// Heuristic: does the message content suggest the user explicitly asked for code?
// Looks for keywords in the content surrounding a python block.
const EXPLICIT_CODE_PATTERNS = [
  /\b(write|create|give me|show me|generate|make|build|produce|draft|implement)\b.*\b(code|script|function|program|snippet|class|module)\b/i,
  /\b(code|script|function|program|snippet|class|module)\b.*\b(for|to|that|which|in python)\b/i,
  /```python/i,
  /python (code|script|function|program)/i,
]

function isExplicitlyRequestedCode(fullContent: string): boolean {
  return EXPLICIT_CODE_PATTERNS.some(p => p.test(fullContent))
}

// Opaque & blurred floating copy action button
const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy text: ', err)
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 text-[10px] text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 transition-all bg-white/90 dark:bg-gray-800/90 hover:bg-white dark:hover:bg-gray-700 px-2.5 py-1 rounded-md font-sans font-medium border border-gray-200 dark:border-gray-700 shadow-xs backdrop-blur-xs cursor-pointer select-none"
      title="Copy code to clipboard"
    >
      {copied ? <Check size={11} className="text-green-500" /> : <Copy size={11} />}
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

// 1. Python Execution Terminal Component
const PythonTerminalBody = ({ code, runCode }: { code: string; runCode?: (code: string) => Promise<any> }) => {
  const [result, setResult] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)

  const handleRun = async () => {
    if (!runCode) return
    setIsRunning(true)
    try {
      const output = await runCode(code)
      setResult(String(output))
    } catch (err) {
      setResult(`${err}`)
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0d1117] shadow-sm">
      {/* Top element bar layer */}
      <div className="flex items-center justify-between bg-gray-100 dark:bg-[#161b22] px-3 py-2 border-b border-gray-200 dark:border-gray-700 rounded-t-lg">
        <span className="text-gray-500 text-[11px] font-mono uppercase tracking-wider font-bold">python</span>
        <button
          onClick={handleRun}
          disabled={isRunning || !runCode}
          className="flex items-center gap-1.5 text-[11px] font-semibold bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-3 py-1.5 rounded-md shadow-xs transition-all active:scale-95 cursor-pointer"
        >
          {isRunning ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} fill="currentColor" />}
          Run Code
        </button>
      </div>

      {/* Code viewport with tracking right sidebar for the copy button */}
      <div className="relative flex flex-col">
        <div className="px-4 py-3 overflow-x-auto bg-gray-50 dark:bg-gray-900/50">
          <code className="text-[12.5px] font-mono text-gray-700 dark:text-gray-300 whitespace-pre">{code}</code>
        </div>

        {/* Invisible scroll-bound structural track element */}
        <div className="absolute inset-y-0 right-0 w-20 pointer-events-none flex flex-col items-end pt-2 pr-2">
          <div className="sticky top-3 pointer-events-auto">
            <CopyButton text={code} />
          </div>
        </div>
      </div>

      {/* Persistent Console Output Panel */}
      <div className="px-4 py-2.5 bg-gray-100 dark:bg-black border-t border-gray-200 dark:border-gray-800 rounded-b-lg">
        <div className="flex items-center justify-between h-7 mb-1.5">
          <div className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">Console Output</div>
          {result !== null && !isRunning && (
            <button
              onClick={() => setResult(null)}
              className="flex items-center gap-1.5 text-[11px] font-semibold bg-gray-200 hover:bg-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 px-2.5 py-1 rounded-md shadow-xs transition-all active:scale-95 cursor-pointer"
              title="Clear console window"
            >
              <Trash2 size={12} />
              Clear Output
            </button>
          )}
        </div>

        <div className="flex flex-col justify-center">
          {isRunning ? (
            <div className="text-[12px] font-mono text-blue-500 flex items-center gap-2 animate-pulse">
              <Loader2 size={12} className="animate-spin" />
              Executing script...
            </div>
          ) : result !== null ? (
            <pre className="text-[12px] font-mono text-green-600 dark:text-green-400 whitespace-pre-wrap leading-relaxed">{result}</pre>
          ) : (<div />)}
        </div>
      </div>
    </div>
  )
}

// Wrapper: expanded when explicitly requested, collapsed (details/summary) when auto-generated
const PythonTerminal = ({
  code,
  runCode,
  expandedByDefault = true,
}: {
  code: string
  runCode?: (code: string) => Promise<any>
  expandedByDefault?: boolean
}) => {
  const [open, setOpen] = useState(expandedByDefault)

  if (expandedByDefault) {
    return (
      <div className="my-3">
        <PythonTerminalBody code={code} runCode={runCode} />
      </div>
    )
  }

  return (
    <div className="my-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 bg-gray-100 dark:bg-gray-800/60 hover:bg-gray-200 dark:hover:bg-gray-700/60 border border-gray-200 dark:border-gray-700 rounded-lg transition-all cursor-pointer select-none"
        title={open ? 'Hide computation' : 'Show computation'}
      >
        {open
          ? <ChevronDown size={11} />
          : <ChevronRight size={11} />}
        <Code2 size={11} />
        <span>Python computation</span>
      </button>
      {open && (
        <div className="mt-1.5">
          <PythonTerminalBody code={code} runCode={runCode} />
        </div>
      )}
    </div>
  )
}

// 2. Bash/Shell System Block Terminal Component
const BashTerminal = ({ code }: { code: string }) => (
  <div className="my-2 rounded-lg border font-mono bg-gray-50 border-gray-200 text-black dark:bg-[#0d1117] dark:border-gray-700 dark:text-gray-300 shadow-md w-full">
    <div className="flex items-center bg-gray-100 border-gray-200 dark:bg-[#161b22] dark:border-gray-700/40 px-3 py-2 border-b rounded-t-lg">
      <div className="flex gap-1.5 items-center">
        <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]/80" />
        <div className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]/80" />
        <div className="w-2.5 h-2.5 rounded-full bg-[#27c93f]/80" />
        <span className="text-gray-500 text-[9px] uppercase tracking-widest font-semibold ml-1.5">bash</span>
      </div>
    </div>

    <div className="relative flex flex-col">
      <div className="px-4 py-3 overflow-x-auto rounded-b-lg">
        <div className="flex gap-2 items-start">
          <span className="text-pink-500/90 select-none">$</span>
          <code className="text-gray-500 dark:text-gray-200 whitespace-pre-wrap wrap-break-word flex-1 leading-relaxed">{code}</code>
        </div>
      </div>

      <div className="absolute inset-y-0 right-0 w-20 pointer-events-none flex flex-col items-end pt-2 pr-2">
        <div className="sticky top-3 pointer-events-auto">
          <CopyButton text={code} />
        </div>
      </div>
    </div>
  </div>
)

// 3. Fallback Standard Generic Code Blocks
const DefaultTerminal = ({ language, code, children }: { language: string; code: string; children: React.ReactNode }) => (
  <div className="my-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0d1117] shadow-md w-full">
    <div className="flex items-center justify-between bg-gray-100 border-gray-200 dark:bg-[#161b22] dark:border-gray-700/40 px-3 py-2 border-b rounded-t-lg">
      <span className="text-gray-500 text-[10px] font-mono uppercase tracking-wider font-semibold">
        {language || 'code'}
      </span>
    </div>

    <div className="relative flex flex-col">
      <pre className="px-4 py-3 overflow-x-auto text-gray-800 dark:text-gray-100 font-mono text-[12.5px] leading-relaxed rounded-b-lg bg-gray-50 dark:bg-gray-900/50">
        {children}
      </pre>

      <div className="absolute inset-y-0 right-0 w-20 pointer-events-none flex flex-col items-end pt-2 pr-2">
        <div className="sticky top-3 pointer-events-auto">
          <CopyButton text={code} />
        </div>
      </div>
    </div>
  </div>
)

const preprocessContent = (rawText: string) => {
  if (!rawText) return ''

  // 1. Strip raw Qwen / LLM control tokens and commentary headers
  let text = rawText
    .replace(/commentary<\|message\|>/g, '')
    .replace(/<\|message\|>/g, '')
    .replace(/<\|end\|>/g, '')
    .replace(/<\|im_start\|>/g, '')
    .replace(/<\|im_end\|>/g, '')

  // 2. Normalize LaTeX math formula delimiters like ChatGPT:
  // Block math: \[ ... \] or \\[ ... \\]
  text = text.replace(/\\\\?\[([\s\S]*?)null?\\\\?\]/g, (_, math) => `\n\n$$\n${math.trim()}\n$$\n\n`)
  text = text.replace(/\\\\?\[([\s\S]*?)\\\\?\]/g, (_, math) => `\n\n$$\n${math.trim()}\n$$\n\n`)

  // Inline math: \( ... \) or \\( ... \\)
  text = text.replace(/\\\\?\(([\s\S]*?)\\\\?\)/g, (_, math) => `$${math.trim()}$`)

  // Clean trailing slash/backslash block artifacts like /.../ or \.../
  text = text.replace(/(^|\s)\/([^\/\n]+)\/(\s|$)/g, '$1*$2*$3')

  return text
}

const MarkdownRenderer = ({ content, isUser, runCode }: MarkdownRendererProps) => {
  const baseText = isUser ? 'text-white' : 'text-gray-800 dark:text-gray-100'
  const cleanedContent = preprocessContent(content)
  // Determine once per message whether the user explicitly asked for code
  const explicitCode = isExplicitlyRequestedCode(content)

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
              return <BashTerminal code={codeText} />
            }

            if (language === 'python') {
              return (
                <PythonTerminal
                  code={codeText}
                  runCode={runCode}
                  expandedByDefault={explicitCode}
                />
              )
            }

            return (
              <DefaultTerminal language={language} code={codeText}>
                {children}
              </DefaultTerminal>
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
          a: ({ href, children, ...props }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={isUser
                ? "font-bold hover:underline"
                : "text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline"
              }
              {...props}
            >
              {children}
            </a>
          ),
        }}
      >
        {cleanedContent}
      </ReactMarkdown>
    </div>
  )
}

export default MarkdownRenderer