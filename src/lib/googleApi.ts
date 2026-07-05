import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './firebase';


// Configure Google Auth Provider
export const googleProvider = new GoogleAuthProvider();

// Add requested Workspace & Photos scopes
const scopes = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/photoslibrary.readonly',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email'
];

scopes.forEach(scope => googleProvider.addScope(scope));

// Keep track of auth state and token
let isSigningIn = false;
let cachedAccessTokens: Record<'A' | 'B', string | null> = {
  A: null,
  B: null
};

// Listen for Auth changes and cache tokens in localStorage or sessionStorage per partner
// Note: As per guideline, cached token is kept in-memory or loaded per partner session.
export const initAuth = (
  partnerId: 'A' | 'B',
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      // Try to load cached token from sessionStorage for this partner
      const key = `google_access_token_${partnerId}`;
      const token = sessionStorage.getItem(key) || cachedAccessTokens[partnerId];
      if (token) {
        cachedAccessTokens[partnerId] = token;
        if (onAuthSuccess) onAuthSuccess(user, token);
      } else if (!isSigningIn) {
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessTokens[partnerId] = null;
      sessionStorage.removeItem(`google_access_token_${partnerId}`);
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (partnerId: 'A' | 'B'): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Không thể lấy Access Token từ Google Auth');
    }

    const token = credential.accessToken;
    cachedAccessTokens[partnerId] = token;
    sessionStorage.setItem(`google_access_token_${partnerId}`, token);
    return { user: result.user, accessToken: token };
  } catch (error: any) {
    console.error('Google Sign-in failed:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = (partnerId: 'A' | 'B'): string | null => {
  return sessionStorage.getItem(`google_access_token_${partnerId}`) || cachedAccessTokens[partnerId];
};

export const logoutGoogle = async (partnerId: 'A' | 'B') => {
  await auth.signOut();
  cachedAccessTokens[partnerId] = null;
  sessionStorage.removeItem(`google_access_token_${partnerId}`);
};

// ==========================================
// Google Drive API Integrations
// ==========================================

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink?: string;
  webViewLink?: string;
  webContentLink?: string;
  size?: string;
}

/**
 * List files from Google Drive with filters
 */
export const listGoogleDriveFiles = async (
  partnerId: 'A' | 'B',
  type: 'images' | 'documents' = 'images'
): Promise<GoogleDriveFile[]> => {
  const token = getAccessToken(partnerId);
  if (!token) throw new Error('Yêu cầu kết nối Google để truy cập Drive.');

  let q = "trashed = false";
  if (type === 'images') {
    q += " and mimeType contains 'image/'";
  } else {
    q += " and (mimeType = 'application/pdf' or mimeType = 'application/vnd.google-apps.document' or mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' or mimeType = 'text/plain')";
  }

  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,thumbnailLink,webViewLink,webContentLink,size)&pageSize=30`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    console.error('Google Drive listing failed:', errData);
    throw new Error(errData?.error?.message || 'Không thể lấy tệp từ Google Drive.');
  }

  const data = await response.json();
  return data.files || [];
};

/**
 * Upload a Base64 image to Google Drive as an E2EE encrypted blob or raw image
 */
export const uploadFileToGoogleDrive = async (
  partnerId: 'A' | 'B',
  fileName: string,
  mimeType: string,
  base64Data: string
): Promise<GoogleDriveFile> => {
  const token = getAccessToken(partnerId);
  if (!token) throw new Error('Yêu cầu kết nối Google để tải lên.');

  // Convert Base64 data to blob
  const responseBlob = await fetch(base64Data);
  const blob = await responseBlob.blob();

  const metadata = {
    name: fileName,
    mimeType: mimeType,
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', blob);

  const url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: form
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData?.error?.message || 'Tải lên Google Drive thất bại.');
  }

  return response.json();
};

/**
 * Fetch a Google Drive file's content (as base64/blob)
 */
export const downloadGoogleDriveFile = async (
  partnerId: 'A' | 'B',
  fileId: string
): Promise<string> => {
  const token = getAccessToken(partnerId);
  if (!token) throw new Error('Yêu cầu kết nối Google.');

  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error('Không thể tải xuống tệp từ Google Drive.');
  }

  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};


// ==========================================
// Google Photos API Integrations
// ==========================================

export interface GooglePhotoItem {
  id: string;
  baseUrl: string;
  filename: string;
  mimeType: string;
  productUrl: string;
}

/**
 * List media items from Google Photos
 */
export const listGooglePhotos = async (partnerId: 'A' | 'B'): Promise<GooglePhotoItem[]> => {
  const token = getAccessToken(partnerId);
  if (!token) throw new Error('Yêu cầu kết nối Google để tải Photos.');

  const url = 'https://photoslibrary.googleapis.com/v1/mediaItems?pageSize=30';
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    console.warn('Google Photos API returned error (Might be restricted/not enabled):', errData);
    
    // We must handle restricted/not enabled Photos API gracefully.
    // If the API fails with permission or 403, we throw a specific error so the UI can fallback
    // to explaining the status, but also we can fetch images from Google Drive's Pictures folder as fallback!
    throw new Error(errData?.error?.message || 'Google Photos API returned an error.');
  }

  const data = await response.json();
  return data.mediaItems || [];
};
