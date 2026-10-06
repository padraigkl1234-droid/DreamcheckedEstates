'use client';

// Hotel photos: uploaded to Storage under hotel/{teamId}/…, referenced from
// the team-scoped Firestore doc they belong to.
//
// Firestore already queues writes offline, but Storage uploads don't. Fault
// photos therefore go through a small IndexedDB outbox: the photo is saved on
// the device first, then uploaded and attached to the fault whenever there's
// a connection (now, on the next `online` event, or the next time the hub is
// opened). The fault itself carries `pendingPhotos` so the queue can show
// that a photo is on its way.

import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import { downscaleImage } from '@/lib/imageResize';
import { attachFaultPhoto } from '@/lib/hotel/actions';
import type { HotelPhoto } from '@/lib/hotel/types';

export async function uploadHotelPhoto(teamId: string, file: File | Blob, name: string): Promise<HotelPhoto> {
  const shrunk = file instanceof File ? await downscaleImage(file) : file;
  const safe = name.replace(/[^a-z0-9.\-_]+/gi, '-').slice(-60) || 'photo.jpg';
  const path = `hotel/${teamId}/${new Date().toISOString().slice(0, 7)}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
  const r = storageRef(storage, path);
  await uploadBytes(r, shrunk, { contentType: shrunk.type || 'image/jpeg' });
  return { url: await getDownloadURL(r), path, name, uploadedAt: Date.now() };
}

// ---- Outbox --------------------------------------------------------------

interface OutboxItem {
  id: string;
  teamId: string;
  faultId: string;
  field: 'photos' | 'afterPhotos';
  name: string;
  blob: Blob;
  queuedAt: number;
}

const DB_NAME = 'invictus-hotel-outbox';
const STORE = 'photos';

function openOutbox(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const idb = await openOutbox();
  return new Promise<T>((resolve, reject) => {
    const tx = idb.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => idb.close();
  });
}

/** Save photos for a fault on this device, then try to send them. */
export async function queueFaultPhotos(teamId: string, faultId: string, field: OutboxItem['field'], files: File[]) {
  for (const file of files) {
    // Shrink before storing so a dozen queued photos don't fill the phone.
    const blob = await downscaleImage(file);
    const item: OutboxItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      teamId,
      faultId,
      field,
      name: file.name || 'photo.jpg',
      blob,
      queuedAt: Date.now(),
    };
    await withStore('readwrite', (s) => s.put(item));
  }
  void flushPhotoOutbox();
}

export async function pendingPhotoCount(): Promise<number> {
  if (typeof indexedDB === 'undefined') return 0;
  return withStore('readonly', (s) => s.count());
}

let flushing: Promise<void> | null = null;

/** Upload everything waiting in the outbox. Safe to call any time. */
export function flushPhotoOutbox(): Promise<void> {
  if (typeof indexedDB === 'undefined' || (typeof navigator !== 'undefined' && !navigator.onLine)) return Promise.resolve();
  if (flushing) return flushing;
  flushing = (async () => {
    try {
      const items = await withStore<OutboxItem[]>('readonly', (s) => s.getAll() as IDBRequest<OutboxItem[]>);
      for (const item of items) {
        try {
          const photo = await uploadHotelPhoto(item.teamId, item.blob, item.name);
          // Queued by Firestore if the connection drops again right here.
          void attachFaultPhoto(item.faultId, item.field, photo).catch((e) => console.error('Attaching photo failed:', e));
          await withStore('readwrite', (s) => s.delete(item.id));
        } catch (err) {
          console.error('Photo upload failed; will retry later:', err);
          break; // probably offline again — keep the rest for next time
        }
      }
    } finally {
      flushing = null;
      window.dispatchEvent(new Event('hotel-outbox-changed'));
    }
  })();
  return flushing;
}
