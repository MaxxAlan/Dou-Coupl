import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Loader2,
  Volume2,
  VolumeX
} from 'lucide-react';

import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  signInWithPopup,
  GoogleAuthProvider,
  sendEmailVerification,
  reload,
  sendPasswordResetEmail
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

import { Partner, EncryptedMessage, EncryptedPhoto, Reminder, WaterLog } from './types';
import { deriveSymmetricKey, encryptData } from './lib/crypto';
import { auth, db, firebaseInitError } from './lib/firebase';
import { apiClient, BASE_URL } from './lib/apiClient';
import { storageHelper } from './lib/storage';
import { uploadFileToGoogleDrive } from './lib/googleApi';
import { useP2PChannel } from './hooks/useP2PChannel';
import type { P2PDataMessage, P2PStatus } from './lib/p2pChannel';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import OfflineScreen from './components/OfflineScreen';
import themeMusicSrc from '@/assets/audio/DaNhuTa.mp3';
import { useThemeMusic } from './hooks/useThemeMusic';
import { I18nProvider, useT } from './lib/i18n';
import { localeData } from './locales';

// Import Custom Components
import PasscodeLock from './components/PasscodeLock';
import ChatTab from './components/ChatTab';
import AlbumTab from './components/AlbumTab';
import AnniversaryTab from './components/AnniversaryTab';
import RemindersTab from './components/RemindersTab';
import SecurityHub from './components/SecurityHub';
import CallOverlay from './components/CallOverlay';
import DesktopUI from './components/DesktopUI';

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
  const t = useT();
  // Firebase Auth & User States
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [userProfile, setUserProfile] = useState<any>(null);
  const isSigningUp = useRef(false);

  // Authentication View State
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState<boolean>(false);
  const [showLogin, setShowLogin] = useState<boolean>(false);
  const [failedLoginAttempts, setFailedLoginAttempts] = useState<number>(0);

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
  const [waterLogs, setWaterLogs] = useState<WaterLog[]>([]);

  // Cryptographic Keys
  const [symmetricKey, setSymmetricKey] = useState<CryptoKey | null>(null);

  // Unified UX States (Single device mode - COM-1)
  const [activePartner, setActivePartner] = useState<'A' | 'B'>('A');
  const [activeTab, setActiveTab] = useState<'anniversary' | 'chat' | 'album' | 'reminders' | 'security'>('album');
  const [isSettingPasscode, setIsSettingPasscode] = useState<boolean>(false);
  const [isUnlockedA, setIsUnlockedA] = useState<boolean>(false);
  const [isUnlockedB, setIsUnlockedB] = useState<boolean>(false);

  // WebRTC Calling States (Component 2)
  const [isCallActive, setIsCallActive] = useState<boolean>(false);
  const [isCallIncoming, setIsCallIncoming] = useState<boolean>(false);
  const [callType, setCallType] = useState<'voice' | 'video'>('voice');
  const [incomingCallSignal, setIncomingCallSignal] = useState<any>(null);

  const online = useOnlineStatus();
  const themeMusic = useThemeMusic(themeMusicSrc);
  const { ready } = themeMusic;

  // Auto-play theme music on auth/offline screens, stop in main app
  const isAuthScreen = !currentUser || !userProfile?.nickname || !coupleId;
  useEffect(() => {
    if (ready) {
      if (isAuthScreen || !online) {
        themeMusic.play();
      } else {
        themeMusic.stop();
      }
    }
  }, [isAuthScreen, online, ready]);

  // Per-partner unlock
  const isUnlocked = activePartner === 'A' ? isUnlockedA : isUnlockedB;
  const setIsUnlocked = (v: boolean) => {
    if (activePartner === 'A') setIsUnlockedA(v);
    else setIsUnlockedB(v);
  };

  // Desktop detection
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 1024 && !('ontouchstart' in window));
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // P2P Data Channel State
  const [p2pStatus, setP2pStatus] = useState<P2PStatus>('idle');

  const p2pChannel = useP2PChannel({
    pairingCode: coupleData?.pairingCode || '',
    activePartner,
    recipientId: activePartner === 'A' ? 'B' : 'A',
    onMessage: useCallback((data: P2PDataMessage) => {
      if (data.type === 'text') {
        let payload = data.payload;
        let iv = 'p2p-iv';
        let msgType: 'text' | 'voice' = 'text';
        let duration: number | undefined;
        if (typeof payload === 'string') {
          try {
            const parsed = JSON.parse(payload);
            if (parsed.ciphertext) { payload = parsed.ciphertext; iv = parsed.iv || 'p2p-iv'; }
            if (parsed.type === 'voice') { msgType = 'voice'; duration = parsed.duration; }
          } catch {}
        }
        const newMsg: EncryptedMessage = {
          id: data.messageId,
          senderId: data.senderId,
          ciphertext: payload,
          iv,
          timestamp: data.timestamp,
          type: msgType,
          duration
        };
        setMessages(prev => {
          if (prev.some(m => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
      } else if (data.type === 'image') {
        const newPhoto: EncryptedPhoto = {
          id: data.messageId,
          senderId: data.senderId,
          ciphertext: data.payload,
          iv: 'p2p-iv',
          timestamp: data.timestamp,
          isViewOnce: false
        };
        setPhotos(prev => {
          if (prev.some(p => p.id === newPhoto.id)) return prev;
          return [newPhoto, ...prev];
        });
      }
    }, []),
    onStatusChange: useCallback((status: P2PStatus) => {
      setP2pStatus(status);
    }, [])
  });

  // Synthesizes a sweet couple-themed notification sound chime
  const playNotificationSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const playTone = (freq: number, start: number, duration: number) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.12, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(start);
        osc.stop(start + duration);
      };
      const now = audioCtx.currentTime;
      playTone(784, now, 0.22); // G5
      playTone(1046, now + 0.08, 0.32); // C6
    } catch (e) {
      console.warn('Audio Context blocked or failed:', e);
    }
  };

  // Reactive UI Notification Banner
  const [notification, setNotification] = useState<{ title: string; body: string; type: string } | null>(null);

  const triggerNotification = (title: string, body: string, type = 'general') => {
    setNotification({ title, body, type });
    playNotificationSound();
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  // Auto-start P2P host when storage method is P2P and partner A
  useEffect(() => {
    const method = storageHelper.getItem<string>(`storage_method_${activePartner}`, 'p2p');
    if (coupleData?.pairingCode && method === 'p2p' && p2pStatus === 'idle') {
      p2pChannel.setIsEnabled(true);
      if (activePartner === 'A') {
        p2pChannel.startHost();
      }
    }
  }, [coupleData?.pairingCode, activePartner, p2pStatus]);

  // --- REST DATABASE SYNC ---

  const loadDatabase = async () => {
    if (!coupleData?.pairingCode) return;
    try {
      const state = await apiClient.getDatabaseState(coupleData.pairingCode);
      setMessages(state.messages || []);
      setPhotos(state.photos || []);
      setReminders(state.reminders || []);
      setSpecialAnniversaries(state.specialAnniversaries || []);
      setWaterLogs(state.waterLogs || []);
      
      // Update coupleData with per-partner passcode and other properties
      setCoupleData(prev => ({
        ...prev,
        hasPasscodeA: state.hasPasscodeA,
        hasPasscodeB: state.hasPasscodeB,
        anniversaryDate: state.anniversaryDate || prev.anniversaryDate,
        partnerA: state.partnerA || prev.partnerA,
        partnerB: state.partnerB || prev.partnerB
      }));
    } catch (e: any) {
      console.error('Failed to load database state:', e);
      if (e.message && e.message.includes('Invalid pairing code')) {
        console.warn('[E2EE] Invalid pairing code error on load. Attempting to align pairing code...');
        alignServerPairingCode(coupleData.pairingCode);
      }
    }
  };

  // Align server pairing code on first connection
  const alignServerPairingCode = async (userCode: string) => {
    try {
      await apiClient.getDatabaseState(userCode);
      console.log('[E2EE] Express server is aligned with user pairing code.');
    } catch (err) {
      console.warn('[E2EE] Server pairing code mismatch, attempting to auto-sync...');
      try {
        const defaultCode = 'DUO-2026-LOVE';
        await apiClient.updatePairingCode(defaultCode, userCode);
        console.log('[E2EE] Server pairing code updated successfully.');
        await loadDatabase();
      } catch (syncErr) {
        console.warn('[E2EE] Could not auto-sync server pairing code. Data features may be limited.', syncErr);
      }
    }
  };

  // --- CRITICAL LIFECYCLE HOOKS ---

  // 1. Firebase Authentication initialization
  useEffect(() => {
    if (firebaseInitError || !auth) {
      setAuthLoading(false);
      return;
    }
    let unsubProfile: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      // Clean up previous profile listener if any
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }

      if (user) {
        if (isSigningUp.current) {
          return;
        }

        try {
          await reload(user);
        } catch (reloadErr) {
          console.error('[Auth] Failed to reload user profile:', reloadErr);
        }

        const freshUser = auth.currentUser;
        if (!freshUser) {
          setCurrentUser(null);
          setCoupleId(null);
          setCoupleData(null);
          setAuthLoading(false);
          return;
        }

        if (!freshUser.emailVerified) {
          setCurrentUser(null);
          setCoupleId(null);
          setCoupleData(null);
          setAuthLoading(false);
          await signOut(auth);
          setAuthError('Email của bạn chưa được xác thực. Vui lòng xác thực qua liên kết đã được gửi tới email của bạn.');
          return;
        }

        setCurrentUser(freshUser);
        
        // Listen to User Profile Document in Firestore
        const userDocRef = doc(db, 'users', freshUser.uid);
        unsubProfile = onSnapshot(userDocRef, async (profileSnap) => {
          if (profileSnap.exists()) {
            const data = profileSnap.data();
            setUserProfile(data);
            setCoupleId(data.coupleId || null);
            setAuthLoading(false);
          } else {
            // Document missing, seed profile with connection code (only when verified)
            const customCode = generatePairingCode();
            await setDoc(userDocRef, {
              nickname: freshUser.displayName || '',
              avatar: freshUser.photoURL || PRESET_AVATARS[0],
              pairingCode: customCode,
              coupleId: null
            });
            setUserProfile({
              nickname: freshUser.displayName || '',
              avatar: freshUser.photoURL || PRESET_AVATARS[0],
              pairingCode: customCode,
              coupleId: null
            });
            setCoupleId(null);
            setAuthLoading(false);
          }
        });
      } else {
        setCurrentUser(null);
        setUserProfile(null);
        setCoupleId(null);
        setCoupleData(null);
        setAuthLoading(false);
      }
    });

    return () => {
      unsubscribe();
      if (unsubProfile) {
        unsubProfile();
      }
    };
  }, []);

  // 2. Listen to Firestore Couple document
  useEffect(() => {
    if (firebaseInitError || !db || !coupleId) {
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
                if (data.senderId !== activePartner) {
                  const pName = activePartner === 'A' ? (coupleData?.partnerB?.name || 'Nửa kia') : (coupleData?.partnerA?.name || 'Nửa kia');
                  triggerNotification('Tin nhắn mới 💬', `${pName} vừa nhắn tin cho bạn.`);
                }
                return [...prev, data];
              });
              break;
            case 'NEW_PHOTO':
              setPhotos(prev => {
                if (prev.some(p => p.id === data.id)) return prev;
                if (data.senderId !== activePartner) {
                  const pName = activePartner === 'A' ? (coupleData?.partnerB?.name || 'Nửa kia') : (coupleData?.partnerA?.name || 'Nửa kia');
                  triggerNotification('Locket mới 📸', `${pName} vừa đăng một ảnh khoảnh khắc mới.`);
                }
                return [data, ...prev];
              });
              break;
            case 'DELETE_PHOTO':
              setPhotos(prev => prev.filter(p => p.id !== data.id));
              break;
            case 'NEW_REMINDER':
              setReminders(prev => {
                if (prev.some(r => r.id === data.id)) return prev;
                if (data.createdBy !== activePartner) {
                  const pName = activePartner === 'A' ? (coupleData?.partnerB?.name || 'Nửa kia') : (coupleData?.partnerA?.name || 'Nửa kia');
                  triggerNotification('Kế hoạch mới 📅', `${pName} đã thêm kế hoạch: "${data.title}"`);
                }
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
              setCoupleData(prev => ({ ...prev, hasPasscodeA: data.hasPasscodeA, hasPasscodeB: data.hasPasscodeB }));
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
                hasPasscodeA: data.hasPasscodeA,
                hasPasscodeB: data.hasPasscodeB,
                anniversaryDate: data.anniversaryDate,
                partnerA: data.partnerA,
                partnerB: data.partnerB
              }));
              setMessages(data.messages || []);
              setPhotos(data.photos || []);
              setReminders(data.reminders || []);
              setSpecialAnniversaries(data.specialAnniversaries || []);
              setWaterLogs(data.waterLogs || []);
              break;
            case 'NEW_WATER_LOG':
              setWaterLogs(prev => {
                if (prev.some(w => w.id === data.id)) return prev;
                if (data.partnerId !== activePartner) {
                  const pName = activePartner === 'A' ? (coupleData?.partnerB?.name || 'Nửa kia') : (coupleData?.partnerA?.name || 'Nửa kia');
                  triggerNotification('Uống nước thôi 💧', `${pName} vừa uống thêm ${data.amount}ml nước.`);
                }
                return [...prev, data];
              });
              break;
            case 'DELETE_WATER_LOG':
              setWaterLogs(prev => prev.filter(w => w.id !== data.id));
              break;
            case 'CALL_SIGNAL':
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
                } else if (data.signal.type && data.signal.type.startsWith('p2p_')) {
                  p2pChannel.handleSignal(data.signal);
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
        loadDatabase();
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
      setFailedLoginAttempts(0);
    } catch (err: any) {
      console.error(err);
      const isWrongPassword = 
        err.code === 'auth/wrong-password' || 
        err.code === 'auth/invalid-credential' ||
        err.message?.toLowerCase().includes('password') || 
        err.message?.toLowerCase().includes('credential');

      if (isWrongPassword) {
        const nextAttempts = failedLoginAttempts + 1;
        setFailedLoginAttempts(nextAttempts);

        if (nextAttempts >= 3) {
          setFailedLoginAttempts(0);
          try {
            await sendPasswordResetEmail(auth, email);
            await apiClient.logPasswordReset(email);
            setAuthError('Đã nhập sai mật khẩu 3 lần liên tiếp. Một email khôi phục mật khẩu đã được tự động gửi đến hòm thư đăng ký của bạn.');
          } catch (resetErr: any) {
            console.error(resetErr);
            setAuthError('Đã nhập sai mật khẩu 3 lần. Cố gắng tự động gửi mail khôi phục thất bại: ' + (resetErr.message || ''));
          }
        } else {
          setAuthError(`Mật khẩu không chính xác. Bạn còn ${3 - nextAttempts} lần thử trước khi hệ thống gửi email khôi phục mật khẩu.`);
        }
      } else {
        setAuthError(err.message || 'Lỗi đăng nhập, hãy kiểm tra lại thông tin.');
      }
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSubmitting(true);
    isSigningUp.current = true;
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      await sendEmailVerification(user);
      setAuthError('Đăng ký thành công! Một thư xác thực đã được gửi tới email của bạn. Vui lòng xác thực email rồi đăng nhập.');
      setAuthMode('login');
      await signOut(auth);
    } catch (err: any) {
      setAuthError(err.message || 'Lỗi đăng ký tài khoản.');
    } finally {
      isSigningUp.current = false;
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

  const handleSendMessage = async (ciphertext: string, iv: string, type: 'text' | 'voice' = 'text', duration?: number) => {
    if (!coupleData?.pairingCode) return;
    if (p2pStatus === 'connected') {
      p2pChannel.sendText(JSON.stringify({ ciphertext, iv, type, duration }));
      return;
    }
    try {
      await apiClient.postMessage(coupleData.pairingCode, activePartner, ciphertext, iv, type, duration);
    } catch (e) {
      console.error('Failed to send message:', e);
      triggerNotification('Lỗi gửi tin nhắn', 'Không thể gửi tin nhắn, vui lòng thử lại sau.', 'error');
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
    if (p2pStatus === 'connected') {
      const payload = JSON.stringify({ ciphertext, iv, captionCiphertext, captionIv, isViewOnce });
      p2pChannel.sendImage(payload);
      return;
    }
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

  const handleAddWaterLog = async (partnerId: 'A' | 'B', amount: number) => {
    if (!coupleData?.pairingCode) return;
    try {
      const response = await apiClient.addWaterLog(coupleData.pairingCode, partnerId, amount);
      if (response?.waterLog) {
        setWaterLogs(prev => {
          if (prev.some(w => w.id === response.waterLog.id)) return prev;
          return [...prev, response.waterLog];
        });
      }
    } catch (e) {
      console.error('Failed to add water log:', e);
    }
  };

  const handleDeleteWaterLog = async (id: string) => {
    if (!coupleData?.pairingCode) return;
    try {
      await apiClient.deleteWaterLog(coupleData.pairingCode, id);
    } catch (e) {
      console.error('Failed to delete water log:', e);
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
      await apiClient.setPasscode(coupleData.pairingCode, passcode, activePartner);
      triggerNotification('Bảo mật PIN', 'Cài đặt mã khóa PIN thành công');
      if (activePartner === 'A') setIsUnlockedA(true);
      else setIsUnlockedB(true);
      setIsSettingPasscode(false);
    } catch (e) {
      console.error(e);
      alert('Không thể cập nhật mã PIN.');
    }
  };

  const handleClearPasscode = async () => {
    if (!coupleData?.pairingCode) return;
    try {
      await apiClient.setPasscode(coupleData.pairingCode, '', activePartner);
      triggerNotification('Bảo mật PIN', 'Đã gỡ bỏ mã khóa PIN bảo vệ');
      if (activePartner === 'A') setIsUnlockedA(true);
      else setIsUnlockedB(true);
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
      const emailVal = currentUser?.email || '';
      const res = await apiClient.verifyPasscode(pin, activePartner, emailVal);
      if (res.valid) {
        return true;
      } else {
        if (res.locked) {
          triggerNotification(
            'Khóa ứng dụng',
            res.message || 'Bạn đã nhập sai mã PIN quá 3 lần. Một mã PIN mới đã được gửi tới email của bạn.',
            'error'
          );
        } else if (res.attemptsRemaining !== undefined) {
          triggerNotification(
            'Sai mã PIN',
            res.message || `Mã PIN không đúng. Bạn còn ${res.attemptsRemaining} lần thử.`,
            'error'
          );
        } else {
          triggerNotification('Sai mã PIN', 'Mã PIN nhập vào không chính xác.', 'error');
        }
        return false;
      }
    } catch (e: any) {
      console.error('Passcode verification error:', e);
      const errMsg = e.message || '';
      if (errMsg.includes('gửi tới email')) {
        triggerNotification('Khóa ứng dụng', errMsg, 'error');
      } else {
        triggerNotification('Lỗi kết nối', 'Không thể xác thực mã PIN với máy chủ.', 'error');
      }
      return false;
    }
  };

  // Unlocked state: use sessionStorage so it resets on tab close (security, per-partner)
  useEffect(() => {
    if (coupleId) {
      const unlockedA = sessionStorage.getItem(`unlocked_${coupleId}_A`) === 'true';
      const unlockedB = sessionStorage.getItem(`unlocked_${coupleId}_B`) === 'true';
      setIsUnlockedA(unlockedA);
      setIsUnlockedB(unlockedB);
    }
  }, [coupleId]);

  // Desktop screen (all-in-one desktop layout)
  const renderDesktopScreen = () => {
    if (!coupleData) {
      return (
        <div className="h-full flex flex-col items-center justify-center bg-[#080808] text-slate-400 p-6 text-center">
          <Loader2 className="w-8 h-8 text-[#c5a059] animate-spin mb-3" />
          <p className="text-xs font-mono uppercase tracking-widest text-slate-500">Đang tải không gian lứa đôi...</p>
        </div>
      );
    }

    const activePasscodeNeeded = activePartner === 'A' ? coupleData?.hasPasscodeA : coupleData?.hasPasscodeB;
    if (activePasscodeNeeded && !isUnlocked && !isSettingPasscode) {
      return (
        <PasscodeLock
          correctPasscode=""
          onVerifyPasscode={handleVerifyPasscode}
          onUnlock={() => {
            if (activePartner === 'A') {
              setIsUnlockedA(true);
              sessionStorage.setItem(`unlocked_${coupleId}_A`, 'true');
            } else {
              setIsUnlockedB(true);
              sessionStorage.setItem(`unlocked_${coupleId}_B`, 'true');
            }
          }}
        />
      );
    }

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

    return (
      <DesktopUI
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab as any)}
        activePartner={activePartner}
        partnerA={coupleData?.partnerA}
        partnerB={coupleData?.partnerB}
        hasPasscode={!!activePasscodeNeeded}
        onSignOut={handleSignOut}
        onLock={() => {
          if (activePartner === 'A') {
            sessionStorage.removeItem(`unlocked_${coupleId}_A`);
            setIsUnlockedA(false);
          } else {
            sessionStorage.removeItem(`unlocked_${coupleId}_B`);
            setIsUnlockedB(false);
          }
        }}
        onStartCall={(type) => {
          setCallType(type);
          setIsCallIncoming(false);
          setIncomingCallSignal(null);
          setIsCallActive(true);
        }}
        onSendQuickPhoto={() => {
          setActiveTab('album');
        }}
        musicPlaying={themeMusic.playing}
        onToggleMusic={themeMusic.toggle}
      >
        <div className="h-full overflow-hidden relative">
          {activeTab === 'anniversary' && (
            <AnniversaryTab
              pairingCode={coupleData?.pairingCode || ''}
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
              onUploadPhoto={handleUploadPhoto}
              photos={photos}
              p2pStatus={p2pStatus}
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
              waterLogs={waterLogs}
              onAddWaterLog={handleAddWaterLog}
              onDeleteWaterLog={handleDeleteWaterLog}
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
              hasPasscode={!!(activePartner === 'A' ? coupleData?.hasPasscodeA : coupleData?.hasPasscodeB)}
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
              p2pStatus={p2pStatus}
              onStartP2PHost={() => p2pChannel.startHost()}
              onStopP2P={() => p2pChannel.closeChannel()}
            />
          )}
        </div>
      </DesktopUI>
    );
  };

  // --- RENDER ROUTINE HELPERS ---

  if (firebaseInitError) {
    return (
      <div className="min-h-screen bg-[#080808] font-sans flex items-center justify-center p-4 relative overflow-hidden select-none text-slate-200">
        <div className="absolute inset-0 opacity-10 pointer-events-none overflow-hidden">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-rose-500 blur-[140px]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-[#201a15] blur-[140px]" />
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-gradient-to-b from-[#111] to-[#0c0c0c] border border-rose-500/10 rounded-3xl p-6.5 md:p-8 shadow-2xl relative z-10 space-y-7"
        >
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto text-rose-400 border border-rose-500/20">
              <Heart className="w-8 h-8 animate-pulse text-rose-500" />
            </div>
            <h1 className="text-2xl font-semibold tracking-wider text-rose-400 font-serif">Kết nối Firebase thất bại</h1>
            <p className="text-xs text-slate-400 font-sans leading-relaxed">
              Ứng dụng không thể kết nối tới cơ sở dữ liệu Firebase. Điều này thường do thông tin cấu hình (API Key) bị thiếu hoặc không chính xác.
            </p>
          </div>

          <div className="bg-black/50 p-4 rounded-2xl border border-rose-500/10 text-left font-mono text-[11px] overflow-x-auto text-rose-300/90 leading-normal">
            <div className="font-semibold text-rose-400 mb-1">Chi tiết lỗi:</div>
            {firebaseInitError}
          </div>

          <div className="text-xs text-slate-400 space-y-3 font-sans">
            <p className="font-semibold text-slate-300">Hướng dẫn khắc phục:</p>
            <ul className="list-disc pl-4 space-y-2 leading-relaxed">
              <li>
                <strong>Chạy cục bộ (Local):</strong> Đảm bảo bạn đã tạo file <code className="bg-slate-800 px-1 py-0.5 rounded text-rose-300 font-mono text-[10px]">.env</code> với đầy đủ cấu hình Firebase dựa trên <code className="bg-slate-800 px-1 py-0.5 rounded text-rose-300 font-mono text-[10px]">&quot;.env.example&quot;</code>.
              </li>
              <li>
                <strong>Triển khai (Production):</strong> Cần cấu hình các biến môi trường tương ứng trong mục <strong>Secrets (GitHub Repository Secrets)</strong> trên GitHub trước khi thực hiện build/deploy:
                <div className="grid grid-cols-2 gap-1 mt-2 text-[10px] text-slate-500 font-mono">
                  <div>- VITE_FIREBASE_API_KEY</div>
                  <div>- VITE_FIREBASE_APP_ID</div>
                  <div>- VITE_FIREBASE_PROJECT_ID</div>
                  <div>- VITE_FIREBASE_AUTH_DOMAIN</div>
                </div>
              </li>
            </ul>
          </div>
        </motion.div>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#080808] flex flex-col items-center justify-center font-sans text-slate-400">
        <Loader2 className="w-10 h-10 text-[#c5a059] animate-spin mb-4" />
        <p className="text-xs font-mono uppercase tracking-widest">Đang khởi tạo không gian...</p>
      </div>
    );
  }

  if (!currentUser) {
    if (!showLogin) {
      // PUBLIC LANDING PAGE (Google Compliance: Home page not behind login)
      return (
        <div className="min-h-screen bg-[#080808] font-sans flex flex-col text-slate-200 relative overflow-x-hidden selection:bg-[#c5a059]/30 selection:text-[#ebd4b3]">
          {/* Background decorations */}
          <div className="absolute inset-0 opacity-15 pointer-events-none overflow-hidden">
            <div className="absolute top-[-10%] left-[-15%] w-[60%] h-[60%] rounded-full bg-[#c5a059] blur-[150px]" />
            <div className="absolute bottom-[-10%] right-[-15%] w-[60%] h-[60%] rounded-full bg-[#201a15] blur-[150px]" />
          </div>

          {/* Navigation Header */}
          <header className="w-full max-w-5xl mx-auto px-6 py-6 flex items-center justify-between relative z-10 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-serif text-[#c5a059] tracking-wider font-bold">Dou-Coupl</span>
              <span className="text-[9px] font-mono text-slate-500 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full uppercase tracking-wider">Không gian bảo mật</span>
            </div>
            
            <button
              onClick={() => setShowLogin(true)}
              className="px-4.5 py-2 bg-[#c5a059] hover:bg-[#b08b47] text-xs font-semibold rounded-2xl transition-all active:scale-95 cursor-pointer text-black"
            >
              Bước vào Không gian
            </button>
          </header>

          {/* Hero Section */}
          <main className="flex-1 max-w-4xl mx-auto px-6 py-12 md:py-20 relative z-10 w-full flex flex-col justify-center space-y-16">
            <div className="text-center space-y-6">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#c5a059]/10 border border-[#c5a059]/20 text-[10px] md:text-xs text-[#c5a059] font-mono uppercase tracking-wider animate-pulse"
              >
                <Heart className="w-3.5 h-3.5 fill-current text-[#c5a059]" />
                <span>Nơi tình yêu được bảo vệ bởi mật mã thiết bị</span>
              </motion.div>
              
              <h1 className="text-4xl md:text-6xl font-light tracking-tight text-slate-100 font-serif leading-tight">
                Không gian lưu giữ kỷ niệm <br />
                <span className="text-[#c5a059] font-normal italic">dành riêng cho hai người</span>
              </h1>
              
              <p className="text-xs md:text-sm text-slate-400 max-w-xl mx-auto leading-relaxed font-light">
                Từng lời nhắn gửi ngọt ngào, từng bức hình locket thường nhật, từng cột mốc ngày yêu đều được cất giữ cẩn mật. Chúng tôi không lưu trữ trên máy chủ, không trung gian xem trộm dữ liệu của bạn.
              </p>

              <div className="pt-4 flex flex-col sm:flex-row gap-4 justify-center items-center font-sans">
                <button
                  onClick={() => setShowLogin(true)}
                  className="w-full sm:w-auto px-8 py-4 bg-[#c5a059] hover:bg-[#b08b47] text-black font-semibold text-xs md:text-sm rounded-2xl transition-all shadow-lg hover:shadow-[#c5a059]/10 active:scale-98 cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>Mở không gian của hai bạn</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <a
                  href="https://github.com/MaxxAlan/Dou-Coupl"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto px-6 py-4 bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 text-slate-300 hover:text-white text-xs font-semibold rounded-2xl transition-all active:scale-98 cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>Mã nguồn trên GitHub</span>
                  <ArrowRight className="w-3.5 h-3.5 rotate-[-45deg]" />
                </a>
              </div>
            </div>

            {/* In-depth Philosophy Section */}
            <div className="space-y-6 border-t border-white/5 pt-12 text-left">
              <h2 className="text-xl md:text-2xl font-serif text-[#ebd4b3]">Triết lý đằng sau Dou-Coupl</h2>
              <div className="space-y-4 text-xs md:text-sm text-slate-400 leading-relaxed font-sans font-light">
                <p>
                  Trong thời đại kỹ thuật số, hầu hết mọi ứng dụng trò chuyện và mạng xã hội lớn đều hoạt động dựa trên việc thu thập dữ liệu người dùng. Khi hai bạn nhắn tin cho nhau về một kế hoạch đi du lịch, một món quà định tặng, hay một địa điểm ăn uống sắp tới, các thuật toán trí tuệ nhân tạo sẽ quét qua và bắt đầu phân phối quảng cáo hướng đối tượng. Tình yêu – thứ tình cảm thiêng liêng và riêng tư nhất – vô tình trở thành một món hàng dữ liệu được đem đi khai thác thương mại.
                </p>
                <p>
                  Chúng tôi tin rằng có những khoảnh khắc chỉ nên thuộc về hai người. <strong>Dou-Coupl</strong> ra đời với một triết lý hoàn toàn khác biệt: <strong>Tình yêu cần một khu vườn bí mật thực sự.</strong> Không quảng cáo, không phân tích hành vi, không ai nhìn lén. Đây không chỉ là lời cam kết suông trên giấy, mà là cam kết được xây dựng trực tiếp vào kiến trúc lập trình của ứng dụng: dữ liệu thuộc về bạn, mã hóa nằm trên tay bạn, và máy chủ không lưu giữ bất kỳ vết tích nào của hai người.
                </p>
              </div>
            </div>

            {/* Technical Detail: How Encryption works in human words */}
            <div className="space-y-6 border-t border-white/5 pt-12 text-left">
              <h2 className="text-xl md:text-2xl font-serif text-[#ebd4b3]">Lớp khiên bảo vệ hoạt động như thế nào?</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-sans">
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <span className="text-[#c5a059]">🔒</span>
                    <span>Mã hóa đầu cuối (E2EE)</span>
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed font-light">
                    Hãy tưởng tượng bạn đặt thư tình của mình vào một chiếc hộp thép siêu cứng và khóa lại ngay tại phòng khách của bạn. Chiếc chìa khóa duy nhất để mở ổ khóa đó nằm trên tay người yêu bạn ở đầu bên kia. Khi lá thư đi qua mạng Internet, nó chỉ là một khối kim loại xám xịt không ai có thể nhìn xuyên qua hay đập vỡ. Khi đến máy người ấy, chìa khóa tương ứng sẽ tự động giải mã. Không một ai khác trên đường truyền, kể cả chúng tôi, sở hữu chìa khóa này.
                  </p>
                </div>
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <span className="text-[#c5a059]">☁️</span>
                    <span>Sao lưu Google Drive cá nhân</span>
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed font-light">
                    Đa số ứng dụng lưu trữ dữ liệu của bạn trên kho máy chủ đám mây khổng lồ của họ. Nếu máy chủ đó bị tấn công hoặc rò rỉ, mọi kỷ niệm của bạn sẽ phơi bày trước công chúng. Với Dou-Coupl, dữ liệu nhật ký và ảnh chụp của hai bạn được lưu trực tiếp trên thư mục bảo mật thuộc tài khoản **Google Drive cá nhân** của chính bạn. Bạn hoàn toàn làm chủ dung lượng lưu trữ, có quyền sao chép, tải về hoặc xóa bỏ bất cứ lúc nào mà không phụ thuộc vào bất kỳ bên thứ ba nào.
                  </p>
                </div>
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <span className="text-[#c5a059]">🛠️</span>
                    <span>Nguyên lý Zero-Storage Server</span>
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed font-light">
                    Máy chủ trung tâm của chúng tôi hoạt động với nguyên lý "không biết gì và không lưu giữ gì". Nó đóng vai trò như một bảng chỉ dẫn đường truyền hoặc một người đưa thư mù: nhận thư đã được khóa mã hóa từ thiết bị của bạn, định tuyến gửi sang thiết bị đối phương, và xóa bỏ gói tin khỏi bộ nhớ tạm ngay lập tức sau khi giao thành công. Hệ thống hoàn toàn không lưu giữ bất kỳ cơ sở dữ liệu chat hay lịch sử nhật ký nào trên máy chủ.
                  </p>
                </div>
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <span className="text-[#c5a059]">✨</span>
                    <span>Quyền sở hữu dữ liệu tối cao</span>
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed font-light">
                    Quyền riêng tư tối cao đi kèm với quyền được biến mất. Trong giao diện cài đặt, bạn luôn có tùy chọn hủy liên kết ghép đôi và xóa sạch mọi cơ sở dữ liệu lưu trữ local trên thiết bị chỉ với một chạm duy nhất. Mọi cuộc trò chuyện, nhật ký, nhắc nhở sẽ biến mất vĩnh viễn không để lại bất kỳ dấu vết nào trên thế giới số. Dữ liệu thực sự nằm dưới quyền kiểm soát tuyệt đối của hai bạn.
                  </p>
                </div>
              </div>
            </div>

            {/* Transparency Section */}
            <div className="space-y-6 border-t border-white/5 pt-12 text-left">
              <h2 className="text-xl md:text-2xl font-serif text-[#ebd4b3]">Minh bạch tuyệt đối với Mã nguồn công khai</h2>
              <div className="space-y-4 text-xs md:text-sm text-slate-400 leading-relaxed font-sans font-light">
                <p>
                  Một trong những vấn đề lớn nhất của bảo mật là lòng tin. Làm sao bạn biết một ứng dụng thực sự bảo mật mã hóa hay đang âm thầm gửi dữ liệu của bạn về máy chủ của họ? Câu trả lời duy nhất là **Mã nguồn mở công khai**.
                </p>
                <p>
                  Mã nguồn của Dou-Coupl được lưu trữ công khai trên GitHub để bất cứ ai cũng có thể vào xem, kiểm chứng cách ứng dụng xây dựng và chuyển đi gói tin. Các chuyên gia bảo mật và lập trình viên trên toàn thế giới đều có thể đọc qua từng dòng lệnh để đảm bảo ứng dụng không chứa mã độc, không gửi lén thông tin cá nhân và hoạt động đúng theo các nguyên tắc mã hóa đã công bố. Tính riêng tư cần được xây dựng trên sự minh bạch rõ ràng, không phải trên những lời hứa hẹn quảng cáo mơ hồ.
                </p>
              </div>
            </div>

            {/* Step-by-Step Guide for pairings */}
            <div className="space-y-6 border-t border-white/5 pt-12 text-left">
              <h2 className="text-xl md:text-2xl font-serif text-[#ebd4b3]">Làm sao để hai bạn kết nối với nhau?</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-xs text-slate-400 font-sans">
                <div className="space-y-2 bg-white/[0.01] border border-white/5 p-5 rounded-2xl">
                  <span className="text-lg font-bold text-[#c5a059] font-mono">01</span>
                  <h4 className="font-semibold text-slate-200">Đăng ký tài khoản cá nhân</h4>
                  <p className="leading-relaxed font-light">
                    Mỗi người tạo một tài khoản riêng bằng Email của mình. Ngay khi đăng ký thành công, thiết bị của bạn sẽ tự động tạo ra các bộ khóa mật mã lưu trữ an toàn trong vùng nhớ cục bộ của máy.
                  </p>
                </div>
                <div className="space-y-2 bg-white/[0.01] border border-white/5 p-5 rounded-2xl">
                  <span className="text-lg font-bold text-[#c5a059] font-mono">02</span>
                  <h4 className="font-semibold text-slate-200">Gửi lời mời ghép đôi</h4>
                  <p className="leading-relaxed font-light">
                    Nhập email của người ấy để gửi yêu cầu ghép đôi. Hệ thống trung gian sẽ giúp hai thiết bị bắt tay, trao đổi chìa khóa mã hóa công khai (Public Key) với nhau một cách an toàn nhất.
                  </p>
                </div>
                <div className="space-y-2 bg-white/[0.01] border border-white/5 p-5 rounded-2xl">
                  <span className="text-lg font-bold text-[#c5a059] font-mono">03</span>
                  <h4 className="font-semibold text-slate-200">Bắt đầu không gian lứa đôi</h4>
                  <p className="leading-relaxed font-light">
                    Sau khi đối phương chấp nhận lời mời, kênh bí mật đã được thiết lập. Từ đây, tin nhắn, hình ảnh locket, nhắc nhở và đếm ngày kỷ niệm của hai bạn sẽ hoạt động hoàn toàn bảo mật.
                  </p>
                </div>
              </div>
            </div>

            {/* Video Tutorial Section */}
            <div className="space-y-6 border-t border-white/5 pt-12 text-left">
              <h2 className="text-xl md:text-2xl font-serif text-[#ebd4b3] flex items-center gap-2">
                <span>🎥</span>
                <span>Video hướng dẫn chi tiết</span>
              </h2>
              <p className="text-xs text-slate-400 max-w-xl leading-relaxed font-sans font-light">
                Hãy theo dõi video hướng dẫn dưới đây để biết cách đăng ký tài khoản, liên kết Google Drive và thiết lập không gian ghép đôi một cách trực quan nhất.
              </p>
              <div className="w-full aspect-video rounded-3xl overflow-hidden border border-white/10 bg-black/40 relative shadow-2xl">
                <iframe
                  className="w-full h-full"
                  src="https://www.youtube.com/embed/njZ_hRffWyM"
                  title="Dou-Coupl Video Tutorial"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
            </div>

            {/* Commit & Status Area */}
            <div className="bg-white/[0.01] border border-white/5 rounded-3xl p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 font-sans">
              <div className="space-y-2 text-left">
                <h4 className="text-xs font-semibold text-slate-200 font-sans">Cam kết phi lợi nhuận lâu dài</h4>
                <p className="text-xs text-slate-400 max-w-xl leading-relaxed font-light">
                  Chúng tôi xây dựng <strong>Dou-Coupl</strong> như một món quà dành cho cộng đồng. Ứng dụng hoạt động phi thương mại, không chèn bất kỳ quảng cáo nào và không thu thập bất kỳ dữ liệu cá nhân nào. Các dịch vụ lõi đều chạy trực tiếp trên thiết bị của hai bạn hoặc lưu trữ trên Google Drive cá nhân để đảm bảo ứng dụng có thể hoạt động độc lập và bảo mật trường tồn.
                </p>
              </div>
              <div className="shrink-0 flex items-center gap-2 bg-[#c5a059]/10 border border-[#c5a059]/20 px-4 py-2.5 rounded-2xl text-[10px] font-mono text-[#c5a059] uppercase tracking-wider">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                <span>Hệ thống hoạt động ổn định</span>
              </div>
            </div>
          </main>

          {/* Footer */}
          <footer className="w-full border-t border-white/5 py-8 mt-12 shrink-0 relative z-10 font-sans">
            <div className="max-w-4xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-[10px] text-slate-500 font-mono">
                © 2026 Dou-Coupl. Bản quyền thuộc về cộng đồng nguồn mở.
              </div>
              <div className="flex gap-6 text-[10px] text-slate-500 font-mono">
                <a href="/privacy.html" target="_blank" rel="noopener noreferrer" className="hover:text-[#c5a059] transition-colors">Chính sách bảo mật</a>
                <span>•</span>
                <a href="/terms.html" target="_blank" rel="noopener noreferrer" className="hover:text-[#c5a059] transition-colors">Điều khoản dịch vụ</a>
              </div>
            </div>
          </footer>
        </div>
      );
    }

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
          {/* Back to Home Page */}
          <div className="absolute top-4 left-4 md:top-6 md:left-6">
            <button
              onClick={() => { setShowLogin(false); setAuthError(null); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 text-[10px] font-medium transition-all active:scale-95 cursor-pointer"
            >
              <span>← Quay lại</span>
            </button>
          </div>
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

          {/* Desktop copyright footer */}
          {isDesktop && (
            <div className="text-center pt-2 border-t border-white/5 mt-2">
              <p className="text-[9px] text-slate-600 font-mono tracking-wider">© 2025-2026 <span className="text-[#c5a059]/60">@Dou-Coupl</span></p>
              <p className="text-[8px] text-slate-700 mt-1 font-mono">
                Phát triển bởi{' '}
                <span
                  className="text-slate-500 hover:text-[#c5a059] transition-colors cursor-pointer"
                  onClick={() => alert('Developers: MaxxAlan')}
                >
                  MaxxAlan
                </span>
              </p>
            </div>
          )}
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
          {/* Sign Out option */}
          <div className="absolute top-4 right-4 md:top-6 md:right-6">
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/5 border border-white/5 hover:bg-red-500/10 hover:text-red-400 text-[10px] font-medium transition-all active:scale-95 cursor-pointer text-slate-400"
            >
              <LogOut className="w-3 h-3" />
              <span>Đăng xuất</span>
            </button>
          </div>
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
          {/* Sign Out option */}
          <div className="absolute top-4 right-4 md:top-6 md:right-6">
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/5 border border-white/5 hover:bg-red-500/10 hover:text-red-400 text-[10px] font-medium transition-all active:scale-95 cursor-pointer text-slate-400"
            >
              <LogOut className="w-3 h-3" />
              <span>Đăng xuất</span>
            </button>
          </div>
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

    // 1. PIN Lock Guard (per-partner)
    const activePasscodeNeeded = activePartner === 'A' ? coupleData?.hasPasscodeA : coupleData?.hasPasscodeB;
    if (activePasscodeNeeded && !isUnlocked && !isSettingPasscode) {
      return (
        <PasscodeLock
          correctPasscode="" // verification handled via async callback
          onVerifyPasscode={handleVerifyPasscode}
          onUnlock={() => {
            if (activePartner === 'A') {
              setIsUnlockedA(true);
              sessionStorage.setItem(`unlocked_${coupleId}_A`, 'true');
            } else {
              setIsUnlockedB(true);
              sessionStorage.setItem(`unlocked_${coupleId}_B`, 'true');
            }
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
              {activeTab === 'anniversary' && t('header.anniversary')}
              {activeTab === 'chat' && t('header.chat')}
              {activeTab === 'album' && t('header.album')}
              {activeTab === 'reminders' && t('header.reminders')}
              {activeTab === 'security' && t('header.security')}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={themeMusic.toggle}
              className={`p-1.5 rounded-xl bg-white/[0.03] border border-white/10 transition-colors cursor-pointer ${
                themeMusic.playing ? 'text-[#c5a059]' : 'text-white/40 hover:text-white/70'
              }`}
              title={themeMusic.playing ? 'Tắt nhạc nền' : 'Bật nhạc nền'}
            >
              {themeMusic.playing ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            </button>
            {activePasscodeNeeded && (
              <button
                onClick={() => {
                  if (activePartner === 'A') {
                    sessionStorage.removeItem(`unlocked_${coupleId}_A`);
                    setIsUnlockedA(false);
                  } else {
                    sessionStorage.removeItem(`unlocked_${coupleId}_B`);
                    setIsUnlockedB(false);
                  }
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
              pairingCode={coupleData?.pairingCode || ''}
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
              onUploadPhoto={handleUploadPhoto}
              photos={photos}
              p2pStatus={p2pStatus}
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
              waterLogs={waterLogs}
              onAddWaterLog={handleAddWaterLog}
              onDeleteWaterLog={handleDeleteWaterLog}
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
              hasPasscode={!!(activePartner === 'A' ? coupleData?.hasPasscodeA : coupleData?.hasPasscodeB)}
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
              p2pStatus={p2pStatus}
              onStartP2PHost={() => p2pChannel.startHost()}
              onStopP2P={() => p2pChannel.closeChannel()}
            />
          )}
        </div>

        {/* Navigation bottom bar */}
        <div className="h-16 bg-[#0e0e0e]/95 border-t border-white/5 px-4 flex justify-around items-center shrink-0 select-none pb-2">
          {[
            { id: 'anniversary', icon: <Heart className="w-5 h-5" />, label: t('tab.anniversary') },
            { id: 'chat', icon: <MessageCircle className="w-5 h-5" />, label: t('tab.chat') },
            { id: 'album', icon: <ImageIcon className="w-5 h-5" />, label: t('tab.album') },
            { id: 'reminders', icon: <CheckSquare className="w-5 h-5" />, label: t('tab.reminders') },
            { id: 'security', icon: <Shield className="w-5 h-5" />, label: t('tab.security') }
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
    <I18nProvider localeData={localeData}>
    <div className="h-screen bg-[#080808] font-sans flex flex-col text-slate-100 overflow-hidden relative select-none">
      
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
            onClick={() => setNotification(null)}
            className="absolute top-20 left-1/2 z-50 bg-[#0c0c0c]/95 border border-[#c5a059]/30 text-[#c5a059] py-3 px-5 rounded-2xl shadow-2xl flex items-center gap-3 font-sans w-[90%] max-w-sm backdrop-blur-md cursor-pointer active:scale-95 transition-transform"
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

      {/* Main Container — Desktop or Phone */}
      {isDesktop ? (
        <div className="flex-grow z-10 w-full h-full overflow-hidden">
          {renderDesktopScreen()}
        </div>
      ) : (
        <div className="flex-grow flex items-center justify-center z-10 w-full overflow-hidden h-full">
          <div className="w-full max-w-md h-dvh md:h-[92vh] md:max-h-[850px] bg-black border-x border-white/5 md:rounded-[36px] shadow-2xl flex flex-col overflow-hidden relative safe-area-bottom">
            {renderPhoneScreen()}
          </div>
        </div>
      )}

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
              const googleToken = localStorage.getItem(`google_access_token_${activePartner}`);
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

      {/* Offline Screen — replaces app when disconnected */}
      {!online && coupleData && !isCallActive && (
        <OfflineScreen
          onRetry={() => window.location.reload()}
          musicPlaying={themeMusic.playing}
          onToggleMusic={themeMusic.toggle}
        />
      )}

    </div>
    </I18nProvider>
  );
}
