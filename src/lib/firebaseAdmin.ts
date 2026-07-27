import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';
import firebaseConfig from '../../firebase-applet-config.json';

// Server-side Firebase Admin, used by the Show Board webhook to flip checklist
// lights green when a Microsoft Form is submitted (via a Power Automate flow).
// Credentials come from the FIREBASE_SERVICE_ACCOUNT_JSON environment variable.

let cachedDb: Firestore | null = null;

function getAdminApp(): App {
  const existing = getApps();
  if (existing.length) return existing[0];

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON environment variable is not set');
  }
  const serviceAccount = JSON.parse(raw);
  return initializeApp({ credential: cert(serviceAccount) });
}

// Firestore targeting the same named database the client uses.
export function getAdminDb(): Firestore {
  if (cachedDb) return cachedDb;
  const app = getAdminApp();
  cachedDb = getFirestore(app, firebaseConfig.firestoreDatabaseId);
  return cachedDb;
}

// Admin Auth — used by the team-control endpoint to verify ID tokens and
// disable/enable user accounts.
export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}

// Admin Cloud Messaging — used to send push notifications to device tokens.
export function getAdminMessaging(): Messaging {
  return getMessaging(getAdminApp());
}
