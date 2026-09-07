import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, requireAdmin } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'
import { db } from '@/lib/firebase/config'
import { collection, doc, getDocs, writeBatch } from 'firebase/firestore'
import { supabase } from '@/lib/supabase/client'
import path from 'path'
import fs from 'fs'

export const dynamic = 'force-dynamic'

/**
 * Recursive helper to list all files in a Supabase Storage bucket
 */
async function listAllBucketFiles(bucketName: string, folder = ''): Promise<string[]> {
  try {
    const { data, error } = await supabase.storage.from(bucketName).list(folder, {
      limit: 100,
      sortBy: { column: 'name', order: 'asc' },
    })

    if (error || !data) return []

    let files: string[] = []
    for (const item of data) {
      const itemPath = folder ? `${folder}/${item.name}` : item.name
      // If folder (no id or metadata), recurse into directory
      if (item.id === null || !item.metadata) {
        const nested = await listAllBucketFiles(bucketName, itemPath)
        files = files.concat(nested)
      } else {
        files.push(itemPath)
      }
    }
    return files
  } catch (e: any) {
    console.warn(`[Reset API] Warning listing bucket "${bucketName}" at "${folder}":`, e?.message)
    return []
  }
}

const hasAdminKey = Boolean(
  process.env.FIREBASE_ADMIN_PRIVATE_KEY && process.env.FIREBASE_ADMIN_CLIENT_EMAIL
)

/**
 * Helper to get count of documents in a collection with Web SDK fallback
 */
async function getCollectionCount(colName: string): Promise<number> {
  if (hasAdminKey) {
    try {
      const adminDb = getAdminDb()
      const snap = await adminDb.collection(colName).get()
      return snap.size
    } catch (e: any) {
      console.warn(`[Reset API] Admin count failed for ${colName}:`, e?.message)
    }
  }

  try {
    const snap = await getDocs(collection(db, colName))
    return snap.size
  } catch {
    return 0
  }
}

/**
 * GET /api/admin/reset-data
 * Returns current counts of all operational records in the database.
 * Used to display an exact pre-reset audit preview to the admin.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const [
      clients,
      projects,
      invoices,
      payments,
      deliveries,
      deliveryFiles,
      clientLinks,
      notifications,
      activityLogs,
      packages,
      services,
    ] = await Promise.all([
      getCollectionCount(COLLECTIONS.CLIENTS),
      getCollectionCount(COLLECTIONS.PROJECTS),
      getCollectionCount(COLLECTIONS.INVOICES),
      getCollectionCount(COLLECTIONS.PAYMENTS),
      getCollectionCount(COLLECTIONS.DELIVERIES),
      getCollectionCount(COLLECTIONS.DELIVERY_FILES),
      getCollectionCount(COLLECTIONS.CLIENT_LINKS),
      getCollectionCount(COLLECTIONS.NOTIFICATIONS),
      getCollectionCount(COLLECTIONS.ACTIVITY_LOGS),
      getCollectionCount(COLLECTIONS.PACKAGES),
      getCollectionCount(COLLECTIONS.SERVICES),
    ])

    return NextResponse.json({
      ok: true,
      counts: {
        clients,
        projects,
        invoices,
        payments,
        deliveries,
        deliveryFiles,
        clientLinks,
        notifications,
        activityLogs,
        packages,
        services,
      },
      preserved: [
        'Admin account & authentication',
        'Business profile & invoice configuration',
        'Ctrl Room branding & uploaded logos',
        'Application system settings',
        'Supabase Storage connection & keys',
        'Brevo email & WhatsApp configuration',
      ],
    })
  } catch (error: any) {
    console.error('[Reset API] Error retrieving counts:', error)
    return NextResponse.json({ ok: false, error: error.message || 'Failed to inspect database records.' }, { status: 500 })
  }
}

/**
 * POST /api/admin/reset-data
 * Performs verified server-side deletion of operational records and associated Supabase Storage files.
 *
 * Body:
 * {
 *   mode: 'clear_test_data' | 'full_operational_reset',
 *   confirmationText: 'RESET',
 *   includeTemplates?: boolean
 * }
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const body = await req.json().catch(() => ({}))
  const { mode, confirmationText, includeTemplates } = body

  // Strict verification guard
  if (confirmationText !== 'RESET') {
    return NextResponse.json(
      { ok: false, error: 'Confirmation failed. You must type RESET exactly to proceed.' },
      { status: 400 }
    )
  }

  if (mode !== 'clear_test_data' && mode !== 'full_operational_reset') {
    return NextResponse.json(
      { ok: false, error: 'Invalid reset mode specified.' },
      { status: 400 }
    )
  }

  const deletedCounts: Record<string, number> = {}
  let filesDeletedCount = 0

  try {
    // ─── 1. Identify & Permanently Delete Files from Supabase Storage ─────
    const storagePathsToDelete = new Set<string>()

    // Gather from deliveryFiles (try Admin SDK first if configured, fallback to Web SDK)
    try {
      let docs: any[] = []
      if (hasAdminKey) {
        try {
          const snap = await getAdminDb().collection(COLLECTIONS.DELIVERY_FILES).get()
          docs = snap.docs
        } catch {
          const snap = await getDocs(collection(db, COLLECTIONS.DELIVERY_FILES))
          docs = snap.docs
        }
      } else {
        const snap = await getDocs(collection(db, COLLECTIONS.DELIVERY_FILES))
        docs = snap.docs
      }

      for (const d of docs) {
        const storagePath = d.data()?.storagePath
        if (storagePath && typeof storagePath === 'string' && !storagePath.startsWith('branding/')) {
          storagePathsToDelete.add(storagePath)
        }
      }
    } catch (e: any) {
      console.warn('[Reset API] Error reading deliveryFiles for storage paths:', e?.message)
    }

    // Gather from generic files collection
    try {
      let docs: any[] = []
      if (hasAdminKey) {
        try {
          const snap = await getAdminDb().collection(COLLECTIONS.FILES).get()
          docs = snap.docs
        } catch {
          const snap = await getDocs(collection(db, COLLECTIONS.FILES))
          docs = snap.docs
        }
      } else {
        const snap = await getDocs(collection(db, COLLECTIONS.FILES))
        docs = snap.docs
      }

      for (const d of docs) {
        const pathVal = d.data()?.storagePath || d.data()?.path
        if (pathVal && typeof pathVal === 'string' && !pathVal.startsWith('branding/')) {
          storagePathsToDelete.add(pathVal)
        }
      }
    } catch (e: any) {
      console.warn('[Reset API] Error reading files collection for storage paths:', e?.message)
    }

    // Also crawl Supabase Storage bucket 'Delivery files' to remove orphaned files
    try {
      const bucketFiles = await listAllBucketFiles('Delivery files')
      for (const f of bucketFiles) {
        if (!f.startsWith('branding/')) {
          storagePathsToDelete.add(f)
        }
      }
    } catch (e: any) {
      console.warn('[Reset API] Error crawling Supabase bucket:', e?.message)
    }

    // Permanently remove from Supabase Storage
    const pathsArray = Array.from(storagePathsToDelete)
    if (pathsArray.length > 0) {
      const chunkSize = 100
      for (let i = 0; i < pathsArray.length; i += chunkSize) {
        const chunk = pathsArray.slice(i, i + chunkSize)
        try {
          const { error } = await supabase.storage.from('Delivery files').remove(chunk)
          if (!error) {
            filesDeletedCount += chunk.length
          } else {
            console.warn('[Reset API] Supabase storage delete chunk error:', error.message)
          }
        } catch (storageErr: any) {
          console.warn('[Reset API] Supabase storage delete exception:', storageErr?.message)
        }
      }
    }

    // ─── 2. Clean Up Local Disk Delivery Uploads (preserving branding) ────
    try {
      const localDeliveriesDir = path.join(process.cwd(), 'public', 'uploads', 'deliveries')
      if (fs.existsSync(localDeliveriesDir)) {
        await fs.promises.rm(localDeliveriesDir, { recursive: true, force: true })
        await fs.promises.mkdir(localDeliveriesDir, { recursive: true })
      }
    } catch (diskErr: any) {
      console.warn('[Reset API] Local deliveries cleanup warning:', diskErr?.message)
    }

    // ─── 3. Helper: Batch Delete Firestore Collections Safely with Fallback ──
    const deleteEntireCollection = async (collectionName: string): Promise<number> => {
      // 1. If Service Account key is configured, use Admin SDK
      if (hasAdminKey) {
        try {
          const adminDb = getAdminDb()
          const collectionRef = adminDb.collection(collectionName)
          const snapshot = await collectionRef.get()
          const total = snapshot.size
          if (total === 0) return 0

          const batchLimit = 400
          for (let i = 0; i < snapshot.docs.length; i += batchLimit) {
            const chunk = snapshot.docs.slice(i, i + batchLimit)
            const batch = adminDb.batch()
            for (const doc of chunk) {
              batch.delete(doc.ref)
            }
            await batch.commit()
          }
          return total
        } catch (adminErr: any) {
          console.warn(`[Reset API] Admin batch delete failed for ${collectionName}, using Web SDK:`, adminErr?.message)
        }
      }

      // 2. Direct Web SDK (fast, client credentials)
      try {
        const colRef = collection(db, collectionName)
        const snap = await getDocs(colRef)
        const total = snap.size
        if (total === 0) return 0

        const batchLimit = 400
        for (let i = 0; i < snap.docs.length; i += batchLimit) {
          const chunk = snap.docs.slice(i, i + batchLimit)
          const batch = writeBatch(db)
          for (const d of chunk) {
            batch.delete(d.ref)
          }
          await batch.commit()
        }
        return total
      } catch (webErr: any) {
        console.warn(`[Reset API] Web SDK delete failed for ${collectionName}:`, webErr?.message)
        return 0
      }
    }

    // ─── 4. Delete Database Collections in Strict Dependency Order ───────
    // Child records first to avoid foreign key / orphan reference issues
    const collectionsOrder: { key: string; name: string }[] = [
      { key: 'deliveryFiles', name: COLLECTIONS.DELIVERY_FILES },
      { key: 'deliveries', name: COLLECTIONS.DELIVERIES },
      { key: 'clientLinks', name: COLLECTIONS.CLIENT_LINKS },
      { key: 'payments', name: COLLECTIONS.PAYMENTS },
      { key: 'invoiceItems', name: COLLECTIONS.INVOICE_ITEMS },
      { key: 'invoices', name: COLLECTIONS.INVOICES },
      { key: 'projects', name: COLLECTIONS.PROJECTS },
      { key: 'clients', name: COLLECTIONS.CLIENTS },
      { key: 'whatsappMessages', name: COLLECTIONS.WHATSAPP_MESSAGES },
      { key: 'notifications', name: COLLECTIONS.NOTIFICATIONS },
      { key: 'activityLogs', name: COLLECTIONS.ACTIVITY_LOGS },
      { key: 'files', name: COLLECTIONS.FILES },
    ]

    // If full operational reset AND includeTemplates is selected:
    if (mode === 'full_operational_reset' && includeTemplates) {
      collectionsOrder.push(
        { key: 'packages', name: COLLECTIONS.PACKAGES },
        { key: 'services', name: COLLECTIONS.SERVICES }
      )
    }

    for (const item of collectionsOrder) {
      const count = await deleteEntireCollection(item.name)
      deletedCounts[item.key] = count
    }

    // ─── 5. Record a Fresh Audit Log Entry ────────────────────────────────
    try {
      const logData = {
        action: 'System Reset Completed',
        entityType: 'System',
        description: `Operational data reset (${
          mode === 'clear_test_data' ? 'Clear Test Data' : 'Full Operational Reset'
        }) executed by admin (${auth.email}). System purged of test records and ready for live production launch.`,
        user: auth.email || 'Administrator',
        timestamp: new Date(),
        createdAt: new Date().toISOString(),
      }
      try {
        await getAdminDb().collection(COLLECTIONS.ACTIVITY_LOGS).add(logData)
      } catch {
        const batch = writeBatch(db)
        const newRef = doc(collection(db, COLLECTIONS.ACTIVITY_LOGS))
        batch.set(newRef, logData)
        await batch.commit()
      }
    } catch (logErr) {
      console.warn('[Reset API] Non-fatal: failed to create audit log entry:', logErr)
    }

    return NextResponse.json({
      ok: true,
      message:
        mode === 'clear_test_data'
          ? 'All operational and test data was permanently cleared. Ctrl Room is pristine and ready for launch.'
          : 'Full operational data reset completed successfully.',
      mode,
      deletedCounts: {
        ...deletedCounts,
        supabaseStorageFiles: filesDeletedCount,
      },
    })
  } catch (error: any) {
    console.error('[Reset API] Critical reset failure:', error)
    return NextResponse.json(
      {
        ok: false,
        error: error.message || 'An unexpected error occurred during database reset.',
        deletedCounts,
      },
      { status: 500 }
    )
  }
}
