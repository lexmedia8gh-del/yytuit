import { NextRequest, NextResponse } from 'next/server'
import { COLLECTIONS } from '@/lib/firebase/firestore'
import { queryServerDocs, getServerDoc, updateServerDoc } from '@/lib/firebase/serverDb'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { supabase } from '@/lib/supabase/client'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { token, fileId } = body

    if (!token || !fileId) {
      return NextResponse.json({ error: 'Missing token or fileId' }, { status: 400 })
    }

    // Validate delivery by token
    const deliveriesSnap = await queryServerDocs(COLLECTIONS.DELIVERIES, 'accessToken', '==', token, 1)

    if (deliveriesSnap.length === 0 || !deliveriesSnap[0].data()) {
      return NextResponse.json({ error: 'Invalid delivery token' }, { status: 404 })
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
        return NextResponse.json({ error: 'This delivery link has expired.' }, { status: 410 })
      }
    }

    // Check payment lock
    if (deliveryData.requiresFullPayment && !deliveryData.isReleased && deliveryData.invoiceId) {
      const invoiceSnap = await getServerDoc(COLLECTIONS.INVOICES, deliveryData.invoiceId)
      if (invoiceSnap.exists && invoiceSnap.data()?.status !== 'Paid') {
        return NextResponse.json({ error: 'Payment required to download files.' }, { status: 403 })
      }
    }

    // Fetch file document
    const fileSnap = await getServerDoc(COLLECTIONS.DELIVERY_FILES, fileId)

    if (!fileSnap.exists || !fileSnap.data()) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    const fileData = fileSnap.data()!
    if (fileData?.deliveryId !== deliveryId) {
      return NextResponse.json({ error: 'File does not belong to this delivery' }, { status: 403 })
    }

    // Increment download count and update timestamp
    await updateServerDoc(COLLECTIONS.DELIVERY_FILES, fileId, {
      downloadCount: FieldValue.increment(1),
      lastDownloadedAt: FieldValue.serverTimestamp(),
    })

    // Update delivery status to 'Downloaded'
    await updateServerDoc(COLLECTIONS.DELIVERIES, deliveryId, {
      status: 'Downloaded',
      updatedAt: FieldValue.serverTimestamp(),
    })

    // Generate secure signed URL with appropriate expiration time (3600 seconds = 1 hour)
    let downloadUrl = fileData.downloadUrl
    if (fileData.storagePath) {
      const { data: signedData, error: signedError } = await supabase.storage
        .from('Delivery files')
        .createSignedUrl(fileData.storagePath, 3600)

      if (!signedError && signedData?.signedUrl) {
        downloadUrl = signedData.signedUrl
      }
    }

    return NextResponse.json({
      success: true,
      downloadUrl,
      fileName: fileData.fileName || fileData.originalName,
    })
  } catch (error: any) {
    console.error('Error in POST /api/delivery/download:', error)
    return NextResponse.json({ error: 'Failed to process file download' }, { status: 500 })
  }
}
