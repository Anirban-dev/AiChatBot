// src/utils/crypto.ts
import crypto from 'crypto'

/**
 * AES-256-GCM encryption for API keys at rest.
 *
 * Key source: ENCRYPTION_KEY env var (any length) → SHA-256 hashed to a
 * 32-byte key. When the var is absent we fall back to a fixed dev secret so
 * local development keeps working; deployments MUST set ENCRYPTION_KEY.
 *
 * Ciphertext format (base64, ':'-separated so JSON/keys stay safe):
 *   enc:v1:<iv>:<authTag>:<ciphertext>
 */
const ENCRYPTION_SECRET =
  process.env.ENCRYPTION_KEY

const KEY = crypto.createHash('sha256').update(ENCRYPTION_SECRET!).digest()

export const ENCRYPTED_PREFIX = 'enc:v1:'

/** Encrypt a plaintext secret. Returns `enc:v1:...` (or the input unchanged if already encrypted). */
export function encryptSecret(plain?: string): string {
  if (!plain) return ''
  if (plain.startsWith(ENCRYPTED_PREFIX)) return plain
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${ENCRYPTED_PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`
}

/**
 * Decrypt an `enc:v1:` value.
 * - Returns null when the value is encrypted but cannot be decrypted (bad key / tampered).
 * - Returns the value unchanged when it is NOT in the encrypted format
 *   (legacy plaintext rows keep working until they are re-saved through the UI).
 */
export function decryptSecret(value?: string): string | null {
  if (!value) return null
  if (!value.startsWith(ENCRYPTED_PREFIX)) return value
  try {
    const [, ivB64, tagB64, ctB64] = value.split(':')
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivB64, 'base64'))
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
    return Buffer.concat([
      decipher.update(Buffer.from(ctB64, 'base64')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    return null
  }
}