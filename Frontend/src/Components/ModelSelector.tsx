import { useState, useEffect, useRef } from 'react'

export interface ModelOption {
  value: 'small' | 'large' | 'thinking' | 'critiq'
  label: string
  icon: string
  hasVectorDB?: boolean
}

interface ModelSelectorProps {
  value: string
  onChange: (value: 'small' | 'large' | 'thinking' | 'critiq') => void
  disabled?: boolean
  size?: 'regular' | 'compact'
  vectorDBAvailable?: boolean
}

const MODEL_OPTIONS: ModelOption[] = [
  { value: 'small', label: '✦ Chat (Small)', icon: '✦', hasVectorDB: false },
  { value: 'large', label: '⚡ Tools (Large)', icon: '⚡', hasVectorDB: true },
  { value: 'thinking', label: '🧠 Reason (Thinking)', icon: '🧠', hasVectorDB: true },
  { value: 'critiq', label: '🧐 Critique (Review)', icon: '🧐', hasVectorDB: true },
]

export const ModelSelector = ({
  value,
  onChange,
  disabled = false,
  size = 'regular',
  vectorDBAvailable = false
}: ModelSelectorProps) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const selectRef = useRef<HTMLSelectElement>(null)

  // Detect mobile screen for icon-only mode
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 480)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const handleBlur = () => {
    setTimeout(() => setIsMenuOpen(false), 150)
  }

  const currentOption = MODEL_OPTIONS.find(o => o.value === value) ?? MODEL_OPTIONS[0]

  return (
    <select
      ref={selectRef}
      value={value}
      onChange={(e) => onChange(e.target.value as 'small' | 'large' | 'thinking' | 'critiq')}
      disabled={disabled}
      onBlur={handleBlur}
      onFocus={() => setIsMenuOpen(true)}
      title={isMobile ? currentOption.icon : currentOption.label}
      className={`
        text-xs sm:text-[10px] bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600
        rounded-xl text-gray-600 dark:text-gray-300 outline-none focus:border-gray-300 dark:focus:border-gray-500
        cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-all
        hover:bg-gray-100 dark:hover:bg-gray-600 shadow-xs appearance-none
        ${vectorDBAvailable && value !== 'small' ? 'border-violet-300 dark:border-violet-700' : ''}
        ${isMobile
          ? 'w-8 h-8 min-w-8 p-0 flex items-center justify-center text-base text-center'
          : 'px-2.5 py-1.5 w-auto'
        }
      `}
    >
      {isMobile ? (
        MODEL_OPTIONS.map(option => (
          <option key={option.value} value={option.value}>{option.icon}</option>
        ))
      ) : (
        MODEL_OPTIONS.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
            {option.hasVectorDB }
          </option>
        ))
      )}
    </select>
  )
}
