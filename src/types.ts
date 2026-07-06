export interface Partner {
  id: 'A' | 'B';
  uid: string;
  name: string;
  avatar: string;
  publicKey?: string; // Base64 representation
}

export interface Couple {
  id: string;
  partnerA?: Partner;
  partnerB?: Partner;
  anniversaryDate?: string; // YYYY-MM-DD
  passcodeHashA?: string;
  passcodeHashB?: string;
  hasPasscodeA?: boolean;
  hasPasscodeB?: boolean;
  isLocked?: boolean;
}

export interface EncryptedMessage {
  id: string;
  senderId: 'A' | 'B';
  ciphertext: string; // AES-GCM Encrypted Base64
  iv: string; // Initialization Vector (hex/base64)
  timestamp: number;
  type: 'text' | 'image_ref' | 'voice' | 'video_ref';
  isViewOnce?: boolean;
  duration?: number; // for voice messages (seconds)
}

export interface EncryptedPhoto {
  id: string;
  senderId: 'A' | 'B';
  ciphertext: string; // Large base64 ciphertext
  iv: string;
  captionCiphertext?: string;
  captionIv?: string;
  timestamp: number;
  isViewOnce: boolean;
  viewedAt?: number;
}

export interface Reminder {
  id: string;
  title: string;
  category: 'date' | 'gift' | 'daily' | 'special';
  dueDate: string; // YYYY-MM-DD
  completed: boolean;
  createdBy: 'A' | 'B';
  timestamp: number;
}

export interface SpecialAnniversary {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  notes?: string;
  photo?: string; // base64 string
  createdBy: 'A' | 'B';
  timestamp: number;
}

export interface CoupleAppState {
  coupleId: string;
  partnerA: Partner;
  partnerB: Partner;
  anniversaryDate: string;
  messages: EncryptedMessage[];
  photos: EncryptedPhoto[];
  reminders: Reminder[];
  specialAnniversaries?: SpecialAnniversary[];
  isE2EActive: boolean;
}
