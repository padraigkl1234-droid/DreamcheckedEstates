'use client';

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  connectAuthEmulator,
  GoogleAuthProvider,
  signInWithCredential,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  initializeFirestore,
  connectFirestoreEmulator,
  type FirestoreSettings,
  doc,
  getDocFromServer,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { getStorage, connectStorageEmulator, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import appletConfig from '../../firebase-applet-config.json';

// Local development against the Firebase Emulator Suite (`firebase emulators:start`)
// instead of production. Off unless NEXT_PUBLIC_USE_EMULATORS=1 is set, and
// it swaps in a demo-* project id, which the emulators guarantee can never
// reach a real Firebase project.
const useEmulators = process.env.NEXT_PUBLIC_USE_EMULATORS === '1';
const firebaseConfig = useEmulators ? { ...appletConfig, projectId: 'demo-invictus' } : appletConfig;

// Initialize Firebase SDK
const app = initializeApp(firebaseConfig);

// Initialize Firestore with forced long polling and explicit settings to prevent "Disconnecting idle stream" errors.
// These errors are common in iframe/proxy environments where gRPC streams are often interrupted.
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  useFetchStreams: false,
  // Drop undefined fields instead of throwing — e.g. a non-recurring calendar
  // event carries `recurrence: undefined`, which would otherwise fail the whole
  // save and silently stop diary entries (and anything else) from persisting.
  ignoreUndefinedProperties: true,
  host: 'firestore.googleapis.com',
  ssl: true,
  // Offline data sync: cache reads and queue writes on-device so the app keeps
  // working in dead zones (theme parks / event fields) and syncs when signal
  // returns. Multi-tab manager keeps several open tabs consistent.
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  // useFetchStreams is a real (internal) setting the public type omits.
} as FirestoreSettings, firebaseConfig.firestoreDatabaseId);

export const auth = getAuth(app);
export const storage = getStorage(app);

if (useEmulators) {
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectStorageEmulator(storage, '127.0.0.1', 9199);
  // Scripted sign-in for local browser testing: the Auth emulator accepts an
  // unsigned Google ID token. Compiled out unless the emulator flag is set.
  if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__emulatorGoogleSignIn = (email: string, name: string) =>
      signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, email_verified: true, name })));
  }
}
export const googleProvider = new GoogleAuthProvider();

// Validate Connection to Firestore
async function testConnection() {
  try {
    // Attempt to read a dummy doc to verify config
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. The client is offline.");
    }
  }
}
testConnection();

export { onAuthStateChanged, signInWithPopup, signOut };
export type { User };
