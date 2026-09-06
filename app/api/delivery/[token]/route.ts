import { NextRequest, NextResponse } from 'next/server'
import { COLLECTIONS } from '@/lib/firebase/firestore'
import { queryServerDocs, getServerDoc, updateServerDoc, toISOString } from '@/lib/firebase/serverDb'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const token = params.token
    if (!token) {
      return NextResponse.json({ error: 'Missing access token' }, { status: 400 })
    }

    // Find delivery matching accessToken with automatic failover
    const deliveriesSnap = await queryServerDocs(COLLECTIONS.DELIVERIES, 'accessToken', '==', token, 1)

    if (deliveriesSnap.length === 0 || !deliveriesSnap[0].data()) {
      console.warn(`[Delivery] Token not found: ${token.slice(0, 8)}...`)
      return NextResponse.json({ error: 'Delivery not found or link is invalid' }, { status: 404 })
    }

    const deliveryDoc = deliveriesSnap[0]
    const deliveryData = deliveryDoc.data()!
    const deliveryId = deliveryDoc.id

    // Check expiration
    if (deliveryData.expiresAt) {
      let expiresDate: Date
      if (deliveryData.expiresAt instanceof Timestamp) {
        expiresDate = deliveryData.expiresAt.toDate()
      } else if (deliveryData.expiresAt?.seconds) {
        expiresDate = new Date(deliveryData.expiresAt.seconds * 1000)
      } else {
        expiresDate = new Date(deliveryData.expiresAt)
      }
      if (expiresDate.getTime() < Date.now()) {
        return NextResponse.json({
          error: 'This delivery link has expired. Please contact LexMedia for a new link.',
          isExpired: true,
        }, { status: 410 })
      }
    }

    // Check payment lock
    // If admin has manually released → ALWAYS allow access
    // If requiresFullPayment AND not released AND has invoiceId → check invoice
    let isLocked = false
    let lockReason = ''

    if (deliveryData.requiresFullPayment && !deliveryData.isReleased && deliveryData.invoiceId) {
      try {
        const invoiceSnap = await getServerDoc(COLLECTIONS.INVOICES, deliveryData.invoiceId)
        if (invoiceSnap.exists) {
          const invData = invoiceSnap.data()
          if (invData && invData.status !== 'Paid') {
            isLocked = true
            lockReason = 'Delivery files will become available once the project payment is completed. Please contact LexMedia if you believe this is an error.'
          }
        }
      } catch (invErr) {
        console.warn('[Delivery] Could not fetch invoice for lock check:', invErr)
      }
    }

    if (isLocked) {
      return NextResponse.json({
        isLocked: true,
        lockReason,
        delivery: {
          title: deliveryData.title,
          projectName: deliveryData.projectName,
          clientName: deliveryData.clientName,
        }
      }, { status: 403 })
    }

    // Fetch delivery files in memory sort
    const filesSnap = await queryServerDocs(COLLECTIONS.DELIVERY_FILES, 'deliveryId', '==', deliveryId)

    const files = filesSnap
      .map((d) => {
        const fd = d.data()!
        const uploadedAtISO = toISOString(fd.uploadedAt)
        return {
          id: d.id,
          fileName: fd.fileName,
          originalName: fd.originalName,
          fileType: fd.fileType,
          fileSize: fd.fileSize,
          downloadUrl: fd.downloadUrl,
          downloadCount: fd.downloadCount || 0,
          uploadedAt: uploadedAtISO,
          _uploadedAtMs: uploadedAtISO ? new Date(uploadedAtISO).getTime() : 0,
        }
      })
      .sort((a, b) => b._uploadedAtMs - a._uploadedAtMs)
      .map(({ _uploadedAtMs, ...f }) => f)

    // Track access
    const isFirstAccess = !deliveryData.firstAccessedAt
    const updates: any = {
      lastAccessedAt: FieldValue.serverTimestamp(),
      accessCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    }

    if (isFirstAccess) {
      updates.firstAccessedAt = FieldValue.serverTimestamp()
      if (deliveryData.status === 'Ready for Delivery' || deliveryData.status === 'Not Ready') {
        updates.status = 'Delivered'
      }
    }

    try {
      await updateServerDoc(COLLECTIONS.DELIVERIES, deliveryId, updates)
    } catch (updateErr) {
      console.warn('[Delivery] Non-fatal: Could not update access tracking:', updateErr)
    }

    const toISO = (ts: any): string | null => toISOString(ts)
    const totalSize = files.reduce((s, f) => s + (f.fileSize || 0), 0)

    return NextResponse.json({
      delivery: {
        id: deliveryId,
        title: deliveryData.title,
        projectName: deliveryData.projectName,
        clientName: deliveryData.clientName,
        status: deliveryData.status,
        isReleased: deliveryData.isReleased || false,
        expiresAt: toISO(deliveryData.expiresAt),
        releasedAt: toISO(deliveryData.releasedAt),
        notes: deliveryData.notes || '',
        fileCount: files.length,
        totalSize: deliveryData.totalSize || totalSize,
      },
      files,
    })
  } catch (error: any) {
    const message = error?.message || 'Unknown delivery lookup error'
    console.error('[Delivery] Lookup failure:', { code: error?.code, message })
    return NextResponse.json(
      {
        error: 'Delivery records are temporarily unavailable. Please try again later.',
        code: 'DELIVERY_DATABASE_ERROR',
      },
      { status: 500 }
    )
  }
}
