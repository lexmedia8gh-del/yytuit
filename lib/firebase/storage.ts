import { supabase } from '@/lib/supabase/client'
import { auth } from './config'

export interface UploadProgressCallback {
  (progress: number, bytesTransferred: number, totalBytes: number): void
}

/**
 * Upload a delivery file directly from the browser/client to Supabase Storage bucket 'Delivery files'
 * over secure HTTPS, bypassing Next.js/Vercel server body limits for large files (>= 10MB),
 * then registers the file metadata via /api/delivery/register-file.
 */
export async function uploadDeliveryFile(
  projectId: string,
  deliveryId: string,
  fileId: string,
  file: File,
  onProgress?: UploadProgressCallback,
  clientId?: string
): Promise<{ downloadUrl: string; storagePath: string }> {
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._\- ]/g, '_').trim() || 'file'
  const storagePath = `deliveries/${projectId}/${deliveryId}/${fileId}/${sanitizedName}`

  if (onProgress) onProgress(10, 0, file.size)

  try {
    // 1. Direct client-side upload to Supabase Storage bucket 'Delivery files'
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('Delivery files')
      .upload(storagePath, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: true,
      })

    if (uploadError) {
      throw new Error(uploadError.message || 'Supabase Storage upload failed')
    }

    if (onProgress) onProgress(75, file.size / 2, file.size)

    // 2. Register metadata with backend API
    let token = ''
    try {
      if (auth?.currentUser) {
        token = await auth.currentUser.getIdToken()
      }
    } catch {}

    const res = await fetch('/api/delivery/register-file', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        projectId,
        deliveryId,
        clientId: clientId || '',
        fileDocId: fileId,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type || file.name.split('.').pop() || 'application/octet-stream',
        storagePath,
      }),
    })

    const resData = await res.json()
    if (!res.ok) {
      throw new Error(resData.error || `Failed to register file metadata (HTTP ${res.status})`)
    }

    if (onProgress) onProgress(100, file.size, file.size)

    return {
      downloadUrl: resData.downloadUrl,
      storagePath: resData.storagePath,
    }
  } catch (err: any) {
    console.error('[Direct Upload Error]', err)
    throw new Error(err?.message || 'Failed to upload file. Please check your connection and try again.')
  }
}

/**
 * Delete a delivery file from Supabase Storage bucket 'Delivery files'
 */
export async function deleteDeliveryFile(storagePath: string): Promise<void> {
  if (!storagePath) return
  try {
    const { error } = await supabase.storage
      .from('Delivery files')
      .remove([storagePath])
    if (error) {
      console.warn('Supabase storage delete warning:', error.message)
    }
  } catch (error: any) {
    console.warn('Storage delete warning:', error?.message)
  }
}

