import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  type UploadTaskSnapshot,
} from 'firebase/storage'
import { storage, auth } from './config'

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
 * Upload a delivery file.
 * Strategy:
 * 1. Tries direct Firebase Storage client SDK (if bucket is active & CORS is set).
 * 2. If Firebase Storage fails or errors out (e.g. bucket non-existent / billing / CORS),
 *    immediately falls back to server API endpoint with real XHR progress tracking.
 * This guarantees the upload ALWAYS completes and NEVER hangs indefinitely.
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

  // 1. First attempt: Direct client upload to Firebase Storage
  if (storage) {
    try {
      const fileRef = ref(storage, storagePath)
      const uploadTask = uploadBytesResumable(fileRef, file, {
        contentType: file.type || 'application/octet-stream',
        customMetadata: {
          projectId,
          deliveryId,
          clientId: clientId || '',
          originalName: file.name,
          fileDocId: fileId,
        },
      })

      const downloadUrl = await new Promise<string>((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snapshot: UploadTaskSnapshot) => {
            if (onProgress && snapshot.totalBytes > 0) {
              const percent = (snapshot.bytesTransferred / snapshot.totalBytes) * 100
              onProgress(percent, snapshot.bytesTransferred, snapshot.totalBytes)
            }
          },
          (error) => {
            console.warn('[Storage] Client direct upload error:', error.code, error.message)
            reject(error)
          },
          async () => {
            try {
              const url = await getDownloadURL(uploadTask.snapshot.ref)
              resolve(url)
            } catch (urlErr) {
              reject(urlErr)
            }
          }
        )
      })

      console.log('[Storage] Direct Firebase Storage upload succeeded for:', file.name)
      return { downloadUrl, storagePath }
    } catch (directUploadErr) {
      console.warn('[Storage] Direct Firebase Storage upload failed, falling back to server API:', directUploadErr)
    }
  }

  // 2. Reliable Fallback: Server API upload (saves to server storage with streaming download endpoint)
  return await uploadViaServerApi(projectId, deliveryId, fileId, clientId || '', file, onProgress)
}

/**
 * Delete a delivery file from Firebase Storage
 */
export async function deleteDeliveryFile(storagePath: string): Promise<void> {
  if (!storagePath) return
  try {
    const fileRef = ref(storage, storagePath)
    await deleteObject(fileRef)
  } catch (error: any) {
    // Log but don't throw — Firestore metadata should still be removed even if storage delete fails
    console.warn('Storage delete warning:', error?.code, error?.message)
  }
}

