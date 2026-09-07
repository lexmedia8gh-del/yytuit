import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow, isValid } from 'date-fns'
import { Timestamp } from 'firebase/firestore'

// ─── Class Merge Utility ─────────────────────────────────────
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ─── Currency Formatting ─────────────────────────────────────
export function formatCurrency(
  amount: number,
  currency = 'GHS',
  symbol = 'GH₵'
): string {
  const formatted = new Intl.NumberFormat('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
  return `${symbol}${formatted}`
}

export function formatAmount(amount: number): string {
  return new Intl.NumberFormat('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

// ─── Date Formatting ─────────────────────────────────────────
export function formatDate(
  date: Timestamp | Date | string | null | undefined,
  fmt = 'dd MMM yyyy'
): string {
  if (!date) return '—'
  try {
    let d: Date
    if (date instanceof Timestamp) {
      d = date.toDate()
    } else if (date instanceof Date) {
      d = date
    } else {
      d = new Date(date)
    }
    if (!isValid(d)) return '—'
    return format(d, fmt)
  } catch {
    return '—'
  }
}

export function formatRelativeTime(
  date: Timestamp | Date | null | undefined
): string {
  if (!date) return '—'
  try {
    const d = date instanceof Timestamp ? date.toDate() : date
    if (!isValid(d)) return '—'
    return formatDistanceToNow(d, { addSuffix: true })
  } catch {
    return '—'
  }
}

export function formatDateTime(date: Timestamp | Date | null | undefined): string {
  return formatDate(date, 'dd MMM yyyy, h:mm a')
}

// ─── Invoice Number Generation ────────────────────────────────
export function generateInvoiceNumber(
  prefix = 'LXM-INV',
  sequenceNumber: number
): string {
  return `${prefix}-${String(sequenceNumber).padStart(4, '0')}`
}

export function generateLxmInvoiceNumber(count: number): string {
  return `LXM-INV-${String(count + 1).padStart(4, '0')}`
}

export function generateSecureToken(prefixOrLength: string | number = 'd_'): string {
  if (typeof prefixOrLength === 'number') {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let res = ''
    for (let i = 0; i < prefixOrLength; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return res
  }
  const timestamp = Date.now().toString(36)
  const randomStr = Math.random().toString(36).substring(2, 10)
  return `${prefixOrLength}${timestamp}_${randomStr}`
}

// ─── String Utilities ─────────────────────────────────────────
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return `${str.slice(0, maxLength)}...`
}

export function capitalize(str: string): string {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1)
}

export function slugify(str: string): string {
  if (!str) return ''
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export function getInitials(name?: string | null): string {
  if (!name || typeof name !== 'string') return 'LM'
  const trimmed = name.trim()
  if (!trimmed) return 'LM'
  const parts = trimmed.split(' ').filter(Boolean)
  if (parts.length === 0) return 'LM'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// ─── Status Color Mapping ─────────────────────────────────────
export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    // Invoice / Payment statuses
    Draft: 'bg-gray-50 text-gray-700 border border-gray-200',
    Pending: 'bg-amber-50 text-amber-700 border border-amber-200',
    'Partially Paid': 'bg-indigo-50 text-indigo-700 border border-indigo-200',
    Paid: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    Overdue: 'bg-rose-50 text-rose-700 border border-rose-200',
    Cancelled: 'bg-gray-50 text-gray-600 border border-gray-200',
    // Project statuses
    Inquiry: 'bg-gray-50 text-gray-700 border border-gray-200',
    'Awaiting Payment': 'bg-amber-50 text-amber-700 border border-amber-200',
    'In Progress': 'bg-blue-50 text-blue-700 border border-blue-200',
    Review: 'bg-purple-50 text-purple-700 border border-purple-200',
    Revision: 'bg-orange-50 text-orange-700 border border-orange-200',
    Completed: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    // Generic
    active: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    inactive: 'bg-gray-50 text-gray-600 border border-gray-200',
    archived: 'bg-gray-50 text-gray-600 border border-gray-200',
    disabled: 'bg-rose-50 text-rose-700 border border-rose-200',
    expired: 'bg-orange-50 text-orange-700 border border-orange-200',
    // Payment
    Unpaid: 'bg-amber-50 text-amber-700 border border-amber-200',
    success: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    failed: 'bg-rose-50 text-rose-700 border border-rose-200',
    abandoned: 'bg-gray-50 text-gray-600 border border-gray-200',
  }
  return map[status] ?? 'bg-gray-50 text-gray-600 border border-gray-200'
}

// ─── Number Utilities ────────────────────────────────────────
export function calculateInvoiceTotals(
  items: Array<{ quantity: number; unitPrice: number }>,
  discountType?: 'percentage' | 'fixed',
  discountValue?: number,
  taxRate?: number
): { subtotal: number; discountAmount: number; taxAmount: number; total: number } {
  const subtotal = items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0
  )

  let discountAmount = 0
  if (discountValue && discountValue > 0) {
    if (discountType === 'percentage') {
      discountAmount = (subtotal * discountValue) / 100
    } else {
      discountAmount = discountValue
    }
  }

  const taxableAmount = subtotal - discountAmount
  const taxAmount = taxRate ? (taxableAmount * taxRate) / 100 : 0
  const total = taxableAmount + taxAmount

  return { subtotal, discountAmount, taxAmount, total }
}

// ─── Error Handling ──────────────────────────────────────────
export function getFirebaseErrorMessage(code: string): string {
  const messages: Record<string, string> = {
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Incorrect password. Please try again.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/too-many-requests':
      'Too many failed attempts. Please try again later.',
    'auth/network-request-failed': 'Network error. Please check your connection.',
    'auth/invalid-credential': 'Invalid email or password.',
    'auth/unauthorized-domain':
      'This domain is not authorized for OAuth in Firebase Console. Please add this deployment domain to Firebase Authentication > Settings > Authorized domains.',
    'auth/popup-blocked':
      'Sign-in popup was blocked by your browser. Please allow popups for this site.',
    'auth/popup-closed-by-user':
      'Sign-in popup was closed before completing authentication.',
    'auth/cancelled-popup-request':
      'Another sign-in attempt is already in progress.',
    'auth/operation-not-allowed':
      'Google Sign-In is not enabled in your Firebase Authentication console.',
    'auth/user-disabled':
      'This administrator account has been disabled.',
    'auth/unauthorized-admin':
      'This Google account is not authorized as a LexMedia admin.',
    'permission-denied': 'You do not have permission to perform this action.',
  }
  return messages[code] ?? 'An unexpected error occurred. Please try again.'
}

// ─── URL Helpers ─────────────────────────────────────────────
/**
 * Checks whether a given URL string or origin is a localhost / dev-only / internal address.
 * Matches: localhost, 127.0.0.1, 0.0.0.0, Host3000, and port 3000.
 */
export function isLocalhostOrDevUrl(urlStr?: string | null): boolean {
  if (!urlStr) return true
  const lower = urlStr.trim().toLowerCase()
  if (
    lower.includes('localhost') ||
    lower.includes('127.0.0.1') ||
    lower.includes('0.0.0.0') ||
    lower.includes('host3000') ||
    lower.includes(':3000')
  ) {
    return true
  }
  try {
    const normalized = lower.startsWith('http') ? lower : `https://${lower}`
    const parsed = new URL(normalized)
    return (
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '0.0.0.0' ||
      parsed.hostname.endsWith('.local') ||
      parsed.port === '3000'
    )
  } catch {
    return false
  }
}

/**
 * Resolves the application base URL on the client (browser) or during SSR.
 * Always prioritizes the active window location or production environment variables,
 * and never returns a development or localhost URL in production.
 */
export function getClientAppUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    const origin = window.location.origin.trim().replace(/\/$/, '')
    if (origin) {
      return origin
    }
  }

  // SSR / fallback: Check production environment variables (excluding localhost/dev URLs)
  const envCandidates = [
    process.env.APP_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_VERCEL_URL,
    process.env.VERCEL_URL,
  ]

  for (const candidate of envCandidates) {
    if (candidate && !isLocalhostOrDevUrl(candidate)) {
      const trimmed = candidate.trim().replace(/\/$/, '')
      return trimmed.startsWith('http') ? trimmed : `https://${trimmed}`
    }
  }

  // Fallback to any configured env variable
  const rawEnv = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || ''
  if (rawEnv) {
    const trimmed = rawEnv.trim().replace(/\/$/, '')
    return trimmed.startsWith('http') ? trimmed : `https://${trimmed}`
  }

  return ''
}

/**
 * Resolves the application base URL on the server.
 * Uses production environment variables (APP_URL, VERCEL_PROJECT_PRODUCTION_URL,
 * NEXT_PUBLIC_APP_URL, VERCEL_URL) and request headers (origin, referer, x-forwarded-host).
 * Strips localhost:3000 / Host3000 in production, ensuring Paystack and Brevo never redirect
 * customers to development URLs.
 */
export function getServerAppUrl(req?: {
  headers?: { get: (name: string) => string | null }
  url?: string
}): string {
  // 1. Check production environment variables (excluding localhost/dev URLs)
  const prodEnvCandidates = [
    process.env.APP_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_VERCEL_URL,
    process.env.VERCEL_URL,
  ]

  for (const candidate of prodEnvCandidates) {
    if (candidate && !isLocalhostOrDevUrl(candidate)) {
      const trimmed = candidate.trim().replace(/\/$/, '')
      return trimmed.startsWith('http') ? trimmed : `https://${trimmed}`
    }
  }

  // 2. Check incoming request headers (origin, referer, x-forwarded-host)
  if (req?.headers) {
    // Check origin header (sent on POST/fetch requests from browser)
    const origin = req.headers.get('origin')
    if (origin && !isLocalhostOrDevUrl(origin)) {
      return origin.trim().replace(/\/$/, '')
    }

    // Check referer header
    const referer = req.headers.get('referer')
    if (referer) {
      try {
        const refUrl = new URL(referer)
        if (!isLocalhostOrDevUrl(refUrl.origin)) {
          return refUrl.origin.replace(/\/$/, '')
        }
      } catch {}
    }

    // Check x-forwarded-host
    const fwdHost = req.headers.get('x-forwarded-host')
    if (fwdHost && !isLocalhostOrDevUrl(fwdHost)) {
      const proto = req.headers.get('x-forwarded-proto') || 'https'
      return `${proto}://${fwdHost.trim().replace(/\/$/, '')}`
    }

    // Check host header (if not localhost)
    const host = req.headers.get('host')
    if (host && !isLocalhostOrDevUrl(host)) {
      const proto = req.headers.get('x-forwarded-proto') || 'https'
      return `${proto}://${host.trim().replace(/\/$/, '')}`
    }
  }

  // 3. Fallback: If in local development, use available env or host
  for (const candidate of [process.env.APP_URL, process.env.NEXT_PUBLIC_APP_URL, process.env.VERCEL_URL]) {
    if (candidate) {
      const trimmed = candidate.trim().replace(/\/$/, '')
      return trimmed.startsWith('http') ? trimmed : `https://${trimmed}`
    }
  }

  if (req?.headers) {
    const proto = req.headers.get('x-forwarded-proto') || 'http'
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host')
    if (host) {
      return `${proto}://${host.trim().replace(/\/$/, '')}`
    }
  }

  if (req?.url) {
    try {
      return new URL(req.url).origin
    } catch {}
  }

  return ''
}

// ─── WhatsApp Link Generation ────────────────────────────────
export function generateWhatsAppLink(phone: string, message: string): string {
  const cleanPhone = phone.replace(/\D/g, '')
  const encodedMessage = encodeURIComponent(message)
  return `https://wa.me/${cleanPhone}?text=${encodedMessage}`
}

// ─── File Formatting & Helpers ───────────────────────────────
export function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export function getFileCategory(fileName: string, mimeType?: string): 'image' | 'video' | 'audio' | 'pdf' | 'archive' | 'document' | 'other' {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'heic', 'tiff'].includes(ext) || mimeType?.startsWith('image/')) return 'image'
  if (['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'].includes(ext) || mimeType?.startsWith('video/')) return 'video'
  if (['mp3', 'wav', 'aac', 'flac', 'm4a', 'ogg'].includes(ext) || mimeType?.startsWith('audio/')) return 'audio'
  if (ext === 'pdf' || mimeType === 'application/pdf') return 'pdf'
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext) || mimeType?.includes('zip') || mimeType?.includes('compressed')) return 'archive'
  if (['doc', 'docx', 'txt', 'rtf', 'csv', 'xlsx', 'pptx'].includes(ext)) return 'document'
  return 'other'
}

// ─── Clipboard ───────────────────────────────────────────────
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Fallback
    const el = document.createElement('textarea')
    el.value = text
    document.body.appendChild(el)
    el.select()
    document.execCommand('copy')
    document.body.removeChild(el)
    return true
  }
}

export function formatWhatsAppNumber(phone?: string): string {
  if (!phone) return ''
  let cleaned = phone.replace(/\D/g, '')
  if (cleaned.startsWith('0')) {
    cleaned = '233' + cleaned.substring(1)
  } else if (!cleaned.startsWith('233') && cleaned.length === 9) {
    cleaned = '233' + cleaned
  }
  return cleaned
}
