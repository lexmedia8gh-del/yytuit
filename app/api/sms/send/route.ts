import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, requireAdmin } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'
import { db } from '@/lib/firebase/config'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import type { BusinessSettings, Client } from '@/lib/types'

export const dynamic = 'force-dynamic'

const DEFAULT_SMS_TEMPLATE = `Hello {client_name},

Welcome to Ctrl Room!

Your information has been successfully added to our system. We look forward to working with you.

Thank you!`

function formatGhanaPhone(phone: string): string {
  const cleaned = phone.replace(/[^0-9+]/g, '')
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    return '+233' + cleaned.slice(1)
  }
  if (cleaned.startsWith('233') && !cleaned.startsWith('+233')) {
    return '+' + cleaned
  }
  if (!cleaned.startsWith('+') && cleaned.length >= 9) {
    return '+233' + cleaned
  }
  return cleaned
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const { clientId, phone, fullName, templateOverride } = body

    if (!phone || !phone.trim()) {
      return NextResponse.json({ ok: false, error: 'Recipient phone number is required for SMS.' }, { status: 400 })
    }

    const clientName = fullName || 'Valued Client'
    const formattedPhone = formatGhanaPhone(phone)

    // 1. Fetch Business Settings for Textbelt API key & template
    let settings: Partial<BusinessSettings> = {}
    try {
      const adminDb = getAdminDb()
      const settingsDoc = await adminDb.collection(COLLECTIONS.SETTINGS).doc('business').get()
      if (settingsDoc.exists) {
        settings = settingsDoc.data() as BusinessSettings
      }
    } catch {
      try {
        const sSnap = await getDoc(doc(db, COLLECTIONS.SETTINGS, 'business'))
        if (sSnap.exists()) {
          settings = sSnap.data() as BusinessSettings
        }
      } catch (e) {
        console.warn('[SMS API] Could not load business settings:', e)
      }
    }

    const apiKey = settings.textbeltApiKey || process.env.TEXTBELT_API_KEY || 'textbelt'
    const template = templateOverride || settings.newClientSmsTemplate || DEFAULT_SMS_TEMPLATE

    // 2. Format message with placeholders (clean plain-text only)
    const message = template
      .replace(/\{client_name\}/g, clientName)
      .replace(/\{client_phone\}/g, formattedPhone)
      .trim()

    // 3. Inspect message for URLs or web addresses to prevent Textbelt URL rejection
    const hasUrl = /https?:\/\/|www\.|\.com|\.gh|\.org|\.net|\.io/i.test(message)
    if (hasUrl) {
      console.warn('[Textbelt SMS Warning] Message contains potential URL or web address which may be blocked by Textbelt free tier:', message)
    }

    // Temporary safe debugging logging final SMS message and recipient without exposing API key
    console.log('[Textbelt SMS Debug] Sending plain-text message to:', formattedPhone)
    console.log('[Textbelt SMS Debug] Message content:\n', message)

    // 4. Send via Textbelt API (only sending phone, message, key)
    const textbeltRes = await fetch('https://textbelt.com/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: formattedPhone,
        message,
        key: apiKey,
      }),
    })

    const textbeltData = await textbeltRes.json()

    const smsSent = Boolean(textbeltData.success)
    const smsError = textbeltData.success ? null : (textbeltData.error || 'Textbelt SMS delivery failed.')

    // 4. Update Client record if clientId provided
    if (clientId) {
      const updatePayload = {
        smsAttempted: true,
        smsSent,
        smsSentAt: new Date(),
        smsError: smsError || null,
        smsMessage: message,
      }

      try {
        const adminDb = getAdminDb()
        await adminDb.collection(COLLECTIONS.CLIENTS).doc(clientId).update(updatePayload)
      } catch {
        try {
          await updateDoc(doc(db, COLLECTIONS.CLIENTS, clientId), updatePayload)
        } catch (dbErr) {
          console.warn('[SMS API] Failed to update client SMS status in Firestore:', dbErr)
        }
      }

      // Also record an activity log entry
      try {
        const logData = {
          action: smsSent ? 'Welcome SMS Sent' : 'Welcome SMS Failed',
          entityType: 'Client',
          clientId,
          description: smsSent
            ? `Welcome SMS successfully sent to ${clientName} (${formattedPhone}) via Textbelt.`
            : `Welcome SMS failed for ${clientName} (${formattedPhone}): ${smsError}`,
          user: auth.email || 'Administrator',
          timestamp: new Date(),
          createdAt: new Date().toISOString(),
        }
        try {
          const adminDb = getAdminDb()
          await adminDb.collection(COLLECTIONS.ACTIVITY_LOGS).add(logData)
        } catch {
          // ignore or fallback
        }
      } catch (logErr) {
        console.warn('[SMS API] Non-fatal log error:', logErr)
      }
    }

    if (textbeltData.success) {
      return NextResponse.json({
        ok: true,
        message: 'SMS sent successfully via Textbelt',
        textId: textbeltData.textId,
        quotaRemaining: textbeltData.quotaRemaining,
      })
    } else {
      return NextResponse.json({
        ok: false,
        error: textbeltData.error || 'Textbelt rejected the SMS request.',
      }, { status: 400 })
    }
  } catch (error: any) {
    console.error('[SMS API Error]:', error)
    return NextResponse.json({ ok: false, error: error.message || 'Internal server error while sending SMS.' }, { status: 500 })
  }
}
