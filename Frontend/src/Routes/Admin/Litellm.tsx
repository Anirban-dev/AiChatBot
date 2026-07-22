import { useState, useEffect, useCallback, useMemo } from 'react'
import { RefreshCw, ChevronDown, ChevronUp, Cpu } from 'lucide-react'
import { 
  getLLMEvents, 
  getLLMStatus, 
  deleteLLMEvent, 
  clearAllLLMEvents,
} from '../../API/Admin/AdminLlm'
import type { 
  ModelStat, 
  LLMEvent, 
} from '../../API/Admin/AdminLlm'
import { HealthOverview } from '../../Components/Admin/HealthOverview'
import { ModelCard } from '../../Components/Admin/ModalCard'
import { EventsLogTable } from '../../Components/Admin/EventsLogTable'

interface LLMStatus {
  model_stats: Record<string, ModelStat>
  total_cost: number
  tiers: string[]
}

interface Props {
  onExpired: () => void
}

const LLMTab = ({ onExpired }: Props) => {
  const [status, setStatus] = useState<LLMStatus | null>(null)
  const [events, setEvents] = useState<LLMEvent[]>([])
  
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [loadingEvents, setLoadingEvents] = useState(true)
  const [error, setError] = useState('')
  
  const [showModels, setShowModels] = useState(false)

  // System Core Filters
  const [typeFilter, setTypeFilter] = useState('')
  const [tierFilter, setTierFilter] = useState('')
  const [hoursFilter, setHoursFilter] = useState('24')
  const [modelFilter, setModelFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const handleError = useCallback((err: any) => {
    const msg = err.message?.toLowerCase() || ''
    const isAuthError = msg.includes('expired') || msg.includes('unauthorized') || msg.includes('denied')

    if (isAuthError) {
      localStorage.removeItem('accessToken')
      sessionStorage.removeItem('accessToken')
      onExpired()
    } else {
      setError(err.message || 'System failed to parse operational logs.')
    }
  }, [onExpired])

  const fetchStatus = useCallback(async () => {
    setLoadingStatus(true)
    try {
      setStatus(await getLLMStatus())
    } catch (err: any) {
      handleError(err)
    } finally {
      setLoadingStatus(false)
    }
  }, [handleError])

  const fetchEvents = useCallback(async () => {
    setLoadingEvents(true)
    try {
      const data = await getLLMEvents(
        parseInt(hoursFilter), 
        typeFilter, 
        tierFilter,
        modelFilter || undefined,
        statusFilter ? parseInt(statusFilter) : undefined
      )
      const normalizedEvents = data.events.map(event => ({
        ...event,
        status_code: event.error_details?.status_code ?? null // Standardizes the deep root resolution catch cleanly
      }))
      setEvents(normalizedEvents)
    } catch (err: any) {
      handleError(err)
    } finally {
      setLoadingEvents(false)
    }
  }, [hoursFilter, typeFilter, tierFilter, modelFilter, statusFilter, handleError])

  // Single Entry Mutation Execution Hook
  const handleDeleteEvent = async (id: string) => {
    try {
      await deleteLLMEvent(id)
      setEvents(prev => prev.filter(e => e._id !== id))
    } catch (err: any) {
      handleError(err)
    }
  }

  // Bulk Sweep Deletion Execution Hook
  const handleClearAllEvents = async () => {
    try {
      await clearAllLLMEvents({
        type: typeFilter || undefined,
        tier: tierFilter || undefined,
        model: modelFilter || undefined
      })
      setEvents([])
    } catch (err: any) {
      handleError(err)
    }
  }

  // Fixing the execution halt by cleanly loading structural frameworks on initial mount
  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  const handleRefresh = () => {
    setError('')
    fetchStatus()
    fetchEvents()
  }

  const topStats = useMemo(() => {
    if (!status) return null
    const models = Object.values(status.model_stats)
    const total = models.reduce((acc, m) => acc + m.success + m.failure, 0)
    const success = models.reduce((acc, m) => acc + m.success, 0)
    const rate = total > 0 ? Math.round((success / total) * 100) : 100
    const latencies = models.filter(m => m.avg_latency_ms).map(m => m.avg_latency_ms as number)
    const avgLat = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null
    const cooling = models.filter(m => m.cooling_down).length

    return { total, rate, avgLat, cooling }
  }, [status])

  const filteredEvents = useMemo(() => {
    return events
      .filter(e => !typeFilter || e.type === typeFilter)
      .filter(e => !tierFilter || e.tier === tierFilter)
      .slice(0, 50)
  }, [events, typeFilter, tierFilter])

  const allTiers = useMemo(() => {
    if (!status) return []
    return [...new Set(Object.values(status.model_stats).map(m => m.tier))]
  }, [status])

  return (
    <div className="space-y-6 max-w-350 mx-auto animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">System Cluster Diagnostic Infrastructure</h2>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Real-time status routing trace configurations and request cost metrics</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loadingStatus || loadingEvents}
          className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 px-3.5 py-2 rounded-xl transition cursor-pointer disabled:opacity-45 shadow-xs bg-white dark:bg-slate-900"
        >
          <RefreshCw size={13} className={loadingStatus || loadingEvents ? 'animate-spin' : ''} />
          <span>Refresh Dashboard</span>
        </button>
      </div>

      {error && (
        <div className="text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20 rounded-xl px-4 py-3">
          ⚠️ Operational Exception: {error}
        </div>
      )}

      <HealthOverview 
        loading={loadingStatus} 
        totalCost={status?.total_cost ?? 0} 
        stats={topStats} 
      />

      <div className="space-y-3 p-4 rounded-2xl border border-slate-100 dark:border-slate-800/60 bg-slate-50/30 dark:bg-slate-900/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu size={14} className="text-indigo-500" />
            <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Active Infrastructure Node Topologies ({status ? Object.keys(status.model_stats).length : 0})
            </h3>
          </div>
          <button
            onClick={() => setShowModels(!showModels)}
            className="flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition cursor-pointer px-2 py-1 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-500/10"
          >
            <span>{showModels ? 'Hide Model Specs' : 'Inspect Model Specs'}</span>
            {showModels ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {showModels && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pt-1 animate-slide-down">
            {loadingStatus
              ? Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3.5 shadow-xs">
                    {Array.from({ length: 4 }).map((_, j) => (
                      <div key={j} className="h-3.5 bg-slate-100 dark:bg-slate-800/80 rounded animate-pulse w-full" />
                    ))}
                  </div>
                ))
              : status && Object.entries(status.model_stats).map(([modelName, stats]) => (
                  <ModelCard 
                    key={modelName} 
                    modelName={modelName} 
                    stats={stats} 
                  />
                ))
            }
          </div>
        )}
      </div>

      {/* Renders the upgraded Tracing Logs Table with active row Deletions & Purge triggers */}
      <EventsLogTable
        loading={loadingEvents}
        events={filteredEvents}
        allTiers={allTiers}
        typeFilter={typeFilter}
        tierFilter={tierFilter}
        hoursFilter={hoursFilter}
        modelFilter={modelFilter}
        statusFilter={statusFilter}
        onTypeChange={setTypeFilter}
        onTierChange={setTierFilter}
        onHoursChange={setHoursFilter}
        onModelChange={setModelFilter}
        onStatusChange={setStatusFilter}
        onDeleteEvent={handleDeleteEvent}
        onClearAllEvents={handleClearAllEvents}
      />
    </div>
  )
}

export default LLMTab