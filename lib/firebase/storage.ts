import { supabase } from '@/lib/supabase/client'
import { auth } from './config'

export interface UploadProgressCallback {
  (progress: number, bytesTransferred: number, totalBytes: number): void
}

/**
 * Upload via server-side API with real upload progress tracking using XMLHttpRequest
 */
async function uploadViaServerApi(
  projectId: string,
  deliveryId: string,
  fileId: string,
  clientId: string,
  file: File,
  onProgress?: UploadProgressCallback
): Promise<{ downloadUrl: string; storagePath: string }> {
  let token = ''
  try {
    if (auth?.currentUser) {
      token = await auth.currentUser.getIdToken()
    }
  } catch {}

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const formData = new FormData()
    formData.append('file', file)
    formData.append('projectId', projectId)
    formData.append('deliveryId', deliveryId)
    formData.append('clientId', clientId || '')
    formData.append('fileDocId', fileId)

    // Progress listener
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        const percent = (e.loaded / e.total) * 100
        onProgress(percent, e.loaded, e.total)
      }
    })

    // Timeout (5 minutes for network file transfer)
    xhr.timeout = 5 * 60 * 1000
    xhr.ontimeout = () => {
      reject(new Error('Upload timed out. Please check your network connection.'))
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText)
          if (res.downloadUrl) {
            resolve({
              downloadUrl: res.downloadUrl,
              storagePath: res.storagePath,
            })
          } else {
            reject(new Error(res.error || 'Server upload failed.'))
          }
        } catch {
          reject(new Error('Invalid response from upload server.'))
        }
      } else {
        try {
          const errRes = JSON.parse(xhr.responseText)
          reject(new Error(errRes.error || `Upload failed with HTTP ${xhr.status}`))
        } catch {
          reject(new Error(`Upload failed with HTTP ${xhr.status}`))
        }
      }
    }

    xhr.onerror = () => {
      reject(new Error('Network error during file upload. Please check your connection.'))
    }

    xhr.open('POST', '/api/delivery/upload')
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    }
    xhr.withCredentials = true
    xhr.send(formData)
  })
}

/**
 * Upload a delivery file to Supabase Storage bucket 'Delivery files'.
 */
export async function uploadDeliveryFile(
  projectId: string,
  deliveryId: string,
  fileId: string,
  file: File,
  onProgress?: UploadProgressCallback,
  clientId?: string
): Promise<{ downloadUrl: string; storagePath: string }> {
  // Uses server API upload which stores in Supabase Storage private bucket 'Delivery files'
  return await uploadViaServerApi(projectId, deliveryId, fileId, clientId || '', file, onProgress)
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
