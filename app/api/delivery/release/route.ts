import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'
import { getServerDoc, updateServerDoc } from '@/lib/firebase/serverDb'
import { FieldValue } from 'firebase-admin/firestore'
import { sendDeliveryReadyEmail } from '@/lib/services/brevo'
import { getServerAppUrl } from '@/lib/utils'

export const dynamic = 'force-dynamic'

/**
 * POST /api/delivery/release
 * Body: { deliveryId: string, release: boolean }
 *
 * Atomically updates the delivery release state.
 * Returns the current accessToken so the admin can build the portal URL from server truth.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const body = await req.json()
    const { deliveryId, release } = body as { deliveryId: string; release: boolean }

    if (!deliveryId) {
      return NextResponse.json({ error: 'Missing deliveryId' }, { status: 400 })
    }

    const snap = await getServerDoc(COLLECTIONS.DELIVERIES, deliveryId)

    if (!snap.exists || !snap.data()) {
      return NextResponse.json({ error: 'Delivery not found' }, { status: 404 })
    }

    const deliveryData = snap.data()!
    const willRelease = release !== false // default true

    const updates: any = {
      isReleased: willRelease,
      updatedAt: FieldValue.serverTimestamp(),
    }

    let emailNotificationStatus: { sent: boolean; messageId?: string; error?: string; skipped?: boolean } = { sent: false }

    if (willRelease) {
      updates.releasedAt = FieldValue.serverTimestamp()
      // Escalate status if still draft
      if (!deliveryData.status || deliveryData.status === 'Not Ready') {
        updates.status = 'Ready for Delivery'
      }

      // Check duplicate notification email flag
      if (deliveryData.notifyEmailSent) {
        emailNotificationStatus = { sent: false, skipped: true, error: 'Email notification was already sent for this delivery' }
      } else {
        // Fetch client email from Firestore (server truth)
        let clientEmail = deliveryData.clientEmail || ''
        let clientName = deliveryData.clientName || 'Valued Client'
        let clientLogoUrl = ''

        if (deliveryData.clientId) {
          const clientSnap = await getServerDoc(COLLECTIONS.CLIENTS, deliveryData.clientId)
          if (clientSnap.exists && clientSnap.data()) {
            const clientData = clientSnap.data()!
            if (clientData.email) clientEmail = clientData.email
            if (clientData.fullName) clientName = clientData.fullName
            if (clientData.photoURL) clientLogoUrl = clientData.photoURL
          }
        }

        // Fetch brand logo
        let lexmediaLogoUrl = ''
        const brandingSnap = await getServerDoc(COLLECTIONS.SETTINGS, 'branding')
        if (brandingSnap.exists && brandingSnap.data()) {
          const bData = brandingSnap.data()!
          if (bData.logoUrl) lexmediaLogoUrl = bData.logoUrl
        }

        if (clientEmail) {
          const baseUrl = getServerAppUrl(req)
          const publicUrl = `${baseUrl}/delivery/${encodeURIComponent(deliveryData.accessToken)}`
          const emailRes = await sendDeliveryReadyEmail({
            toEmail: clientEmail,
            clientName,
            projectName: deliveryData.projectName || 'Your Project',
            deliveryUrl: publicUrl,
            lexmediaLogoUrl,
            clientLogoUrl,
          })

          if (emailRes.success) {
            updates.notifyEmailSent = true
            updates.notifyEmailSentAt = FieldValue.serverTimestamp()
            updates.notifyEmailMessageId = emailRes.messageId || null
            emailNotificationStatus = { sent: true, messageId: emailRes.messageId }
          } else {
            emailNotificationStatus = { sent: false, error: emailRes.error }
            console.warn(`[Delivery Release] Brevo email notification failed for delivery ${deliveryId}:`, emailRes.error)
          }
        } else {
          emailNotificationStatus = { sent: false, error: 'Client email address is missing' }
          console.warn(`[Delivery Release] No email address found for client ${deliveryData.clientId}`)
        }
      }
    } else {
      updates.releasedAt = null
      // Revert status to Not Ready if revoking
      if (deliveryData.status === 'Ready for Delivery') {
        updates.status = 'Not Ready'
      }
    }

    await updateServerDoc(COLLECTIONS.DELIVERIES, deliveryId, updates)

    // Return the accessToken from Firestore (source of truth) so admin builds URL from this
    const baseUrl = getServerAppUrl(req)
    return NextResponse.json({
      success: true,
      deliveryId,
      accessToken: deliveryData.accessToken,
      publicUrl: `${baseUrl}/delivery/${encodeURIComponent(deliveryData.accessToken)}`,
      isReleased: willRelease,
      status: updates.status || deliveryData.status,
      emailNotification: emailNotificationStatus,
    })
  } catch (error: any) {
    console.error('[Delivery Release] Error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to update release status' },
      { status: 500 }
    )
  }
}
