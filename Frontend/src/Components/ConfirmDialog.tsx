import React from 'react'
import { AlertTriangle, X } from 'lucide-react'

interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning' | 'info'
  onConfirm: () => void
  onCancel: () => void
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null

  const variantStyles = {
    danger: {
      icon: 'text-rose-500',
      iconBg: 'bg-rose-500/10 border-rose-500/20',
      button: 'bg-rose-600 hover:bg-rose-700 text-white',
    },
    warning: {
      icon: 'text-amber-500',
      iconBg: 'bg-amber-500/10 border-amber-500/20',
      button: 'bg-amber-600 hover:bg-amber-700 text-white',
    },
    info: {
      icon: 'text-blue-500',
      iconBg: 'bg-blue-500/10 border-blue-500/20',
      button: 'bg-blue-600 hover:bg-blue-700 text-white',
    },
  }

  const styles = variantStyles[variant]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs animate-fade-in">
      <div className="absolute inset-0" onClick={onCancel} />

      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden animate-scale-up">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-950/10">
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-xl border flex items-center justify-center ${styles.iconBg}`}>
              <AlertTriangle size={18} className={styles.icon} />
            </div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              {title}
            </h3>
          </div>
          <button
            onClick={onCancel}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4">
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {message}
          </p>
        </div>

        <div className="flex justify-end gap-2.5 px-5 py-3 border-t border-slate-100 dark:border-slate-800/60 bg-slate-50/30 dark:bg-slate-950/5">
          <button
            onClick={onCancel}
            className="text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition cursor-pointer shadow-xs"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-xl transition cursor-pointer shadow-xs ${styles.button}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
