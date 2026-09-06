import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'
import { getServerDoc, setServerDoc, updateServerDoc, queryServerDocs, toISOString } from '@/lib/firebase/serverDb'
import { FieldValue, Timestamp, type DocumentData } from 'firebase-admin/firestore'
import { getServerAppUrl } from '@/lib/utils'

export const dynamic = 'force-dynamic'

function generateToken(length = 24): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes, (byte) => chars[byte % chars.length]).join('')
}

function toISO(ts: any): string | null {
  return toISOString(ts)
}

function deliveryScore(data: DocumentData): number {
  const statusScore: Record<string, number> = { Downloaded: 40, Delivered: 30, 'Ready for Delivery': 20 }
  return (data.fileCount || 0) * 1000 + (data.isReleased ? 100 : 0) + (statusScore[data.status] || 0)
}

async function ensureCanonicalDelivery(input: {
  projectId: string
  clientId: string
  clientName: string
  projectName: string
  invoiceId: string
}) {
  const existing = await getServerDoc(COLLECTIONS.DELIVERIES, input.projectId)
  if (existing.exists && existing.data()) {
    return { id: existing.id, data: existing.data()!, migrated: false }
  }

  const legacyDocs = await queryServerDocs(COLLECTIONS.DELIVERIES, 'projectId', '==', input.projectId)
  const ordered = [...legacyDocs].sort((a, b) => {
    const scoreDiff = deliveryScore(b.data()!) - deliveryScore(a.data()!)
    if (scoreDiff) return scoreDiff
    const aTime = new Date(toISO(a.data()?.createdAt) || 0).getTime()
    const bTime = new Date(toISO(b.data()?.createdAt) || 0).getTime()
    return aTime - bTime
  })
  const source = ordered[0]
  const sourceData = source?.data?.()

  const base = sourceData
    ? {
        ...sourceData,
        projectId: input.projectId,
        clientId: sourceData.clientId || input.clientId,
        clientName: sourceData.clientName || input.clientName,
        projectName: sourceData.projectName || input.projectName,
        invoiceId: sourceData.invoiceId || input.invoiceId || null,
        migratedLegacyDeliveryIds: ordered.map((doc) => doc.id),
        updatedAt: FieldValue.serverTimestamp(),
      }
    : {
        clientId: input.clientId,
        clientName: input.clientName,
        projectId: input.projectId,
        projectName: input.projectName,
        invoiceId: input.invoiceId || null,
        title: `${input.projectName} Final Files`,
        notes: '',
        status: 'Not Ready',
        accessToken: generateToken(),
        expiresAt: null,
        expirationOption: 'never',
        isReleased: false,
        requiresFullPayment: true,
        accessCount: 0,
        fileCount: 0,
        totalSize: 0,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }

  await setServerDoc(COLLECTIONS.DELIVERIES, input.projectId, base, true)
  const canonical = await getServerDoc(COLLECTIONS.DELIVERIES, input.projectId)
  return { id: input.projectId, data: canonical.data()!, migrated: ordered.length > 0 }
}

function publicUrl(req: NextRequest, token: string) {
  const baseUrl = getServerAppUrl(req)
  return `${baseUrl}/delivery/${encodeURIComponent(token)}`
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const { searchParams } = new URL(req.url)
    const projectId = searchParams.get('projectId')
    if (!projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 })

    const result = await ensureCanonicalDelivery({
      projectId,
      clientId: searchParams.get('clientId') || '',
      clientName: searchParams.get('clientName') || 'Client',
      projectName: searchParams.get('projectName') || 'Project',
      invoiceId: searchParams.get('invoiceId') || '',
    })
    const { id: deliveryId, data } = result
    const fileDocs = await queryServerDocs(COLLECTIONS.DELIVERY_FILES, 'deliveryId', '==', deliveryId)
    const files = fileDocs.map((doc) => {
      const file = doc.data()!
      return {
        id: doc.id,
        fileName: file.fileName,
        originalName: file.originalName,
        fileType: file.fileType,
        fileSize: file.fileSize,
        storagePath: file.storagePath,
        downloadUrl: file.downloadUrl,
        downloadCount: file.downloadCount || 0,
        uploadedAt: toISO(file.uploadedAt),
      }
    }).sort((a, b) => new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime())

    return NextResponse.json({
      delivery: {
        id: deliveryId,
        clientId: data.clientId,
        clientName: data.clientName,
        projectId: data.projectId,
        projectName: data.projectName,
        invoiceId: data.invoiceId || null,
        title: data.title,
        notes: data.notes || '',
        status: data.status || 'Not Ready',
        accessToken: data.accessToken,
        expirationOption: data.expirationOption || 'never',
        expiresAt: toISO(data.expiresAt),
        isReleased: data.isReleased || false,
        requiresFullPayment: data.requiresFullPayment !== false,
        releasedAt: toISO(data.releasedAt),
        accessCount: data.accessCount || 0,
        fileCount: files.length,
        totalSize: data.totalSize || files.reduce((sum, file) => sum + (file.fileSize || 0), 0),
        createdAt: toISO(data.createdAt),
        updatedAt: toISO(data.updatedAt),
      },
      files,
      publicUrl: publicUrl(req, data.accessToken),
      migratedLegacyRecords: result.migrated,
    })
  } catch (error: any) {
    console.error('[Delivery Admin GET] Error:', error?.message)
    return NextResponse.json({ error: 'Failed to load delivery data.' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const { deliveryId, updates } = await req.json()
    if (!deliveryId || !updates) return NextResponse.json({ error: 'Missing delivery update.' }, { status: 400 })
    await updateServerDoc(COLLECTIONS.DELIVERIES, deliveryId, { ...updates, updatedAt: FieldValue.serverTimestamp() })
    const updated = await getServerDoc(COLLECTIONS.DELIVERIES, deliveryId)
    const accessToken = updated.data()?.accessToken
    return NextResponse.json({ success: true, accessToken, publicUrl: accessToken ? publicUrl(req, accessToken) : null })
  } catch (error: any) {
    console.error('[Delivery Admin PATCH] Error:', error?.message)
    return NextResponse.json({ error: 'Failed to update delivery.' }, { status: 500 })
  }
}