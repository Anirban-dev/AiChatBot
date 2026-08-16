// src/routes/admin/aiProviders.ts
import { Router, Response } from 'express'
import { Types } from 'mongoose'
import { AiProvider, AI_TIERS, AiTier } from '../../models/aiProvider'
import { adminAuthMiddleware, AdminRequest } from '../../middleware/auth'
import { writeLog } from '../../utils/logger'
import { midLimiter } from '../../utils/ratelimitHelper'
import { bustModelCache } from './litellm'
import { encryptSecret, decryptSecret } from '../../utils/crypto'

const router = Router()
router.use(adminAuthMiddleware)

const AI_API = process.env.AI_API || 'http://localhost:8000/agent'

const TIER_KEYS = AI_TIERS.map(t => t.key) as string[]

/** Mask an API key for display: sk-1234…wxyz */
function maskKey(key?: string): string {
  if (!key) return ''
  if (key.length <= 8) return '••••••••'
  return `${key.slice(0, 3)}••••${key.slice(-4)}`
}

/** Tell the Python engine to rebuild its litellm router. */
async function triggerReload() {
  try {
    const res = await fetch(`${AI_API}/reload-models`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    bustModelCache()
    const json = await res.json().catch(() => ({}))
    return { applied: json.applied === true, total: json.total ?? 0 }
  } catch (err: any) {
    return { applied: false, error: err?.message || 'Python engine unreachable' }
  }
}

/** Strip secrets before shipping a provider doc to the frontend (never ships the key). */
function sanitize(doc: any) {
  const { api_key, ...rest } = doc.toObject ? doc.toObject() : doc
  const plain = decryptSecret(api_key)
  return {
    ...rest,
    api_key: undefined,
    api_key_masked: maskKey(plain ?? undefined),
    has_key: Boolean(plain),
  }
}

/** Non-secret audit snapshot of a provider doc for logging (never the raw key). */
function auditSnapshot(doc: any) {
  const d = doc.toObject ? doc.toObject() : doc
  const plain = decryptSecret(d.api_key)
  return {
    id: String(d._id ?? d.id ?? ''),
    tier: d.tier,
    provider: d.provider,
    model: d.model,
    api_base: d.api_base || '',
    enabled: d.enabled,
    priority: d.priority,
    hasApiKey: Boolean(plain),
    apiKeyMasked: maskKey(plain ?? undefined),
    createdAt: d.createdAt,
  }
}

/** Diff two snapshots, returning only the fields that actually changed. */
function diffSnapshots(before: any, after: any): Record<string, any> {
  const diff: Record<string, any> = {}
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key]) && key !== 'apiKeyMasked') {
      diff[key] = { from: before[key], to: after[key] }
    }
  }
  return diff
}

function validateBody(body: any): string | null {
  if (!body || typeof body !== 'object') return 'Invalid request body.'
  if (!TIER_KEYS.includes(body.tier)) return 'Invalid tier. Choose one of the fixed mode/tier slots.'
  if (!body.model || typeof body.model !== 'string' || !body.model.trim()) return 'Model name is required.'
  if (body.api_base && typeof body.api_base === 'string' && body.api_base.trim() && !/^https?:\/\//i.test(body.api_base.trim())) {
    return 'API base URL must start with http:// or https://'
  }
  return null
}

// ── GET /api/admin/ai-providers ───────────────────────────────────────────────
router.get('/', midLimiter, async (_req: AdminRequest, res: Response) => {
  try {
    const providers = await AiProvider.find({}).sort({ tier: 1, priority: 1, createdAt: 1 }).lean()
    res.json({
      providers: providers.map(sanitize),
      tiers: AI_TIERS,
      total: providers.length,
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch AI providers' })
  }
})

// ── POST /api/admin/ai-providers ──────────────────────────────────────────────
router.post('/', midLimiter, async (req: AdminRequest, res: Response) => {
  const validation = validateBody(req.body)
  if (validation) return res.status(400).json({ error: validation })

  const { tier, provider, model, api_base, api_key, enabled, priority } = req.body

  try {
    const providerDoc = await AiProvider.create({
      tier: tier as AiTier,
      provider: (provider || 'openai').trim().toLowerCase(),
      model: model.trim(),
      api_base: api_base?.trim() || '',
      api_key: api_key?.trim() ? encryptSecret(api_key.trim()) : '',
      enabled: enabled !== false,
      priority: typeof priority === 'number' ? Math.max(0, priority) : 0,
    })

    const reload = await triggerReload()

    await writeLog({
      action: 'CREATE_AI_PROVIDER',
      status: 'success',
      method: 'POST',
      path: '/api/admin/ai-providers',
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: {
        performedBy: req.userId,
        created: auditSnapshot(providerDoc),
        reload: { applied: reload.applied, total: reload.total, error: reload.error },
      },
    })

    res.status(201).json({
      message: `Provider added to ${tier}.`,
      provider: sanitize(providerDoc),
      reload,
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create AI provider' })
  }
})

// ── PUT /api/admin/ai-providers/:id ───────────────────────────────────────────
router.put('/:id', midLimiter, async (req: AdminRequest, res: Response) => {
  const { id } = req.params as { id: string }
  if (!Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid provider id.' })

  const body = req.body
  const validation = validateBody(body)
  if (validation) return res.status(400).json({ error: validation })

  try {
    const providerDoc = await AiProvider.findById(id)
    if (!providerDoc) return res.status(404).json({ error: 'AI provider not found.' })

    const before = auditSnapshot(providerDoc)

    providerDoc.tier = body.tier as AiTier
    providerDoc.provider = String(body.provider || 'openai').trim().toLowerCase()
    providerDoc.set('model', String(body.model).trim())
    providerDoc.api_base = body.api_base?.trim() || ''
    providerDoc.enabled = body.enabled !== false
    providerDoc.priority = typeof body.priority === 'number' ? Math.max(0, body.priority) : providerDoc.priority
    // Blank api_key on update keeps the previously stored (encrypted) secret.
    if (typeof body.api_key === 'string' && body.api_key.trim()) {
      providerDoc.api_key = encryptSecret(body.api_key.trim())
    }

    await providerDoc.save()
    const reload = await triggerReload()

    const after = auditSnapshot(providerDoc)

    await writeLog({
      action: 'UPDATE_AI_PROVIDER',
      status: 'success',
      method: 'PUT',
      path: `/api/admin/ai-providers/${id}`,
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: {
        performedBy: req.userId,
        changes: diffSnapshots(before, after),
        before,
        after,
        reload: { applied: reload.applied, total: reload.total, error: reload.error },
      },
    })

    res.json({ message: 'AI provider updated.', provider: sanitize(providerDoc), reload })
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update AI provider' })
  }
})

// ── DELETE /api/admin/ai-providers/:id ────────────────────────────────────────
router.delete('/:id', midLimiter, async (req: AdminRequest, res: Response) => {
  const { id } = req.params as { id: string }
  if (!Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid provider id.' })

  try {
    const providerDoc = await AiProvider.findByIdAndDelete(id)
    if (!providerDoc) return res.status(404).json({ error: 'AI provider not found.' })

    const reload = await triggerReload()

    await writeLog({
      action: 'DELETE_AI_PROVIDER',
      status: 'success',
      method: 'DELETE',
      path: `/api/admin/ai-providers/${id}`,
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: {
        performedBy: req.userId,
        deleted: auditSnapshot(providerDoc),
        reload: { applied: reload.applied, total: reload.total, error: reload.error },
      },
    })

    res.json({ message: `Provider for ${providerDoc.tier} deleted.`, reload })
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete AI provider' })
  }
})

// ── POST /api/admin/ai-providers/reload ───────────────────────────────────────
router.post('/reload', midLimiter, async (req: AdminRequest, res: Response) => {
  const reload = await triggerReload()
  await writeLog({
    action: 'RELOAD_AI_PROVIDERS',
    status: reload.applied ? 'success' : 'failed',
    method: 'POST',
    path: '/api/admin/ai-providers/reload',
    ipAddress: req.ip || req.socket.remoteAddress,
    userAgent: req.headers['user-agent'],
    details: { performedBy: req.userId, ...reload },
  })
  res.json({ message: reload.applied ? 'AI router reloaded.' : 'Could not reach the AI engine.', ...reload })
})

export default router