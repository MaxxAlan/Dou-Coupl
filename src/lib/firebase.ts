import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
const firebaseConfig = {
  apiKey: (import.meta as any).env.VITE_FIREBASE_API_KEY || '',
  authDomain: (import.meta as any).env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: (import.meta as any).env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: (import.meta as any).env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: (import.meta as any).env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: (import.meta as any).env.VITE_FIREBASE_APP_ID || '',
  measurementId: (import.meta as any).env.VITE_FIREBASE_MEASUREMENT_ID || '',
};

export let firebaseInitError: string | null = null;
export let app: any = null;
export let db: any = null;
export let auth: any = null;
export let storage: any = null;

try {
  if (!firebaseConfig.apiKey) {
    throw new Error('VITE_FIREBASE_API_KEY is not defined. Please check your .env file or Github repository secrets configuration.');
  }
  // Initialize Firebase SDK
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
  storage = getStorage(app);
} catch (error: any) {
  firebaseInitError = error instanceof Error ? error.message : String(error);
  console.error('Firebase Initialization failed:', error);
}

// Operational types for precise security-rule diagnostics
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Security / Operation Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
