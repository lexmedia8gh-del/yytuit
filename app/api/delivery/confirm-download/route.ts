import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'
import { FieldValue } from 'firebase-admin/firestore'
import { supabase } from '@/lib/supabase/client'
import fs from 'fs'
import path from 'path'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { token, fileId } = body

    if (!token || !fileId) {
      return NextResponse.json({ error: 'Missing token or fileId' }, { status: 400 })
    }

    const adminDb = getAdminDb()

    // Validate delivery by token
    const deliveriesSnap = await adminDb
      .collection(COLLECTIONS.DELIVERIES)
      .where('accessToken', '==', token)
      .limit(1)
      .get()

    if (deliveriesSnap.empty) {
      return NextResponse.json({ error: 'Invalid delivery token' }, { status: 404 })
    }

    const deliveryDoc = deliveriesSnap.docs[0]
    const deliveryId = deliveryDoc.id

    // Fetch file document
    const fileDocRef = adminDb.collection(COLLECTIONS.DELIVERY_FILES).doc(fileId)
    const fileSnap = await fileDocRef.get()

    if (!fileSnap.exists) {
      return NextResponse.json({ error: 'File already deleted or not found' }, { status: 404 })
    }

    const fileData = fileSnap.data()
    if (fileData?.deliveryId !== deliveryId) {
      return NextResponse.json({ error: 'File does not belong to this delivery' }, { status: 403 })
    }

    const storagePath = fileData?.storagePath

    // 1. Delete from local server disk (if exists)
    if (storagePath) {
      try {
        const localFilePath = path.join(process.cwd(), 'public', 'uploads', storagePath)
        if (fs.existsSync(localFilePath)) {
          await fs.promises.unlink(localFilePath)
        }
      } catch (err) {
        console.warn('Failed to delete local file copy:', err)
      }
      
      // 2. Delete from Supabase Storage private bucket 'delivery-files'
      try {
        await supabase.storage.from('delivery-files').remove([storagePath])
      } catch (err: any) {
        console.warn('Failed to delete Supabase Storage file:', err?.message)
      }
    }

    // 3. Delete from Firestore
    await fileDocRef.delete()

    // 4. Log the deletion
    await adminDb.collection(COLLECTIONS.ACTIVITY_LOGS).add({
      event: 'delivery_file_deleted',
      description: `Client confirmed download, file deleted: ${fileData?.fileName || fileData?.originalName}`,
      clientId: deliveryDoc.data().clientId,
      entityId: fileId,
      entityType: 'deliveryFile',
      createdAt: FieldValue.serverTimestamp(),
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error in confirm-download:', error)
    return NextResponse.json({ error: 'Failed to confirm download and delete file' }, { status: 500 })
  }
}
