// src/components/Admin/UsageBar.tsx
interface UsageBarProps {
  used: number
  total: number
  color?: string
}

export const UsageBar = ({ used, total, color = 'bg-indigo-500' }: UsageBarProps) => {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0
  const isCritical = pct >= 95

  return (
    <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-300 ${
          isCritical ? 'bg-rose-500' : color
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}