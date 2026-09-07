import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'
import { getServerDoc, setServerDoc, updateServerDoc, queryServerDocs } from '@/lib/firebase/serverDb'
import { FieldValue } from 'firebase-admin/firestore'
import { sendDeliveryPaymentRequiredEmail } from '@/lib/services/brevo'
import { getServerAppUrl } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const body = await req.json()
    const { projectId, deliveryId, clientId, fileDocId, fileName, fileSize, fileType, storagePath } = body

    if (!projectId || !deliveryId || !fileDocId || !storagePath || !fileName) {
      return NextResponse.json(
        { error: 'Missing required file registration parameters' },
        { status: 400 }
      )
    }

    const downloadUrl = `/api/files?id=${fileDocId}`

    const fileRecord = {
      deliveryId,
      projectId,
      clientId: clientId || '',
      fileName,
      originalName: fileName,
      fileType: fileType || 'application/octet-stream',
      fileSize: Number(fileSize) || 0,
      storagePath,
      downloadUrl,
      downloadCount: 0,
      uploadedAt: FieldValue.serverTimestamp(),
      uploadedBy: auth.email || 'admin',
    }

    await setServerDoc(COLLECTIONS.DELIVERY_FILES, fileDocId, fileRecord)

    // Atomically increment container metrics and update status
    const deliverySnap = await getServerDoc(COLLECTIONS.DELIVERIES, deliveryId)

    if (deliverySnap.exists) {
      const deliveryData = deliverySnap.data()!
      const currentStatus = deliveryData.status || 'Not Ready'
      const nextStatus = currentStatus === 'Not Ready' ? 'Ready for Delivery' : currentStatus

      const updates: any = {
        fileCount: FieldValue.increment(1),
        totalSize: FieldValue.increment(Number(fileSize) || 0),
        status: nextStatus,
        updatedAt: FieldValue.serverTimestamp(),
      }

      if (nextStatus === 'Ready for Delivery' && !deliveryData.uploadEmailSent) {
        let clientEmail = deliveryData.clientEmail || ''
        let clientName = deliveryData.clientName || 'Valued Client'
        let clientLogoUrl = ''
        const targetClientId = deliveryData.clientId || clientId

        if (targetClientId) {
          const clientSnap = await getServerDoc(COLLECTIONS.CLIENTS, targetClientId)
          if (clientSnap.exists) {
            const cData = clientSnap.data()!
            if (cData.email) clientEmail = cData.email
            if (cData.fullName) clientName = cData.fullName
            if (cData.photoURL) clientLogoUrl = cData.photoURL
          }
        }

        let lexmediaLogoUrl = ''
        const brandingSnap = await getServerDoc(COLLECTIONS.SETTINGS, 'branding')
        if (brandingSnap.exists) {
          const bData = brandingSnap.data()!
          if (bData.logoUrl) lexmediaLogoUrl = bData.logoUrl
        }

        let invoiceId = deliveryData.invoiceId
        if (!invoiceId && projectId) {
          const invDocs = await queryServerDocs(COLLECTIONS.INVOICES, 'projectId', '==', projectId, 1)
          if (invDocs.length > 0) invoiceId = invDocs[0].id
        }

        let amountDue = 0
        if (invoiceId) {
          const invDoc = await getServerDoc(COLLECTIONS.INVOICES, invoiceId)
          if (invDoc.exists) {
            const invData = invDoc.data()!
            amountDue = invData.balanceDue !== undefined ? invData.balanceDue : (invData.total || 0)
          }
        }

        if (clientEmail) {
          const baseUrl = getServerAppUrl(req) || new URL(req.url).origin
          const paymentUrl = `${baseUrl}/delivery/${encodeURIComponent(deliveryData.accessToken || deliveryId)}`

          const emailRes = await sendDeliveryPaymentRequiredEmail({
            toEmail: clientEmail,
            clientName,
            projectName: deliveryData.projectName || 'Your Project',
            amountDue,
            currencySymbol: 'GH₵',
            paymentUrl,
            lexmediaLogoUrl,
            clientLogoUrl,
          })

          if (emailRes.success) {
            updates.uploadEmailSent = true
            updates.uploadEmailSentAt = FieldValue.serverTimestamp()
            updates.uploadEmailMessageId = emailRes.messageId || null
          }
        }
      }

      await updateServerDoc(COLLECTIONS.DELIVERIES, deliveryId, updates)
    }

    return NextResponse.json({
      success: true,
      fileId: fileDocId,
      downloadUrl,
      storagePath,
      fileName,
      fileSize: Number(fileSize) || 0,
    })
  } catch (error: any) {
    console.error('API delivery register-file error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to register uploaded file.' },
      { status: 500 }
    )
  }
}
