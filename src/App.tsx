import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Heart, 
  MessageCircle, 
  ImageIcon, 
  CheckSquare, 
  Shield, 
  Lock, 
  LogOut, 
  BellRing, 
  Sparkles, 
  ArrowRight, 
  Mail, 
  User, 
  Copy, 
  Check, 
  Users, 
  AlertCircle,
  Loader2
} from 'lucide-react';

import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  signInWithPopup,
  GoogleAuthProvider
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  getDoc, 
  onSnapshot, 
  collection, 
  getDocs,
  query,
  where,
  updateDoc
} from 'firebase/firestore';

import { Partner, EncryptedMessage, EncryptedPhoto, Reminder } from './types';
import { deriveSymmetricKey, encryptData } from './lib/crypto';
import { auth, db } from './lib/firebase';
import { apiClient, BASE_URL } from './lib/apiClient';
import { storageHelper } from './lib/storage';
import { uploadFileToGoogleDrive } from './lib/googleApi';

// Import Custom Components
import PasscodeLock from './components/PasscodeLock';
import ChatTab from './components/ChatTab';
import AlbumTab from './components/AlbumTab';
import AnniversaryTab from './components/AnniversaryTab';
import RemindersTab from './components/RemindersTab';
import SecurityHub from './components/SecurityHub';
import CallOverlay from './components/CallOverlay';

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop'
];

export default function App() {
  // Firebase Auth & User States
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [userProfile, setUserProfile] = useState<any>(null);

  // Authentication View State
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState<boolean>(false);

  // Onboarding (Profile setup) State
  const [nickname, setNickname] = useState<string>('');
  const [selectedAvatar, setSelectedAvatar] = useState<string>(PRESET_AVATARS[0]);
  const [onboardingSubmitting, setOnboardingSubmitting] = useState<boolean>(false);

  // Pairing State
  const [partnerCode, setPartnerCode] = useState<string>('');
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [pairingSubmitting, setPairingSubmitting] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  // Paired Couple Data
  const [coupleId, setCoupleId] = useState<string | null>(null);
  const [coupleData, setCoupleData] = useState<any>(null);
  
  // Real-time collections (shared database)
  const [messages, setMessages] = useState<EncryptedMessage[]>([]);
  const [photos, setPhotos] = useState<EncryptedPhoto[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [specialAnniversaries, setSpecialAnniversaries] = useState<any[]>([]);

  // Cryptographic Keys
  const [symmetricKey, setSymmetricKey] = useState<CryptoKey | null>(null);

  // Unified UX States (Single device mode - COM-1)
  const [activePartner, setActivePartner] = useState<'A' | 'B'>('A');
  const [activeTab, setActiveTab] = useState<'anniversary' | 'chat' | 'album' | 'reminders' | 'security'>('anniversary');
  const [isSettingPasscode, setIsSettingPasscode] = useState<boolean>(false);
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);

  // WebRTC Calling States (Component 2)
  const [isCallActive, setIsCallActive] = useState<boolean>(false);
  const [isCallIncoming, setIsCallIncoming] = useState<boolean>(false);
  const [callType, setCallType] = useState<'voice' | 'video'>('voice');
  const [incomingCallSignal, setIncomingCallSignal] = useState<any>(null);

  // Reactive UI Notification Banner
  const [notification, setNotification] = useState<{ title: string; body: string; type: string } | null>(null);

  const triggerNotification = (title: string, body: string, type = 'general') => {
    setNotification({ title, body, type });
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  // --- REST DATABASE SYNC ---

  const loadDatabase = async () => {
    if (!coupleData?.pairingCode) return;
    try {
      const state = await apiClient.getDatabaseState(coupleData.pairingCode);
      setMessages(state.messages || []);
      setPhotos(state.photos || []);
      setReminders(state.reminders || []);
      setSpecialAnniversaries(state.specialAnniversaries || []);
      
      // Update coupleData with hasPasscode and other properties
      setCoupleData(prev => ({
        ...prev,
        hasPasscode: state.hasPasscode,
        anniversaryDate: state.anniversaryDate || prev.anniversaryDate,
        partnerA: state.partnerA || prev.partnerA,
        partnerB: state.partnerB || prev.partnerB
      }));
    } catch (e) {
      console.error('Failed to load database state:', e);
    }
  };

  // Align server pairing code on first connection (no hardcoded fallback)
  const alignServerPairingCode = async (userCode: string) => {
    try {
      await apiClient.getDatabaseState(userCode);
      console.log('[E2EE] Express server is aligned with user pairing code.');
    } catch (err) {
      console.warn('[E2EE] Server pairing code mismatch or server unreachable. Data features may be limited until server is configured.', err);
    }
  };

  // --- CRITICAL LIFECYCLE HOOKS ---

  // 1. Firebase Authentication initialization
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        
        // Listen to User Profile Document in Firestore
        const userDocRef = doc(db, 'users', user.uid);
        const unsubProfile = onSnapshot(userDocRef, async (profileSnap) => {
          if (profileSnap.exists()) {
            const data = profileSnap.data();
            setUserProfile(data);
            setCoupleId(data.coupleId || null);
            setAuthLoading(false);
          } else {
            // Document missing, seed profile with connection code
            const customCode = generatePairingCode();
            await setDoc(userDocRef, {
              nickname: user.displayName || '',
              avatar: user.photoURL || PRESET_AVATARS[0],
              pairingCode: customCode,
              coupleId: null
            });
            setUserProfile({
              nickname: user.displayName || '',
              avatar: user.photoURL || PRESET_AVATARS[0],
              pairingCode: customCode,
              coupleId: null
            });
            setCoupleId(null);
            setAuthLoading(false);
          }
        });
        return () => unsubProfile();
      } else {
        setCurrentUser(null);
        setCoupleId(null);
        setCoupleData(null);
        setAuthLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // 2. Listen to Firestore Couple document
  useEffect(() => {
    if (!coupleId) {
      setCoupleData(null);
      setMessages([]);
      setPhotos([]);
      setReminders([]);
      setSpecialAnniversaries([]);
      return;
    }

    const coupleDocRef = doc(db, 'couples', coupleId);
    const unsubCouple = onSnapshot(coupleDocRef, async (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setCoupleData(data);

        // Derive user role dynamically
        if (data.partnerA.uid === currentUser?.uid) {
          setActivePartner('A');
        } else if (data.partnerB.uid === currentUser?.uid) {
          setActivePartner('B');
        }

        // Align local server code to pair properly
        if (data.pairingCode) {
          await alignServerPairingCode(data.pairingCode);
          loadDatabase();
        }
      }
    });

    return () => unsubCouple();
  }, [coupleId, currentUser]);

  // 3. Cryptographic Key derivation
  useEffect(() => {
    if (coupleData?.pairingCode) {
      console.log(`[E2EE] Deriving key for connection: ${coupleData.pairingCode}`);
      deriveSymmetricKey(coupleData.pairingCode).then(key => {
        setSymmetricKey(key);
      }).catch(err => {
        console.error('Failed to derive symmetric key:', err);
      });
    } else {
      setSymmetricKey(null);
    }
  }, [coupleData?.pairingCode]);

  // 4. SSE Stream listeners with WebRTC signaling (Component 2)
  useEffect(() => {
    if (!coupleData?.pairingCode) return;

    let eventSource: EventSource | null = null;

    const connectSSE = () => {
      eventSource = new EventSource(`${BASE_URL}/api/events?pairingCode=${coupleData.pairingCode}`);

      eventSource.onopen = () => {
        console.log('[SSE] Connection established. Performing sync check...');
        loadDatabase();
      };

      eventSource.onmessage = (event) => {
        try {
          const { type, data } = JSON.parse(event.data);
          switch (type) {
            case 'NEW_MESSAGE':
              setMessages(prev => {
                if (prev.some(m => m.id === data.id)) return prev;
                return [...prev, data];
              });
              break;
            case 'NEW_PHOTO':
              setPhotos(prev => {
                if (prev.some(p => p.id === data.id)) return prev;
                return [data, ...prev];
              });
              break;
            case 'DELETE_PHOTO':
              setPhotos(prev => prev.filter(p => p.id !== data.id));
              break;
            case 'NEW_REMINDER':
              setReminders(prev => {
                if (prev.some(r => r.id === data.id)) return prev;
                return [...prev, data];
              });
              break;
            case 'TOGGLE_REMINDER':
              setReminders(prev => prev.map(r => r.id === data.id ? data : r));
              break;
            case 'DELETE_REMINDER':
              setReminders(prev => prev.filter(r => r.id !== data.id));
              break;
            case 'UPDATE_ANNIVERSARY':
              setCoupleData(prev => ({ ...prev, anniversaryDate: data.anniversaryDate }));
              break;
            case 'UPDATE_PASSCODE':
              setCoupleData(prev => ({ ...prev, hasPasscode: data.hasPasscode }));
              break;
            case 'UPDATE_SPECIAL_ANNIVERSARIES':
              setSpecialAnniversaries(data);
              break;
            case 'UPDATE_PROFILE':
              setCoupleData(prev => {
                const updated = { ...prev };
                if (data.partnerId === 'A') {
                  updated.partnerA = { ...updated.partnerA, name: data.name, avatar: data.avatar };
                } else {
                  updated.partnerB = { ...updated.partnerB, name: data.name, avatar: data.avatar };
                }
                return updated;
              });
              break;
            case 'UPDATE_STORAGE_METHOD':
              setCoupleData(prev => {
                const updated = { ...prev };
                if (data.partnerId === 'A') {
                  updated.storageMethodA = data.storageMethod;
                } else {
                  updated.storageMethodB = data.storageMethod;
                }
                return updated;
              });
              break;
            case 'RESET_STATE':
              setCoupleData(prev => ({
                ...prev,
                hasPasscode: data.hasPasscode,
                anniversaryDate: data.anniversaryDate,
                partnerA: data.partnerA,
                partnerB: data.partnerB
              }));
              setMessages(data.messages || []);
              setPhotos(data.photos || []);
              setReminders(data.reminders || []);
              setSpecialAnniversaries(data.specialAnniversaries || []);
              break;
            case 'CALL_SIGNAL':
              // Filter signal meant for this device (Component 2)
              if (data.recipientId === activePartner) {
                if (data.signal.type === 'offer') {
                  setIncomingCallSignal(data.signal);
                  setCallType(data.signal.video ? 'video' : 'voice');
                  setIsCallIncoming(true);
                  setIsCallActive(true);
                } else if (data.signal.type === 'hangup') {
                  setIsCallActive(false);
                  setIsCallIncoming(false);
                  setIncomingCallSignal(null);
                } else {
                  const webrtcEvent = new CustomEvent('webrtc-signal', { detail: { signal: data.signal } });
                  window.dispatchEvent(webrtcEvent);
                }
              }
              break;
            default:
              break;
          }
        } catch (e) {
          console.error('Error handling SSE broadcast message:', e);
        }
      };

      eventSource.onerror = (err) => {
        console.warn('[SSE] Event stream error. Closing client and retrying connection...', err);
        eventSource?.close();
        setTimeout(connectSSE, 3000);
      };
    };

    connectSSE();

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [coupleData?.pairingCode, activePartner]);

  // Helper to generate pairing code
  const generatePairingCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'DUO-';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    code += '-';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  // --- INTERACTION HANDLERS ---

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      setAuthError(err.message || 'Lỗi đăng nhập, hãy kiểm tra lại thông tin.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSubmitting(true);
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      setAuthError(err.message || 'Lỗi đăng ký tài khoản.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    setAuthSubmitting(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error(err);
      setAuthError(err.message || 'Lỗi đăng nhập bằng Google.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    if (confirm('Bạn có chắc chắn muốn đăng xuất không?')) {
      try {
        await signOut(auth);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleSaveProfileOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim() || onboardingSubmitting) return;
    setOnboardingSubmitting(true);
    try {
      const userDocRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userDocRef, {
        nickname: nickname.trim(),
        avatar: selectedAvatar
      });
    } catch (err) {
      console.error(err);
    } finally {
      setOnboardingSubmitting(false);
    }
  };

  const handlePairPartner = async (e: React.FormEvent) => {
    e.preventDefault();
    setPairingError(null);
    if (!partnerCode.trim() || pairingSubmitting) return;
    setPairingSubmitting(true);

    const cleanCode = partnerCode.trim().toUpperCase();

    try {
      // Find partner with pairing code
      const q = query(collection(db, 'users'), where('pairingCode', '==', cleanCode));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setPairingError('Không tìm thấy đối tác với mã liên kết này.');
        setPairingSubmitting(false);
        return;
      }

      const partnerDoc = querySnapshot.docs[0].data() as any;
      partnerDoc.id = querySnapshot.docs[0].id;

      if (partnerDoc.id === currentUser.uid) {
        setPairingError('Bạn không thể kết nối với chính mã của mình!');
        setPairingSubmitting(false);
        return;
      }

      if (partnerDoc.coupleId) {
        setPairingError('Đối tác của bạn đã kết nối với một không gian khác.');
        setPairingSubmitting(false);
        return;
      }

      const newCoupleId = `couple-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const newCoupleDoc = {
        partnerA: {
          uid: partnerDoc.id,
          name: partnerDoc.nickname || 'Đối tác A',
          avatar: partnerDoc.avatar
        },
        partnerB: {
          uid: currentUser.uid,
          name: userProfile.nickname,
          avatar: userProfile.avatar
        },
        pairingCode: cleanCode,
        anniversaryDate: new Date().toISOString().split('T')[0],
        passcodeHash: '',
        createdAt: Date.now()
      };

      await setDoc(doc(db, 'couples', newCoupleId), newCoupleDoc);
      await updateDoc(doc(db, 'users', currentUser.uid), { coupleId: newCoupleId });
      await updateDoc(doc(db, 'users', partnerDoc.id), { coupleId: newCoupleId });

      triggerNotification('Ghép đôi thành công', `Đã kết nối vào Không gian E2EE bảo mật tuyệt đối 🔒`);
    } catch (err) {
      console.error(err);
      setPairingError('Có lỗi xảy ra trong quá trình ghép đôi.');
    } finally {
      setPairingSubmitting(false);
    }
  };

  const handleSendMessage = async (ciphertext: string, iv: string) => {
    if (!coupleData?.pairingCode) return;
    try {
      await apiClient.postMessage(coupleData.pairingCode, activePartner, ciphertext, iv);
    } catch (e) {
      console.error('Failed to send message:', e);
    }
  };

  const handleUploadPhoto = async (
    ciphertext: string, 
    iv: string, 
    isViewOnce: boolean,
    captionCiphertext?: string,
    captionIv?: string
  ) => {
    if (!coupleData?.pairingCode) return;
    try {
      await apiClient.uploadPhoto(coupleData.pairingCode, activePartner, ciphertext, iv, captionCiphertext, captionIv, isViewOnce);
    } catch (e) {
      console.error('Failed to post photo:', e);
    }
  };

  const handleDeletePhoto = async (id: string) => {
    if (!coupleData?.pairingCode) return;
    try {
      await apiClient.deletePhoto(coupleData.pairingCode, id);
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddReminder = async (title: string, category: 'date' | 'gift' | 'daily' | 'special', dueDate: string) => {
    if (!coupleData?.pairingCode) return;
    try {
      await apiClient.addReminder(coupleData.pairingCode, title, category, dueDate, activePartner);
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleReminder = async (id: string) => {
    if (!coupleData?.pairingCode) return;
    try {
      await apiClient.toggleReminder(coupleData.pairingCode, id);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteReminder = async (id: string) => {
    if (!coupleData?.pairingCode) return;
    try {
      await apiClient.deleteReminder(coupleData.pairingCode, id);
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateAnniversary = async (date: string) => {
    if (!coupleData?.pairingCode) return;
    try {
      await apiClient.updateAnniversary(coupleData.pairingCode, date);
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddSpecialAnniversary = async (createdBy: 'A' | 'B', title: string, date: string, notes?: string, photo?: string, id?: string) => {
    if (!coupleData?.pairingCode) return;
    try {
      await apiClient.addSpecialAnniversary(coupleData.pairingCode, title, date, notes, photo, createdBy, id);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteSpecialAnniversary = async (id: string) => {
    if (!coupleData?.pairingCode) return;
    try {
      await apiClient.deleteSpecialAnniversary(coupleData.pairingCode, id);
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateProfile = async (partnerId: 'A' | 'B', name: string, avatar: string) => {
    if (!coupleData?.pairingCode) return;
    try {
      await apiClient.updateProfile(coupleData.pairingCode, partnerId, name, avatar);
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateStorageMethod = async (partnerId: 'A' | 'B', storageMethod: 'p2p' | 'googledrive') => {
    if (!coupleData?.pairingCode) return;
    try {
      await apiClient.updateStorageMethod(coupleData.pairingCode, partnerId, storageMethod);
      triggerNotification('Lưu trữ', `Đã chuyển sang ${storageMethod === 'googledrive' ? 'Google Drive' : 'P2P Local'}`);
    } catch (e) {
      console.error('Failed to update storage method:', e);
    }
  };

  const handleSetPasscode = async (passcode: string) => {
    if (!coupleData?.pairingCode) return;
    try {
      await apiClient.setPasscode(coupleData.pairingCode, passcode);
      triggerNotification('Bảo mật PIN', 'Cài đặt mã khóa PIN thành công');
      setIsUnlocked(true);
      setIsSettingPasscode(false);
    } catch (e) {
      console.error(e);
      alert('Không thể cập nhật mã PIN.');
    }
  };

  const handleClearPasscode = async () => {
    if (!coupleData?.pairingCode) return;
    try {
      await apiClient.setPasscode(coupleData.pairingCode, '');
      triggerNotification('Bảo mật PIN', 'Đã gỡ bỏ mã khóa PIN bảo vệ');
      setIsUnlocked(true);
    } catch (e) {
      console.error(e);
    }
  };

  const handleResetDatabase = async (clean: boolean) => {
    if (!coupleData?.pairingCode) return;
    if (confirm(`Bạn có chắc chắn muốn khôi phục cơ sở dữ liệu về trạng thái ${clean ? 'trống' : 'mẫu'}?`)) {
      try {
        await apiClient.resetDatabase(coupleData.pairingCode, clean);
        triggerNotification('Dữ liệu hệ thống', 'Khôi phục trạng thái thành công');
      } catch (err) {
        console.error('Failed to reset database:', err);
      }
    }
  };

  // Secure async verify callback for PasscodeLock
  const handleVerifyPasscode = async (pin: string): Promise<boolean> => {
    try {
      const res = await apiClient.verifyPasscode(pin);
      return !!res.valid;
    } catch (e) {
      console.error('Passcode verification error:', e);
      return false;
    }
  };

  // Unlocked state: use sessionStorage so it resets on tab close (security)
  useEffect(() => {
    if (coupleId) {
      const unlocked = sessionStorage.getItem(`unlocked_${coupleId}`) === 'true';
      setIsUnlocked(unlocked);
    }
  }, [coupleId]);

  // --- RENDER ROUTINE HELPERS ---

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#080808] flex flex-col items-center justify-center font-sans text-slate-400">
        <Loader2 className="w-10 h-10 text-[#c5a059] animate-spin mb-4" />
        <p className="text-xs font-mono uppercase tracking-widest">Đang khởi tạo không gian...</p>
      </div>
    );
  }

  if (!currentUser) {
    // RENDER SIGN IN / SIGN UP SCREEN
    return (
      <div className="min-h-screen bg-[#080808] font-sans flex items-center justify-center p-4 relative overflow-hidden select-none text-slate-200">
        <div className="absolute inset-0 opacity-10 pointer-events-none overflow-hidden">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-[#c5a059] blur-[140px]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-[#201a15] blur-[140px]" />
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-gradient-to-b from-[#111] to-[#0c0c0c] border border-white/5 rounded-3xl p-6.5 md:p-8 shadow-2xl relative z-10 space-y-7"
        >
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-extralight tracking-wider text-[#c5a059] font-serif">DUO</h1>
            <p className="text-xs text-slate-400 max-w-[280px] mx-auto leading-relaxed">
              Không gian lãng mạn lứa đôi bảo mật mã hóa đầu cuối (E2EE) tuyệt đối.
            </p>
          </div>

          <div className="flex bg-black p-1.5 rounded-2xl border border-white/5">
            <button
              onClick={() => { setAuthMode('login'); setAuthError(null); }}
              className={`flex-1 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                authMode === 'login' ? 'bg-[#c5a059] text-black font-semibold' : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              Đăng nhập
            </button>
            <button
              onClick={() => { setAuthMode('register'); setAuthError(null); }}
              className={`flex-1 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                authMode === 'register' ? 'bg-[#c5a059] text-black font-semibold' : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              Đăng ký
            </button>
          </div>

          {authError && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-3.5 flex items-start gap-2.5 text-xs text-red-400">
              <AlertCircle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={authMode === 'login' ? handleSignIn : handleSignUp} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[9px] font-mono tracking-wider text-slate-500 uppercase">ĐỊA CHỈ EMAIL</label>
              <input
                type="email"
                required
                placeholder="ten@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-black border border-white/5 rounded-2xl py-3 px-4 text-xs text-slate-200 focus:outline-none focus:border-[#c5a059]/40 transition-colors placeholder:text-slate-600"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[9px] font-mono tracking-wider text-slate-500 uppercase">MẬT KHẨU BẢO MẬT</label>
              <input
                type="password"
                required
                placeholder="Tối thiểu 6 ký tự"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-black border border-white/5 rounded-2xl py-3 px-4 text-xs text-slate-200 focus:outline-none focus:border-[#c5a059]/40 transition-colors placeholder:text-slate-600"
              />
            </div>

            <button
              type="submit"
              disabled={authSubmitting || !email || !password}
              className="w-full bg-[#c5a059] hover:bg-[#b08b47] disabled:opacity-50 text-black font-semibold text-xs py-3.5 rounded-2xl transition-all shadow-lg active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
            >
              {authSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Vui lòng đợi...</span>
                </>
              ) : (
                <>
                  <span>{authMode === 'login' ? 'Đăng nhập vào không gian' : 'Đăng ký tài khoản mới'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>

          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-white/5"></div>
            <span className="flex-shrink mx-3 text-[10px] text-slate-500 font-mono">HOẶC</span>
            <div className="flex-grow border-t border-white/5"></div>
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={authSubmitting}
            className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold text-xs py-3.5 rounded-2xl transition-all shadow-lg active:scale-95 cursor-pointer flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                fill="#EA4335"
              />
            </svg>
            <span>Đăng nhập bằng Google</span>
          </button>
        </motion.div>
      </div>
    );
  }

  // RENDER ONBOARDING (Set name & avatar)
  if (userProfile && (!userProfile.nickname || !userProfile.avatar)) {
    return (
      <div className="min-h-screen bg-[#080808] font-sans flex items-center justify-center p-4 relative overflow-hidden select-none text-slate-200">
        <div className="absolute inset-0 opacity-10 pointer-events-none overflow-hidden">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-[#c5a059] blur-[140px]" />
        </div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-gradient-to-b from-[#111] to-[#0c0c0c] border border-white/5 rounded-3xl p-6.5 md:p-8 shadow-2xl relative z-10 space-y-6"
        >
          <div className="text-center space-y-1.5">
            <h2 className="text-lg font-bold text-slate-100 font-serif">Hồ sơ của bạn</h2>
            <p className="text-[10px] text-slate-400">
              Hãy đặt biệt hiệu hiển thị và lựa chọn ảnh đại diện cho mình trước khi bắt đầu.
            </p>
          </div>

          <form onSubmit={handleSaveProfileOnboarding} className="space-y-6">
            {/* Avatar Selector */}
            <div className="space-y-2">
              <label className="text-[9px] font-mono tracking-wider text-slate-500 uppercase block text-center">ẢNH ĐẠI DIỆN</label>
              <div className="grid grid-cols-4 gap-3 max-w-xs mx-auto">
                {PRESET_AVATARS.map((avUrl, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setSelectedAvatar(avUrl)}
                    className={`aspect-square rounded-full overflow-hidden border-2 transition-all hover:scale-105 cursor-pointer ${
                      selectedAvatar === avUrl ? 'border-[#c5a059] scale-105 shadow-md shadow-[#c5a059]/10' : 'border-transparent opacity-60'
                    }`}
                  >
                    <img src={avUrl} alt="Avatar Preset" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>

            {/* Nickname input */}
            <div className="space-y-1.5">
              <label className="text-[9px] font-mono tracking-wider text-slate-500 uppercase block">BIỆT DANH / TÊN GỌI</label>
              <input
                type="text"
                required
                maxLength={40}
                placeholder="Nhập tên gọi của bạn"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="w-full bg-black border border-white/5 rounded-2xl py-3 px-4 text-xs text-slate-200 focus:outline-none focus:border-[#c5a059]/40 transition-colors text-center"
              />
            </div>

            <button
              type="submit"
              disabled={onboardingSubmitting || !nickname.trim()}
              className="w-full bg-[#c5a059] hover:bg-[#b08b47] disabled:opacity-50 text-black font-semibold text-xs py-3.5 rounded-2xl transition-all shadow-lg active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
            >
              {onboardingSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Đang lưu...</span>
                </>
              ) : (
                <>
                  <span>Lưu & Tiếp tục</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  // RENDER PAIRING SCREEN (If not paired yet)
  if (!coupleId) {
    return (
      <div className="min-h-screen bg-[#080808] font-sans flex items-center justify-center p-4 relative overflow-hidden select-none text-slate-200">
        <div className="absolute inset-0 opacity-10 pointer-events-none overflow-hidden">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-[#c5a059] blur-[140px]" />
        </div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-gradient-to-b from-[#111] to-[#0c0c0c] border border-white/5 rounded-3xl p-6.5 md:p-8 shadow-2xl relative z-10 space-y-6"
        >
          <div className="text-center space-y-1.5">
            <h2 className="text-lg font-bold text-slate-100 font-serif">Kết nối đôi lứa</h2>
            <p className="text-[10px] text-slate-400">
              Chia sẻ mã số của bạn cho đối tác, hoặc nhập mã số liên kết từ đối tác để ghép đôi không gian.
            </p>
          </div>

          {/* User Code Box */}
          <div className="bg-black/60 border border-white/5 rounded-2xl p-4.5 text-center space-y-2">
            <span className="text-[8.5px] font-mono tracking-wider text-slate-500 uppercase block">MÃ KẾT NỐI CỦA BẠN</span>
            <div className="flex items-center justify-center gap-3">
              <span className="text-sm font-mono font-bold tracking-widest text-slate-200">
                {userProfile?.pairingCode || 'Đang tạo...'}
              </span>
              <button
                onClick={() => {
                  if (userProfile?.pairingCode) {
                    navigator.clipboard.writeText(userProfile.pairingCode);
                    setCopiedCode(true);
                    setTimeout(() => setCopiedCode(false), 2000);
                  }
                }}
                className="p-1.5 rounded-lg bg-white/[0.03] border border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {pairingError && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs text-red-400 flex items-start gap-2">
              <AlertCircle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
              <span>{pairingError}</span>
            </div>
          )}

          <form onSubmit={handlePairPartner} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[9px] font-mono tracking-wider text-slate-500 uppercase block">MÃ SỐ KẾT NỐI CỦA ĐỐI TÁC</label>
              <input
                type="text"
                required
                placeholder="Ví dụ: DUO-XXXX-XXXX"
                value={partnerCode}
                onChange={(e) => setPartnerCode(e.target.value)}
                className="w-full bg-black/60 border border-white/5 rounded-2xl py-3 px-4 text-center text-xs text-[#c5a059] font-mono tracking-widest placeholder:text-slate-700 placeholder:font-sans placeholder:tracking-normal focus:outline-none focus:border-[#c5a059]/50 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={pairingSubmitting || !partnerCode.trim()}
              className="w-full bg-[#c5a059] hover:bg-[#b08b47] disabled:opacity-50 text-black font-semibold text-xs py-3.5 rounded-2xl transition-all shadow-lg active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
            >
              {pairingSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Đang kết nối...</span>
                </>
              ) : (
                <>
                  <span>Ghép đôi ngay</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  // RENDER APP SCREEN (For authenticated and paired user)
  const renderPhoneScreen = () => {
    if (!coupleData) {
      return (
        <div className="h-full flex flex-col items-center justify-center bg-[#080808] text-slate-400 p-6 text-center">
          <Loader2 className="w-8 h-8 text-[#c5a059] animate-spin mb-3" />
          <p className="text-xs font-mono uppercase tracking-widest text-slate-500">Đang tải không gian lứa đôi...</p>
        </div>
      );
    }

    // 1. PIN Lock Guard
    if (coupleData?.hasPasscode && !isUnlocked && !isSettingPasscode) {
      return (
        <PasscodeLock
          correctPasscode="" // verification handled via async callback
          onVerifyPasscode={handleVerifyPasscode}
          onUnlock={() => {
            setIsUnlocked(true);
            sessionStorage.setItem(`unlocked_${coupleId}`, 'true');
          }}
        />
      );
    }

    // 2. Passcode Setup wizard
    if (isSettingPasscode) {
      return (
        <PasscodeLock
          correctPasscode=""
          isSettingMode={true}
          onUnlock={() => setIsSettingPasscode(false)}
          onSetPasscodeComplete={handleSetPasscode}
          onCancelSetting={() => setIsSettingPasscode(false)}
        />
      );
    }

    // 3. Normal Active dashboard
    return (
      <div className="h-full flex flex-col overflow-hidden relative select-none">
        {/* Custom App Header */}
        <div className="bg-[#0e0e0e]/90 backdrop-blur-md border-b border-white/5 px-5 py-4 shrink-0 flex items-center justify-between select-none">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[#c5a059] animate-pulse" />
            <h2 className="text-[10px] uppercase tracking-[0.2em] text-[#c5a059] font-sans font-semibold">
              {activeTab === 'anniversary' && 'DUO · Kỷ niệm'}
              {activeTab === 'chat' && 'DUO · Trò chuyện'}
              {activeTab === 'album' && 'DUO · Locket'}
              {activeTab === 'reminders' && 'DUO · Kế hoạch'}
              {activeTab === 'security' && 'DUO · Bảo mật'}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {coupleData?.hasPasscode && (
              <button
                onClick={() => {
                  sessionStorage.removeItem(`unlocked_${coupleId}`);
                  setIsUnlocked(false);
                }}
                className="p-1.5 rounded-xl bg-white/[0.03] border border-white/10 text-white/40 hover:text-[#c5a059] transition-colors cursor-pointer"
                title="Khóa thiết bị"
              >
                <Lock className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={handleSignOut}
              className="p-1.5 rounded-xl bg-white/[0.03] border border-white/10 text-white/40 hover:text-red-400 transition-colors cursor-pointer"
              title="Đăng xuất tài khoản"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Tab view screen */}
        <div className="flex-grow overflow-hidden relative">
          {activeTab === 'anniversary' && (
            <AnniversaryTab
              anniversaryDate={coupleData?.anniversaryDate || '2025-10-15'}
              partnerA={coupleData?.partnerA}
              partnerB={coupleData?.partnerB}
              specialAnniversaries={specialAnniversaries}
              activePartner={activePartner}
              onUpdateAnniversary={handleUpdateAnniversary}
              onAddSpecialAnniversary={handleAddSpecialAnniversary}
              onDeleteSpecialAnniversary={handleDeleteSpecialAnniversary}
              photos={photos}
              symmetricKey={symmetricKey}
              onUploadPhoto={handleUploadPhoto}
              storageMethodA={coupleData?.storageMethodA}
              storageMethodB={coupleData?.storageMethodB}
            />
          )}
          {activeTab === 'chat' && (
            <ChatTab
              messages={messages}
              activePartner={activePartner}
              partnerA={coupleData?.partnerA}
              partnerB={coupleData?.partnerB}
              symmetricKey={symmetricKey}
              pairingCode={coupleData?.pairingCode || ''}
              onSendMessage={handleSendMessage}
              onStartCall={(type) => {
                setCallType(type);
                setIsCallIncoming(false);
                setIncomingCallSignal(null);
                setIsCallActive(true);
              }}
            />
          )}
          {activeTab === 'album' && (
            <AlbumTab
              photos={photos}
              activePartner={activePartner}
              partnerA={coupleData?.partnerA}
              partnerB={coupleData?.partnerB}
              symmetricKey={symmetricKey}
              onUploadPhoto={handleUploadPhoto}
              onDeletePhoto={handleDeletePhoto}
              storageMethodA={coupleData?.storageMethodA}
              storageMethodB={coupleData?.storageMethodB}
            />
          )}
          {activeTab === 'reminders' && (
            <RemindersTab
              reminders={reminders}
              activePartner={activePartner}
              onAddReminder={handleAddReminder}
              onToggleReminder={handleToggleReminder}
              onDeleteReminder={handleDeleteReminder}
            />
          )}
          {activeTab === 'security' && (
            <SecurityHub
              pairingCode={coupleData?.pairingCode || ''}
              symmetricKey={symmetricKey}
              hasPasscode={!!coupleData?.hasPasscode}
              partnerA={coupleData?.partnerA}
              partnerB={coupleData?.partnerB}
              activePartner={activePartner}
              onUpdateProfile={handleUpdateProfile}
              onClearPasscode={handleClearPasscode}
              onTriggerSetPasscode={() => setIsSettingPasscode(true)}
              onResetDatabase={handleResetDatabase}
              onUpdateStorageMethod={handleUpdateStorageMethod}
              storageMethodA={coupleData?.storageMethodA}
              storageMethodB={coupleData?.storageMethodB}
            />
          )}
        </div>

        {/* Navigation bottom bar */}
        <div className="h-16 bg-[#0e0e0e]/95 border-t border-white/5 px-4 flex justify-around items-center shrink-0 select-none pb-2">
          {[
            { id: 'anniversary', icon: <Heart className="w-5 h-5" />, label: 'Ngày yêu' },
            { id: 'chat', icon: <MessageCircle className="w-5 h-5" />, label: 'Chat' },
            { id: 'album', icon: <ImageIcon className="w-5 h-5" />, label: 'Locket' },
            { id: 'reminders', icon: <CheckSquare className="w-5 h-5" />, label: 'Kế hoạch' },
            { id: 'security', icon: <Shield className="w-5 h-5" />, label: 'Bảo mật' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex flex-col items-center gap-1.5 py-1 px-3 transition-all relative cursor-pointer ${
                activeTab === tab.id ? 'text-[#c5a059]' : 'text-white/30 hover:text-white/60'
              }`}
            >
              {tab.icon}
              <span className="text-[8px] font-sans tracking-wide font-medium">{tab.label}</span>
              {activeTab === tab.id && (
                <motion.div
                  layoutId="activeNavigationDot"
                  className="absolute bottom-[-6px] w-1.5 h-1.5 bg-[#c5a059] rounded-full"
                />
              )}
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#080808] font-sans flex flex-col text-slate-100 overflow-hidden relative select-none">
      
      {/* Background decorations */}
      <div className="absolute inset-0 opacity-15 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-[#c5a059] blur-[140px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-[#201a15] blur-[140px]" />
      </div>

      {/* Reactive notification banner */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ y: -100, opacity: 0, x: '-50%' }}
            animate={{ y: 0, opacity: 1, x: '-50%' }}
            exit={{ y: -100, opacity: 0, x: '-50%' }}
            className="absolute top-20 left-1/2 z-50 bg-[#0c0c0c]/95 border border-[#c5a059]/30 text-[#c5a059] py-3 px-5 rounded-2xl shadow-2xl flex items-center gap-3 font-sans w-[90%] max-w-sm pointer-events-none backdrop-blur-md"
          >
            <div className="w-7 h-7 rounded-full bg-[#c5a059]/10 flex items-center justify-center text-[#c5a059] shrink-0">
              <BellRing className="w-4 h-4 animate-bounce" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-[10px] uppercase tracking-wider font-bold text-slate-300">{notification.title}</h4>
              <p className="text-[10.5px] text-slate-400 mt-0.5 truncate">{notification.body}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Single Device Container (COM-1) */}
      <div className="flex-grow flex items-center justify-center z-10 w-full overflow-hidden h-full">
        <div className="w-full max-w-md h-screen md:h-[92vh] md:max-h-[850px] bg-black border-x border-white/5 md:rounded-[36px] shadow-2xl flex flex-col overflow-hidden relative">
          {renderPhoneScreen()}
        </div>
      </div>

      {/* P2P E2EE Calling Overlay (Component 2) */}
      {isCallActive && (
        <CallOverlay
          pairingCode={coupleData?.pairingCode || ''}
          activePartner={activePartner}
          recipientId={activePartner === 'A' ? 'B' : 'A'}
          recipientName={activePartner === 'A' ? coupleData?.partnerB?.name : coupleData?.partnerA?.name}
          recipientAvatar={activePartner === 'A' ? coupleData?.partnerB?.avatar : coupleData?.partnerA?.avatar}
          callType={callType}
          incomingSignal={incomingCallSignal}
          isIncoming={isCallIncoming}
          onClose={() => {
            setIsCallActive(false);
            setIsCallIncoming(false);
            setIncomingCallSignal(null);
          }}
          onSaveToAlbum={async (base64Data, mediaType) => {
            if (!symmetricKey) return;
            const encrypted = await encryptData(base64Data, symmetricKey);
            const captionText = `Bản ghi cuộc gọi ${mediaType === 'video' ? 'Video' : 'Thoại'} - ${new Date().toLocaleString('vi-VN')}`;
            const encCap = await encryptData(captionText, symmetricKey);

            const currentStorageMethod = activePartner === 'A' ? coupleData?.storageMethodA : coupleData?.storageMethodB;

            if (currentStorageMethod === 'googledrive') {
              const googleToken = sessionStorage.getItem(`google_access_token_${activePartner}`);
              if (!googleToken) {
                alert('Phương thức lưu trữ Google Drive đang hoạt động nhưng bạn chưa kết nối Google. Vui lòng kết nối Google ở tab Bảo mật để sao lưu bản ghi.');
                return;
              }

              const timestamp = Date.now();
              const payload = JSON.stringify({
                ciphertext: encrypted.ciphertext,
                iv: encrypted.iv
              });

              const base64Payload = `data:text/plain;base64,${btoa(unescape(encodeURIComponent(payload)))}`;
              try {
                const driveFile = await uploadFileToGoogleDrive(
                  activePartner,
                  `DUO_CALL_RECORD_${timestamp}.enc`,
                  'text/plain',
                  base64Payload
                );
                handleUploadPhoto(
                  `drive://${driveFile.id}`,
                  'drive-iv',
                  false,
                  encCap.ciphertext,
                  encCap.iv
                );
              } catch (err) {
                console.error(err);
                alert('Tải bản ghi lên Google Drive thất bại.');
              }
            } else {
              handleUploadPhoto(
                encrypted.ciphertext,
                encrypted.iv,
                false,
                encCap.ciphertext,
                encCap.iv
              );
            }
          }}
        />
      )}

    </div>
  );
}
