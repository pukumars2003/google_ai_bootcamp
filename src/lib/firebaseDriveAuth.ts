import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  Auth,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

let isSigningIn = false;
// In-memory access token cache (never stored in localStorage/sessionStorage)
let cachedAccessToken: string | null = null;
let cachedAuth: Auth | null = null;

function getResolvedFirebaseConfig() {
  const apiKey =
    (import.meta.env.VITE_FIREBASE_API_KEY as string | undefined)?.trim() ||
    firebaseConfig.apiKey?.trim() ||
    '';

  return {
    ...firebaseConfig,
    apiKey,
  };
}

export function isDriveAuthConfigured(): boolean {
  const cfg = getResolvedFirebaseConfig();
  return Boolean(cfg.apiKey && cfg.projectId && cfg.appId);
}

function getFirebaseAuth(): Auth | null {
  if (cachedAuth) return cachedAuth;
  const cfg = getResolvedFirebaseConfig();
  if (!cfg.apiKey || !cfg.projectId || !cfg.appId) {
    return null;
  }

  try {
    const app: FirebaseApp =
      getApps().length === 0 ? initializeApp(cfg) : getApps()[0];
    cachedAuth = getAuth(app);
    return cachedAuth;
  } catch (err) {
    console.warn('Firebase Auth initialization skipped:', err);
    return null;
  }
}

function buildGoogleProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  DRIVE_SCOPES.forEach((scope) => provider.addScope(scope));
  return provider;
}

export const initDriveAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthSignedOut?: () => void
) => {
  const auth = getFirebaseAuth();
  if (!auth) {
    onAuthSignedOut?.();
    return () => {};
  }

  return onAuthStateChanged(auth, (user: User | null) => {
    if (user && cachedAccessToken) {
      onAuthSuccess?.(user, cachedAccessToken);
    } else if (!isSigningIn) {
      if (!user) {
        cachedAccessToken = null;
      }
      onAuthSignedOut?.();
    }
  });
};

export const signInWithGoogleDrive = async (): Promise<{
  user: User;
  accessToken: string;
}> => {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error(
      'Google Drive sign-in requires a Firebase apiKey in firebase-applet-config.json (or VITE_FIREBASE_API_KEY).'
    );
  }

  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, buildGoogleProvider());
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Google Drive access token was not returned.');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
};

export const getDriveAccessToken = (): string | null => {
  return cachedAccessToken;
};

export const signOutGoogleDrive = async (): Promise<void> => {
  cachedAccessToken = null;
  const auth = getFirebaseAuth();
  if (auth) {
    await auth.signOut();
  }
};

export interface DriveFolderSummary {
  id: string;
  name: string;
  modifiedTime?: string;
}

export interface DriveFileMetadata {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  md5Checksum?: string;
}

export async function fetchUserDriveFolders(
  accessToken: string
): Promise<DriveFolderSummary[]> {
  const res = await fetch('/api/drive/folders', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to list Google Drive folders.');
  }
  return data.folders || [];
}

export async function fetchDriveFolderFiles(
  accessToken: string,
  folderId: string,
  pageToken?: string
): Promise<{ files: DriveFileMetadata[]; nextPageToken?: string }> {
  const params = new URLSearchParams({ folderId });
  if (pageToken) params.set('pageToken', pageToken);
  const res = await fetch(`/api/drive/files?${params.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to list files in selected Google Drive folder.');
  }
  return data;
}
