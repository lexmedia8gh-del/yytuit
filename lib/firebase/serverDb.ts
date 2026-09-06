import { getAdminDb } from './admin'
import { db } from './config'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  limit as firestoreLimit,
  serverTimestamp as webServerTimestamp,
  increment as webIncrement,
  Timestamp,
} from 'firebase/firestore'
import { FieldValue } from 'firebase-admin/firestore'

export interface ServerDocResult<T = any> {
  exists: boolean
  id: string
  data: () => T | undefined
}

/**
 * Normalizes timestamps to ISO strings safely
 */
export function toISOString(ts: any): string | null {
  if (!ts) return null
  if (ts instanceof Timestamp) return ts.toDate().toISOString()
  if (typeof ts?.toDate === 'function') return ts.toDate().toISOString()
  if (ts?.seconds) return new Date(ts.seconds * 1000).toISOString()
  if (ts instanceof Date) return ts.toISOString()
  if (typeof ts === 'string') return ts
  return null
}

/**
 * Fetch a single document by ID, trying Admin SDK first and falling back to Web SDK
 */
export async function getServerDoc<T = any>(
  collectionName: string,
  docId: string
): Promise<ServerDocResult<T>> {
  try {
    const adminDb = getAdminDb()
    const snap = await adminDb.collection(collectionName).doc(docId).get()
    return {
      exists: snap.exists,
      id: snap.id,
      data: () => snap.data() as T | undefined,
    }
  } catch (adminErr) {
    console.warn(`[serverDb] Admin get failed for ${collectionName}/${docId}, using Web SDK:`, (adminErr as any)?.message)
    const docRef = doc(db, collectionName, docId)
    const snap = await getDoc(docRef)
    return {
      exists: snap.exists(),
      id: snap.id,
      data: () => snap.data() as T | undefined,
    }
  }
}

/**
 * Set a document by ID with automatic failover between Admin SDK and Web SDK
 */
export async function setServerDoc(
  collectionName: string,
  docId: string,
  data: any,
  merge = true
): Promise<void> {
  try {
    const adminDb = getAdminDb()
    await adminDb.collection(collectionName).doc(docId).set(data, { merge })
  } catch (adminErr) {
    console.warn(`[serverDb] Admin set failed for ${collectionName}/${docId}, using Web SDK:`, (adminErr as any)?.message)
    // Convert FieldValue serverTimestamp / increment for Web SDK if needed
    const cleanedData = cleanDataForWebSdk(data)
    const docRef = doc(db, collectionName, docId)
    await setDoc(docRef, cleanedData, { merge })
  }
}

/**
 * Update a document by ID with automatic failover
 */
export async function updateServerDoc(
  collectionName: string,
  docId: string,
  updates: any
): Promise<void> {
  try {
    const adminDb = getAdminDb()
    await adminDb.collection(collectionName).doc(docId).update(updates)
  } catch (adminErr) {
    console.warn(`[serverDb] Admin update failed for ${collectionName}/${docId}, using Web SDK:`, (adminErr as any)?.message)
    const cleanedUpdates = cleanDataForWebSdk(updates)
    const docRef = doc(db, collectionName, docId)
    await updateDoc(docRef, cleanedUpdates)
  }
}

/**
 * Query documents with automatic failover
 */
export async function queryServerDocs<T = any>(
  collectionName: string,
  field: string,
  opStr: '==' | '<=' | '>=' | '<' | '>',
  value: any,
  maxResults?: number
): Promise<Array<ServerDocResult<T>>> {
  try {
    const adminDb = getAdminDb()
    let q: any = adminDb.collection(collectionName).where(field, opStr as any, value)
    if (maxResults) {
      q = q.limit(maxResults)
    }
    const snap = await q.get()
    return snap.docs.map((d: any) => ({
      exists: true,
      id: d.id,
      data: () => d.data() as T,
    }))
  } catch (adminErr) {
    console.warn(`[serverDb] Admin query failed for ${collectionName}, using Web SDK:`, (adminErr as any)?.message)
    let q = query(collection(db, collectionName), where(field, opStr as any, value))
    if (maxResults) {
      q = query(q, firestoreLimit(maxResults))
    }
    const snap = await getDocs(q)
    return snap.docs.map((d) => ({
      exists: true,
      id: d.id,
      data: () => d.data() as T,
    }))
  }
}

/**
 * Converts Admin FieldValue sentinel values into Web SDK equivalents
 */
function cleanDataForWebSdk(obj: any): any {
  if (obj === null || obj === undefined) return obj
  if (typeof obj !== 'object') return obj

  // Check for Admin FieldValue serverTimestamp
  if (obj === FieldValue.serverTimestamp() || obj?.isEqual?.(FieldValue.serverTimestamp())) {
    return webServerTimestamp()
  }

  // Check if it looks like an Admin FieldValue
  if (obj.constructor?.name === 'NumericIncrementTransform') {
    const operand = (obj as any).operand ?? 1
    return webIncrement(operand)
  }

  if (Array.isArray(obj)) {
    return obj.map(cleanDataForWebSdk)
  }

  const result: Record<string, any> = {}
  for (const [key, val] of Object.entries(obj)) {
    if (val && typeof val === 'object' && val.constructor?.name === 'ServerTimestampTransform') {
      result[key] = webServerTimestamp()
    } else if (val && typeof val === 'object' && val.constructor?.name === 'NumericIncrementTransform') {
      result[key] = webIncrement((val as any).operand ?? 1)
    } else {
      result[key] = cleanDataForWebSdk(val)
    }
  }
  return result
}
