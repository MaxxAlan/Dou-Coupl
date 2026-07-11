import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, User, getAuth } from 'firebase/auth';
import { initializeApp, getApps } from 'firebase/app';
import { auth, firebaseConfig } from './firebase';

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

// Initialize secondary Firebase Auth instance for isolated Google Drive authentication
let tempGoogleApp: any = null;
let tempGoogleAuth: any = null;

const getTempGoogleAuth = () => {
  if (tempGoogleAuth) return tempGoogleAuth;

  const apps = getApps();
  const existingTempApp = apps.find(app => app.name === 'tempGoogleDriveApp');
  if (existingTempApp) {
    tempGoogleApp = existingTempApp;
  } else {
    tempGoogleApp = initializeApp(firebaseConfig, 'tempGoogleDriveApp');
  }
  tempGoogleAuth = getAuth(tempGoogleApp);
  return tempGoogleAuth;
};

// Keep track of auth state and token
let isSigningIn = false;
let cachedAccessTokens: Record<'A' | 'B', string | null> = {
  A: null,
  B: null
};

// Listen for Auth changes and cache tokens in localStorage per partner
export const initAuth = (
  partnerId: 'A' | 'B',
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  const tempAuth = getTempGoogleAuth();
  return onAuthStateChanged(tempAuth, async (googleUser: User | null) => {
    const key = `google_access_token_${partnerId}`;
    const token = localStorage.getItem(key) || cachedAccessTokens[partnerId];
    if (googleUser && token) {
      cachedAccessTokens[partnerId] = token;
      if (onAuthSuccess) onAuthSuccess(googleUser, token);
    } else {
      if (!isSigningIn) {
        cachedAccessTokens[partnerId] = null;
        localStorage.removeItem(`google_access_token_${partnerId}`);
        if (onAuthFailure) onAuthFailure();
      }
    }
  });
};

export const googleSignIn = async (partnerId: 'A' | 'B'): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const tempAuth = getTempGoogleAuth();
    const result = await signInWithPopup(tempAuth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Không thể lấy Access Token từ Google Auth');
    }

    const token = credential.accessToken;
    cachedAccessTokens[partnerId] = token;
    localStorage.setItem(`google_access_token_${partnerId}`, token);
    return { user: result.user, accessToken: token };
  } catch (error: any) {
    console.error('Google Sign-in failed:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = (partnerId: 'A' | 'B'): string | null => {
  return localStorage.getItem(`google_access_token_${partnerId}`) || cachedAccessTokens[partnerId];
};

export const logoutGoogle = async (partnerId: 'A' | 'B') => {
  const tempAuth = getTempGoogleAuth();
  await tempAuth.signOut();
  cachedAccessTokens[partnerId] = null;
  localStorage.removeItem(`google_access_token_${partnerId}`);
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
    const errMsg = errData?.error?.message || '';
    const status = response.status;
    console.warn('Google Photos API returned error:', { status, errMsg });
    
    let userMessage: string;
    if (status === 403 && errMsg.includes('not been enabled')) {
      userMessage = 'Google Photos API chưa được kích hoạt. Vào https://console.cloud.google.com/apis/library/photoslibrary.googleapis.com để bật API, hoặc dùng ảnh mẫu bên dưới.';
    } else if (status === 401 || status === 403) {
      userMessage = 'Tài khoản chưa được cấp quyền truy cập Google Photos. Vào https://console.cloud.google.com/apis/credentials → OAuth consent screen → thêm email test, hoặc dùng ảnh mẫu.';
    } else {
      userMessage = errMsg || 'Không thể kết nối Google Photos. Dùng ảnh mẫu bên dưới.';
    }
    throw new Error(userMessage);
  }

  const data = await response.json();
  return data.mediaItems || [];
};
