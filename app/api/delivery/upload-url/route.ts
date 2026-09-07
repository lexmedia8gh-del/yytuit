import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/firebase/admin'
import { supabase } from '@/lib/supabase/client'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const body = await req.json()
    const { projectId, deliveryId, fileDocId, fileName, fileType } = body

    if (!projectId || !deliveryId || !fileDocId || !fileName) {
      return NextResponse.json(
        { error: 'Missing required parameters for upload URL' },
        { status: 400 }
      )
    }

    const sanitizedName = fileName.replace(/[^a-zA-Z0-9._\- ]/g, '_').trim() || 'file'
    const storagePath = `deliveries/${projectId}/${deliveryId}/${fileDocId}/${sanitizedName}`

    // Create signed upload URL from Supabase Storage
    const { data, error } = await supabase.storage
      .from('Delivery files')
      .createSignedUploadUrl(storagePath)

    if (error || !data) {
      throw new Error(error?.message || 'Failed to generate signed upload URL')
    }

    return NextResponse.json({
      success: true,
      signedUrl: data.signedUrl,
      token: data.token,
      path: storagePath,
      storagePath,
    })
  } catch (error: any) {
    console.error('API delivery upload-url error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to create upload URL.' },
      { status: 500 }
    )
  }
}
