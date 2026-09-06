import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, getAdminBucket } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const fileId = searchParams.get('id')

  if (!fileId) {
    return NextResponse.json({ error: 'Missing file id parameter' }, { status: 400 })
  }

  try {
    const adminDb = getAdminDb()
    const fileDoc = await adminDb.collection(COLLECTIONS.DELIVERY_FILES).doc(fileId).get()

    if (!fileDoc.exists) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    const data = fileDoc.data()
    const storagePath = data?.storagePath
    const fileName = data?.fileName || data?.originalName || 'download'
    const mimeType = data?.fileType || 'application/octet-stream'

    if (!storagePath) {
      return NextResponse.json({ error: 'Storage path not found' }, { status: 404 })
    }

    // 1. Primary: Stream from Firebase Storage bucket
    try {
      const bucket = getAdminBucket()
      const storageFile = bucket.file(storagePath)
      const [exists] = await storageFile.exists()

      if (exists) {
        const [fileBuffer] = await storageFile.download()
        return new NextResponse(new Uint8Array(fileBuffer), {
          status: 200,
          headers: {
            'Content-Type': mimeType,
            'Content-Disposition': 'inline; filename="' + encodeURIComponent(fileName) + '"',
            'Content-Length': fileBuffer.length.toString(),
            'Cache-Control': 'public, max-age=3600',
          },
        })
      }
    } catch (storageErr) {
      console.warn('[Files API] Could not load from Firebase Storage, checking disk fallback:', storageErr)
    }

    // 2. Secondary: Fallback to local disk (e.g. dev environment uploads)
    const localFilePath = path.join(process.cwd(), 'public', 'uploads', storagePath)
    if (fs.existsSync(localFilePath)) {
      const fileBuffer = await fs.promises.readFile(localFilePath)
      return new NextResponse(new Uint8Array(fileBuffer), {
        status: 200,
        headers: {
          'Content-Type': mimeType,
          'Content-Disposition': 'inline; filename="' + encodeURIComponent(fileName) + '"',
          'Content-Length': fileBuffer.length.toString(),
          'Cache-Control': 'public, max-age=3600',
        },
      })
    }

    return NextResponse.json(
      { error: 'File data could not be located in storage bucket or on disk.' },
      { status: 404 }
    )
  } catch (err: any) {
    console.error('File stream error:', err)
    return NextResponse.json({ error: 'Failed to retrieve file' }, { status: 500 })
  }
}
