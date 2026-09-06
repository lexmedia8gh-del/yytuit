import { NextRequest, NextResponse } from 'next/server'
import { getServerAppUrl, isLocalhostOrDevUrl } from '@/lib/utils'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { token, email, amount, invoiceNumber, clientName, origin: clientOrigin, callbackUrl: customCallbackUrl } = body

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Invalid payment amount' }, { status: 400 })
    }

    const paystackSecret = process.env.PAYSTACK_SECRET_KEY
    if (!paystackSecret || paystackSecret.includes('xxxxxxxx')) {
      return NextResponse.json(
        { error: 'Paystack Secret Key is not configured correctly on the server.' },
        { status: 500 }
      )
    }

    const amountInSubunits = Math.round(amount * 100)
    const reference = `LXM_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
    
    // Robustly determine production application URL
    let appUrl = ''
    if (clientOrigin && !isLocalhostOrDevUrl(clientOrigin)) {
      appUrl = clientOrigin.trim().replace(/\/$/, '')
    } else {
      appUrl = getServerAppUrl(req)
    }

    if (!appUrl || (isLocalhostOrDevUrl(appUrl) && clientOrigin)) {
      appUrl = clientOrigin?.trim().replace(/\/$/, '') || appUrl
    }

    if (appUrl && !appUrl.startsWith('http')) {
      appUrl = `https://${appUrl}`
    }

    // Build the callback URL ensuring it points to the deployed production domain
    let callbackUrl = ''
    if (customCallbackUrl && !isLocalhostOrDevUrl(customCallbackUrl)) {
      callbackUrl = customCallbackUrl
    } else {
      callbackUrl = `${appUrl}/pay/${encodeURIComponent(token)}?reference=${encodeURIComponent(reference)}`
    }

    console.log('[Paystack Init] Reference:', reference, 'Callback URL:', callbackUrl)

    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${paystackSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: email || 'client@lexmedia.com',
        amount: amountInSubunits,
        reference,
        callback_url: callbackUrl,
        metadata: {
          token,
          invoiceNumber,
          clientName,
          custom_fields: [
            {
              display_name: 'Invoice Number',
              variable_name: 'invoice_number',
              value: invoiceNumber || 'N/A',
            },
          ],
        },
      }),
    })

    const data = await response.json()
    
    if (!response.ok || !data.status) {
      throw new Error(data.message || 'Paystack API initialization failed')
    }

    if (data.status && data.data?.authorization_url) {
      return NextResponse.json({
        status: true,
        authorization_url: data.data.authorization_url,
        reference,
        access_code: data.data.access_code,
      })
    }
    
    throw new Error('Failed to get authorization URL from Paystack')
  } catch (error: any) {
    console.error('Paystack initialization error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to initialize Paystack payment' },
      { status: 500 }
    )
  }
}
