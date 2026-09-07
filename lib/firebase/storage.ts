import { supabase } from '@/lib/supabase/client'
import { auth } from './config'

export interface UploadProgressCallback {
  (progress: number, bytesTransferred: number, totalBytes: number): void
}

/**
 * Upload a delivery file with support for small and large files (10MB+).
 * Uses direct signed URL upload to Supabase Storage as primary method,
 * with fallback to server-side multipart API upload.
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

  let token = ''
  try {
    if (auth?.currentUser) {
      token = await auth.currentUser.getIdToken()
    }
  } catch {}

  try {
    // Attempt 1: Get signed upload URL and PUT directly to Supabase Storage
    const urlRes = await fetch('/api/delivery/upload-url', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        projectId,
        deliveryId,
        fileDocId: fileId,
        fileName: file.name,
        fileType: file.type || 'application/octet-stream',
      }),
    })

    if (urlRes.ok) {
      const urlData = await urlRes.json()
      if (urlData.signedUrl) {
        // Perform direct PUT upload using XMLHttpRequest for progress
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable && onProgress) {
              const pct = Math.round(10 + (e.loaded / e.total) * 65) // 10% to 75%
              onProgress(pct, e.loaded, e.total)
            }
          })
          xhr.timeout = 15 * 60 * 1000 // 15 minutes for large files
          xhr.ontimeout = () => reject(new Error('Upload timed out. Please check your network connection.'))
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve()
            } else {
              reject(new Error(`Direct storage upload failed with HTTP ${xhr.status}`))
            }
          }
          xhr.onerror = () => reject(new Error('Network error during storage upload. Please check your connection.'))
          xhr.open('PUT', urlData.signedUrl)
          xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
          xhr.send(file)
        })

        if (onProgress) onProgress(80, file.size * 0.8, file.size)

        // Register metadata
        const regRes = await fetch('/api/delivery/register-file', {
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
            fileType: file.type || 'application/octet-stream',
            storagePath: urlData.storagePath || storagePath,
          }),
        })

        const regData = await regRes.json()
        if (!regRes.ok) {
          throw new Error(regData.error || 'Failed to register file metadata')
        }

        if (onProgress) onProgress(100, file.size, file.size)
        return {
          downloadUrl: regData.downloadUrl,
          storagePath: regData.storagePath || storagePath,
        }
      }
    }

    // Fallback: Upload via server-side API POST /api/delivery/upload
    const formData = new FormData()
    formData.append('file', file)
    formData.append('projectId', projectId)
    formData.append('deliveryId', deliveryId)
    formData.append('clientId', clientId || '')
    formData.append('fileDocId', fileId)

    const fallbackRes = await fetch('/api/delivery/upload', {
      method: 'POST',
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: formData,
    })

    const fallbackData = await fallbackRes.json()
    if (!fallbackRes.ok) {
      throw new Error(fallbackData.error || 'Server upload failed')
    }

    if (onProgress) onProgress(100, file.size, file.size)
    return {
      downloadUrl: fallbackData.downloadUrl,
      storagePath: fallbackData.storagePath,
    }
  } catch (err: any) {
    console.error('[Upload Delivery File Error]:', err)
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
