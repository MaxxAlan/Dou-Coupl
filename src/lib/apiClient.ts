// Client API client for communicating with the local Node/Express backend.
// Implements unified error handling and authentication header injection.

const BASE_URL = 'https://dou-coupl.onrender.com'; // Relative path because of Vite server proxying/production serving

async function request(path: string, options: RequestInit = {}): Promise<any> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers
  });

  if (!res.ok) {
    let errMsg = `Request failed: ${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      if (data && data.error) {
        errMsg = data.error;
      }
    } catch (e) {
      // ignore
    }
    throw new Error(errMsg);
  }

  return res.json();
}

export const apiClient = {
  // 1. Fetch complete app state
  getDatabaseState: async (pairingCode: string) => {
    return request('/api/state', {
      method: 'GET',
      headers: { 'X-Pairing-Code': pairingCode }
    });
  },

  // 2. Post a secure message
  postMessage: async (pairingCode: string, senderId: 'A' | 'B', ciphertext: string, iv: string, type: 'text' | 'image_ref' = 'text') => {
    return request('/api/messages', {
      method: 'POST',
      headers: { 'X-Pairing-Code': pairingCode },
      body: JSON.stringify({ senderId, ciphertext, iv, type })
    });
  },

  // 3. Post a secure photo to Album
  uploadPhoto: async (pairingCode: string, senderId: 'A' | 'B', ciphertext: string, iv: string, captionCiphertext?: string, captionIv?: string, isViewOnce: boolean = false) => {
    return request('/api/photos', {
      method: 'POST',
      headers: { 'X-Pairing-Code': pairingCode },
      body: JSON.stringify({ senderId, ciphertext, iv, captionCiphertext, captionIv, isViewOnce })
    });
  },

  // 4. Delete photo
  deletePhoto: async (pairingCode: string, id: string) => {
    return request(`/api/photos/${id}`, {
      method: 'DELETE',
      headers: { 'X-Pairing-Code': pairingCode }
    });
  },

  // 5. Add a reminder checklist item
  addReminder: async (pairingCode: string, title: string, category: 'date' | 'gift' | 'daily' | 'special', dueDate: string, createdBy: 'A' | 'B') => {
    return request('/api/reminders', {
      method: 'POST',
      headers: { 'X-Pairing-Code': pairingCode },
      body: JSON.stringify({ title, category, dueDate, createdBy })
    });
  },

  // 6. Toggle/complete reminder
  toggleReminder: async (pairingCode: string, id: string) => {
    return request(`/api/reminders/${id}/toggle`, {
      method: 'POST',
      headers: { 'X-Pairing-Code': pairingCode }
    });
  },

  // 7. Delete a reminder
  deleteReminder: async (pairingCode: string, id: string) => {
    return request(`/api/reminders/${id}`, {
      method: 'DELETE',
      headers: { 'X-Pairing-Code': pairingCode }
    });
  },

  // 8. Update Anniversary Date setting
  updateAnniversary: async (pairingCode: string, anniversaryDate: string) => {
    return request('/api/anniversary', {
      method: 'POST',
      headers: { 'X-Pairing-Code': pairingCode },
      body: JSON.stringify({ anniversaryDate })
    });
  },

  // 9. Set PIN passcode lock hash
  setPasscode: async (pairingCode: string, passcode: string) => {
    return request('/api/passcode', {
      method: 'POST',
      headers: { 'X-Pairing-Code': pairingCode },
      body: JSON.stringify({ passcode })
    });
  },

  // 10. Verify PIN passcode endpoint
  verifyPasscode: async (passcode: string) => {
    return request('/api/passcode/verify', {
      method: 'POST',
      body: JSON.stringify({ passcode })
    });
  },

  // 11. Add or update special anniversary
  addSpecialAnniversary: async (
    pairingCode: string,
    title: string,
    date: string,
    notes?: string,
    photo?: string,
    createdBy?: 'A' | 'B',
    id?: string
  ) => {
    return request('/api/special-anniversaries', {
      method: 'POST',
      headers: { 'X-Pairing-Code': pairingCode },
      body: JSON.stringify({ id, title, date, notes, photo, createdBy })
    });
  },

  // 12. Delete special anniversary
  deleteSpecialAnniversary: async (pairingCode: string, id: string) => {
    return request(`/api/special-anniversaries/${id}`, {
      method: 'DELETE',
      headers: { 'X-Pairing-Code': pairingCode }
    });
  },

  // 13. Reset database
  resetDatabase: async (pairingCode: string, clean: boolean) => {
    return request('/api/reset', {
      method: 'POST',
      headers: { 'X-Pairing-Code': pairingCode },
      body: JSON.stringify({ clean })
    });
  },

  // 14. Update partner profile
  updateProfile: async (pairingCode: string, partnerId: 'A' | 'B', name: string, avatar: string) => {
    return request('/api/profile', {
      method: 'POST',
      headers: { 'X-Pairing-Code': pairingCode },
      body: JSON.stringify({ partnerId, name, avatar })
    });
  },

  // 15. Update partner storage method
  updateStorageMethod: async (pairingCode: string, partnerId: 'A' | 'B', storageMethod: 'p2p' | 'googledrive') => {
    return request('/api/storage-method', {
      method: 'POST',
      headers: { 'X-Pairing-Code': pairingCode },
      body: JSON.stringify({ partnerId, storageMethod })
    });
  },

  // 16. Update global pairing code
  updatePairingCode: async (oldPairingCode: string, newPairingCode: string) => {
    return request('/api/pair-code', {
      method: 'POST',
      headers: { 'X-Pairing-Code': oldPairingCode },
      body: JSON.stringify({ pairingCode: newPairingCode })
    });
  },

  // 17. Generic post method
  post: async (path: string, body: any, headers: Record<string, string> = {}) => {
    return request(path, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
  },

  // 18. Generic get method
  get: async (path: string, headers: Record<string, string> = {}) => {
    return request(path, {
      method: 'GET',
      headers
    });
  }
};
