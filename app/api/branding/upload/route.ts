import { NextRequest, NextResponse } from 'next/server'
import { getAdminBucket, requireAdmin } from '@/lib/firebase/admin'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  // Admin auth check
  const auth = await requireAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const fieldKey = (formData.get('fieldKey') as string) || 'logo'

    if (!file) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._\- ]/g, '_').trim() || 'file'
    const timestamp = Date.now()
    const filename = `${timestamp}_${sanitizedName}`
    const storagePath = `branding/${fieldKey}/${filename}`

    let downloadUrl = `/uploads/branding/${fieldKey}/${filename}`
    let uploadedToCloud = false

    // 1. Primary: Upload to Firebase Storage bucket
    try {
      const bucket = getAdminBucket()
      const storageFile = bucket.file(storagePath)
      await storageFile.save(buffer, {
        metadata: {
          contentType: file.type || 'image/png',
          cacheControl: 'public, max-age=31536000',
        },
      })
      downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media`
      uploadedToCloud = true
    } catch (storageErr) {
      console.warn('[Branding Upload] Cloud storage upload warning:', storageErr)
    }

    // 2. Secondary: Local disk cache (if writable)
    try {
      const relativeStorageDir = path.join('uploads', 'branding', fieldKey)
      const absoluteTargetDir = path.join(process.cwd(), 'public', relativeStorageDir)
      await fs.promises.mkdir(absoluteTargetDir, { recursive: true })
      const absoluteFilePath = path.join(absoluteTargetDir, filename)
      await fs.promises.writeFile(absoluteFilePath, buffer)
      if (!uploadedToCloud) {
        downloadUrl = `/uploads/branding/${fieldKey}/${filename}`
      }
    } catch (diskErr) {
      if (!uploadedToCloud) {
        throw new Error('Could not upload branding asset to cloud storage or disk.')
      }
    }

    return NextResponse.json({
      success: true,
      downloadUrl,
    })
  } catch (error: any) {
    console.error('API branding upload error:', error)
    return NextResponse.json(
      { error: error?.message || 'Server upload failed. Please try again.' },
      { status: 500 }
    )
  }
}
