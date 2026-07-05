import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Heart, 
  MessageCircle, 
  Image as ImageIcon, 
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
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  where,
  getDocs
} from 'firebase/firestore';

import { Partner, EncryptedMessage, EncryptedPhoto, Reminder } from './types';
import { deriveSymmetricKey } from './lib/crypto';
import { auth, db } from './lib/firebase';

// Import Custom Components
import PasscodeLock from './components/PasscodeLock';
import ChatTab from './components/ChatTab';
import AlbumTab from './components/AlbumTab';
import AnniversaryTab from './components/AnniversaryTab';
import RemindersTab from './components/RemindersTab';
import SecurityHub from './components/SecurityHub';

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
  const [activePartner, setActivePartner] = useState<'A' | 'B'>('A');

  // Real-time collections
  const [messages, setMessages] = useState<EncryptedMessage[]>([]);
  const [photos, setPhotos] = useState<EncryptedPhoto[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [specialAnniversaries, setSpecialAnniversaries] = useState<any[]>([]);

  // Navigation and Passcode UI Settings
  const [activeTab, setActiveTab] = useState<'anniversary' | 'chat' | 'album' | 'reminders' | 'security'>('anniversary');
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [isSettingPasscode, setIsSettingPasscode] = useState<boolean>(false);

  // E2EE Symmetric Crypto Key
  const [symmetricKey, setSymmetricKey] = useState<CryptoKey | null>(null);

  // Custom visual notification states
  const [notification, setNotification] = useState<{ title: string; body: string; type: string } | null>(null);

  // Trigger Top Banner notification
  const triggerNotification = (title: string, body: string, type: string) => {
    setNotification({ title, body, type });
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  // 1. Listen to Firebase Authentication State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        // Load or create User profile document in Firestore
        const userDocRef = doc(db, 'users', user.uid);
        
        // Listen to User Profile changes in real-time
        const unsubProfile = onSnapshot(userDocRef, async (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data();
            setUserProfile(data);
            setCoupleId(data.coupleId || null);
          } else {
            // Document doesn't exist, initialize default user profile state
            const initialProfile = {
              uid: user.uid,
              nickname: '',
              avatar: user.photoURL || PRESET_AVATARS[0],
              pairingCode: generatePairingCode(),
              coupleId: null,
              createdAt: Date.now()
            };
            await setDoc(userDocRef, initialProfile);
            setUserProfile(initialProfile);
            setCoupleId(null);
          }
          setAuthLoading(false);
        });

        return () => unsubProfile();
      } else {
        setUserProfile(null);
        setCoupleId(null);
        setCoupleData(null);
        setAuthLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // 2. Listen to Couple document & subcollections when paired
  useEffect(() => {
    if (!coupleId) {
      setCoupleData(null);
      setMessages([]);
      setPhotos([]);
      setReminders([]);
      setSpecialAnniversaries([]);
      return;
    }

    // A. Listen to main couple document
    const coupleDocRef = doc(db, 'couples', coupleId);
    const unsubCouple = onSnapshot(coupleDocRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setCoupleData(data);

        // Determine active partner ID (A or B) based on UID
        if (data.partnerA.uid === currentUser?.uid) {
          setActivePartner('A');
        } else if (data.partnerB.uid === currentUser?.uid) {
          setActivePartner('B');
        }

        // Handle Auto-lock screen if passcode is set
        if (data.passcodeHash && !localStorage.getItem(`unlocked_${coupleId}`)) {
          setIsLocked(true);
        }
      }
    });

    // B. Listen to Messages subcollection
    const messagesRef = collection(db, 'couples', coupleId, 'messages');
    const messagesQuery = query(messagesRef, orderBy('timestamp', 'asc'));
    const unsubMessages = onSnapshot(messagesQuery, (snapshot) => {
      const msgs: EncryptedMessage[] = [];
      snapshot.forEach((doc) => {
        msgs.push({ id: doc.id, ...doc.data() } as EncryptedMessage);
      });
      setMessages(msgs);
    });

    // C. Listen to Photos subcollection
    const photosRef = collection(db, 'couples', coupleId, 'photos');
    const photosQuery = query(photosRef, orderBy('timestamp', 'desc'));
    const unsubPhotos = onSnapshot(photosQuery, (snapshot) => {
      const pts: EncryptedPhoto[] = [];
      snapshot.forEach((doc) => {
        pts.push({ id: doc.id, ...doc.data() } as EncryptedPhoto);
      });
      setPhotos(pts);
    });

    // D. Listen to Reminders subcollection
    const remindersRef = collection(db, 'couples', coupleId, 'reminders');
    const remindersQuery = query(remindersRef, orderBy('timestamp', 'desc'));
    const unsubReminders = onSnapshot(remindersQuery, (snapshot) => {
      const rems: Reminder[] = [];
      snapshot.forEach((doc) => {
        rems.push({ id: doc.id, ...doc.data() } as Reminder);
      });
      setReminders(rems);
    });

    // E. Listen to Special Anniversaries subcollection
    const annivRef = collection(db, 'couples', coupleId, 'specialAnniversaries');
    const annivQuery = query(annivRef, orderBy('timestamp', 'desc'));
    const unsubAnniv = onSnapshot(annivQuery, (snapshot) => {
      const anns: any[] = [];
      snapshot.forEach((doc) => {
        anns.push({ id: doc.id, ...doc.data() });
      });
      setSpecialAnniversaries(anns);
    });

    return () => {
      unsubCouple();
      unsubMessages();
      unsubPhotos();
      unsubReminders();
      unsubAnniv();
    };
  }, [coupleId, currentUser]);

  // 3. Derive Cryptographic E2EE Symmetric Key on-the-fly when pairing code is loaded
  useEffect(() => {
    if (coupleData?.pairingCode) {
      deriveSymmetricKey(coupleData.pairingCode).then(key => {
        setSymmetricKey(key);
      });
    } else {
      setSymmetricKey(null);
    }
  }, [coupleData?.pairingCode]);

  // Helper to generate a unique random pairing code
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
    return code; // DUO-XXXX-XXXX
  };

  // --- ACTIONS & EVENTS HANDLING ---

  // Sign Up with Email/Password
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

  // Sign In with Email/Password
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      setAuthError('Tài khoản hoặc mật khẩu không chính xác.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  // Google Authentication via Popup
  const handleGoogleSignIn = async () => {
    setAuthError(null);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      setAuthError('Không thể đăng nhập bằng tài khoản Google.');
    }
  };

  // Sign Out
  const handleSignOut = async () => {
    if (confirm('Bạn có chắc chắn muốn đăng xuất?')) {
      if (coupleId) {
        localStorage.removeItem(`unlocked_${coupleId}`);
      }
      await signOut(auth);
    }
  };

  // Save Onboarding Profile settings
  const handleSaveOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim()) return;
    setOnboardingSubmitting(true);
    try {
      const userDocRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userDocRef, {
        nickname: nickname.trim(),
        avatar: selectedAvatar
      });
    } catch (error) {
      console.error(error);
    } finally {
      setOnboardingSubmitting(false);
    }
  };

  // Copy Pairing Code to clipboard
  const handleCopyCode = () => {
    if (userProfile?.pairingCode) {
      navigator.clipboard.writeText(userProfile.pairingCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  // Pair with Partner using their Code
  const handlePairPartner = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = partnerCode.trim().toUpperCase();
    if (!cleanCode) return;
    setPairingError(null);
    setPairingSubmitting(true);

    try {
      // 1. Query Firestore users for partner code
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('pairingCode', '==', cleanCode));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setPairingError('Mã kết nối không tồn tại. Vui lòng kiểm tra lại!');
        setPairingSubmitting(false);
        return;
      }

      let partnerDoc: any = null;
      querySnapshot.forEach((doc) => {
        partnerDoc = { id: doc.id, ...doc.data() };
      });

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

      // 2. Pair successfully! Initialize a shared couple document
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

      // Create Couple document
      await setDoc(doc(db, 'couples', newCoupleId), newCoupleDoc);

      // Update both User documents with the new coupleId reference
      await updateDoc(doc(db, 'users', currentUser.uid), { coupleId: newCoupleId });
      await updateDoc(doc(db, 'users', partnerDoc.id), { coupleId: newCoupleId });

      triggerNotification(
        'Ghép đôi thành công', 
        `Đã kết nối vào Không gian E2EE bảo mật tuyệt đối 🔒`, 
        'security'
      );
    } catch (err: any) {
      console.error(err);
      setPairingError('Có lỗi xảy ra trong quá trình ghép đôi.');
    } finally {
      setPairingSubmitting(false);
    }
  };

  // Send a real-time message
  const handleSendMessage = async (ciphertext: string, iv: string) => {
    if (!coupleId) return;
    try {
      const messagesRef = collection(db, 'couples', coupleId, 'messages');
      await addDoc(messagesRef, {
        senderId: activePartner,
        ciphertext,
        iv,
        timestamp: Date.now(),
        type: 'text'
      });
    } catch (e) {
      console.error('Failed to send message via Firestore', e);
    }
  };

  // Upload an encrypted photo
  const handleUploadPhoto = async (
    ciphertext: string, 
    iv: string, 
    isViewOnce: boolean,
    captionCiphertext?: string,
    captionIv?: string
  ) => {
    if (!coupleId) return;
    try {
      const photosRef = collection(db, 'couples', coupleId, 'photos');
      await addDoc(photosRef, {
        senderId: activePartner,
        ciphertext,
        iv,
        captionCiphertext: captionCiphertext || '',
        captionIv: captionIv || '',
        isViewOnce: !!isViewOnce,
        timestamp: Date.now()
      });
    } catch (e) {
      console.error('Failed to post photo to Firestore', e);
    }
  };

  // Delete photo (including view once self destruction)
  const handleDeletePhoto = async (id: string) => {
    if (!coupleId) return;
    try {
      await deleteDoc(doc(db, 'couples', coupleId, 'photos', id));
    } catch (e) {
      console.error(e);
    }
  };

  // Add checklist reminder
  const handleAddReminder = async (title: string, category: 'date' | 'gift' | 'daily' | 'special', dueDate: string) => {
    if (!coupleId) return;
    try {
      const remindersRef = collection(db, 'couples', coupleId, 'reminders');
      await addDoc(remindersRef, {
        title,
        category,
        dueDate,
        completed: false,
        createdBy: activePartner,
        timestamp: Date.now()
      });
    } catch (e) {
      console.error(e);
    }
  };

  // Toggle checklist reminder state
  const handleToggleReminder = async (id: string) => {
    if (!coupleId) return;
    try {
      const remRef = doc(db, 'couples', coupleId, 'reminders', id);
      const snap = await getDoc(remRef);
      if (snap.exists()) {
        await updateDoc(remRef, {
          completed: !snap.data().completed
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Delete reminder
  const handleDeleteReminder = async (id: string) => {
    if (!coupleId) return;
    try {
      await deleteDoc(doc(db, 'couples', coupleId, 'reminders', id));
    } catch (e) {
      console.error(e);
    }
  };

  // Save general anniversary starting date
  const handleUpdateAnniversary = async (date: string) => {
    if (!coupleId) return;
    try {
      await updateDoc(doc(db, 'couples', coupleId), {
        anniversaryDate: date
      });
    } catch (e) {
      console.error(e);
    }
  };

  // Add/Update special anniversary timeline event
  const handleAddSpecialAnniversary = async (createdBy: 'A' | 'B', title: string, date: string, notes?: string, photo?: string, id?: string) => {
    if (!coupleId) return;
    try {
      const specRef = collection(db, 'couples', coupleId, 'specialAnniversaries');
      if (id) {
        await updateDoc(doc(specRef, id), {
          title,
          date,
          notes: notes || '',
          photo: photo || '',
          timestamp: Date.now()
        });
      } else {
        await addDoc(specRef, {
          title,
          date,
          notes: notes || '',
          photo: photo || '',
          createdBy,
          timestamp: Date.now()
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Delete timeline event
  const handleDeleteSpecialAnniversary = async (id: string) => {
    if (!coupleId) return;
    try {
      await deleteDoc(doc(db, 'couples', coupleId, 'specialAnniversaries', id));
    } catch (e) {
      console.error(e);
    }
  };

  // Update profile details inside SecurityHub
  const handleUpdateProfile = async (partnerId: 'A' | 'B', name: string, avatar: string) => {
    if (!coupleId) return;
    try {
      const coupleRef = doc(db, 'couples', coupleId);
      if (partnerId === 'A') {
        await updateDoc(coupleRef, {
          partnerA: { ...coupleData.partnerA, name, avatar }
        });
      } else {
        await updateDoc(coupleRef, {
          partnerB: { ...coupleData.partnerB, name, avatar }
        });
      }
      
      // Sync on user collections
      await updateDoc(doc(db, 'users', currentUser.uid), {
        nickname: name,
        avatar
      });
    } catch (e) {
      console.error(e);
    }
  };

  // PIN lock settings
  const handleSetPasscode = async (pin: string) => {
    if (!coupleId) return;
    try {
      await updateDoc(doc(db, 'couples', coupleId), {
        passcodeHash: pin
      });
      setIsSettingPasscode(false);
      triggerNotification('Thiết lập khóa', 'PIN bảo vệ không gian đã được kích hoạt 🔒', 'security');
    } catch (e) {
      console.error(e);
    }
  };

  const handleClearPasscode = async () => {
    if (!coupleId) return;
    try {
      await updateDoc(doc(db, 'couples', coupleId), {
        passcodeHash: ''
      });
      localStorage.removeItem(`unlocked_${coupleId}`);
      setIsLocked(false);
      triggerNotification('Gỡ bỏ khóa', 'PIN bảo mật đã được vô hiệu hóa', 'security');
    } catch (e) {
      console.error(e);
    }
  };

  // Reset/Empty current workspace
  const handleResetDatabase = async () => {
    if (!coupleId) return;
    if (confirm('Bạn có chắc chắn muốn đặt lại toàn bộ cài đặt ngày yêu và PIN bảo mật?')) {
      try {
        await updateDoc(doc(db, 'couples', coupleId), {
          anniversaryDate: new Date().toISOString().split('T')[0],
          passcodeHash: ''
        });
        localStorage.removeItem(`unlocked_${coupleId}`);
        setIsLocked(false);
        triggerNotification('Đặt lại', 'Đã khôi phục mặc định thông số thời gian & PIN!', 'security');
      } catch (e) {
        console.error(e);
      }
    }
  };

  // Rendering loading state
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#080808] flex flex-col items-center justify-center font-sans text-slate-400">
        <Loader2 className="w-10 h-10 text-[#c5a059] animate-spin mb-4" />
        <p className="text-xs font-mono uppercase tracking-widest">Đang khởi tạo không gian...</p>
      </div>
    );
  }

  // Render Authentication state (Login / Register)
  if (!currentUser) {
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
          {/* Header Title */}
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-extralight tracking-wider text-[#c5a059] font-serif">DUO</h1>
            <p className="text-xs text-slate-400 max-w-[280px] mx-auto leading-relaxed">
              Không gian lãng mạn lứa đôi bảo mật mã hóa đầu cuối (E2EE) tuyệt đối.
            </p>
          </div>

          {/* Form switch tab */}
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

          {/* Error Banner */}
          {authError && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-3.5 flex items-start gap-2.5 text-xs text-red-400">
              <AlertCircle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          {/* Core Credentials Form */}
          <form onSubmit={authMode === 'login' ? handleSignIn : handleSignUp} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[9px] font-mono tracking-wider text-slate-500 uppercase">ĐỊA CHỈ EMAIL</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3.5 w-4 h-4 text-slate-600" />
                <input
                  type="email"
                  required
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-black/60 border border-white/5 rounded-2xl py-3 pl-10 pr-4 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-[#c5a059]/50 transition-colors"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[9px] font-mono tracking-wider text-slate-500 uppercase">MẬT KHẨU</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3.5 w-4 h-4 text-slate-600" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-black/60 border border-white/5 rounded-2xl py-3 pl-10 pr-4 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-[#c5a059]/50 transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={authSubmitting}
              className="w-full bg-[#c5a059] hover:bg-[#b08b47] disabled:opacity-50 text-black font-semibold text-xs py-3.5 rounded-2xl transition-all shadow-lg active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
            >
              {authSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Vui lòng chờ...</span>
                </>
              ) : (
                <>
                  <span>{authMode === 'login' ? 'Đăng nhập ngay' : 'Tạo tài khoản'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>

          {/* Social login divider */}
          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-white/5"></div>
            <span className="flex-shrink mx-4 text-[9px] font-mono text-slate-600 uppercase tracking-widest">Hoặc</span>
            <div className="flex-grow border-t border-white/5"></div>
          </div>

          {/* Google SSO trigger */}
          <button
            onClick={handleGoogleSignIn}
            className="w-full bg-white/[0.02] border border-white/10 hover:bg-white/[0.05] text-slate-300 text-xs py-3 rounded-2xl transition-all flex items-center justify-center gap-2.5 cursor-pointer"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            <span>Tiếp tục với Google</span>
          </button>
        </motion.div>
      </div>
    );
  }

  // Render Profile Onboarding if not complete
  if (!userProfile?.nickname) {
    return (
      <div className="min-h-screen bg-[#080808] font-sans flex items-center justify-center p-4 relative overflow-hidden text-slate-200 select-none">
        <div className="absolute inset-0 opacity-10 pointer-events-none overflow-hidden">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-[#c5a059] blur-[140px]" />
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-gradient-to-b from-[#111] to-[#0c0c0c] border border-white/5 rounded-3xl p-6 md:p-8 shadow-2xl relative z-10 space-y-6"
        >
          <div className="text-center space-y-1.5">
            <h2 className="text-xl font-light text-[#c5a059] flex items-center justify-center gap-1.5">
              <Sparkles className="w-4 h-4" />
              <span>Thiết lập hồ sơ</span>
            </h2>
            <p className="text-[11px] text-slate-500">Cài đặt biệt danh đại diện và hình ảnh của bạn trong ứng dụng.</p>
          </div>

          <form onSubmit={handleSaveOnboarding} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-[9px] font-mono tracking-wider text-slate-500 uppercase">BIỆT DANH CỦA BẠN</label>
              <div className="relative">
                <User className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-600" />
                <input
                  type="text"
                  required
                  placeholder="Nhập tên hoặc biệt danh..."
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  className="w-full bg-black/60 border border-white/5 rounded-2xl py-3 pl-11 pr-4 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-[#c5a059]/50 transition-colors"
                />
              </div>
            </div>

            {/* Avatar picker presets */}
            <div className="space-y-2">
              <label className="text-[9px] font-mono tracking-wider text-slate-500 uppercase">CHỌN ẢNH ĐẠI DIỆN</label>
              <div className="grid grid-cols-4 gap-2.5">
                {PRESET_AVATARS.map((avatarUrl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedAvatar(avatarUrl)}
                    className={`aspect-square rounded-2xl overflow-hidden border p-0.5 transition-all relative ${
                      selectedAvatar === avatarUrl ? 'border-[#c5a059] scale-105 shadow-md' : 'border-white/5 hover:border-white/20'
                    }`}
                  >
                    <img src={avatarUrl} alt="Avatar Preset" className="w-full h-full object-cover rounded-xl" referrerPolicy="no-referrer" />
                    {selectedAvatar === avatarUrl && (
                      <div className="absolute inset-0 bg-[#c5a059]/20 flex items-center justify-center rounded-xl">
                        <Check className="w-4 h-4 text-black font-bold" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={onboardingSubmitting || !nickname.trim()}
              className="w-full bg-[#c5a059] hover:bg-[#b08b47] disabled:opacity-50 text-black font-semibold text-xs py-3.5 rounded-2xl transition-all shadow-lg active:scale-95 cursor-pointer flex items-center justify-center gap-1"
            >
              {onboardingSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>Tiếp tục cuộc hành trình</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  // Render Pairing screen if no Couple reference is established
  if (!coupleId) {
    return (
      <div className="min-h-screen bg-[#080808] font-sans flex items-center justify-center p-4 relative overflow-hidden text-slate-200 select-none">
        <div className="absolute inset-0 opacity-10 pointer-events-none overflow-hidden">
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-[#c5a059] blur-[140px]" />
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-gradient-to-b from-[#111] to-[#0c0c0c] border border-white/5 rounded-3xl p-6 md:p-8 shadow-2xl relative z-10 space-y-6"
        >
          {/* User brief profile status */}
          <div className="flex items-center justify-between border-b border-white/5 pb-4.5">
            <div className="flex items-center gap-3">
              <img src={userProfile.avatar} alt="Profile" className="w-9 h-9 rounded-xl object-cover border border-white/10 shadow-sm" referrerPolicy="no-referrer" />
              <div>
                <h3 className="text-xs font-semibold text-slate-200">{userProfile.nickname}</h3>
                <span className="text-[9px] font-mono text-slate-500">Chờ ghép đôi...</span>
              </div>
            </div>

            <button
              onClick={handleSignOut}
              className="p-1.5 rounded-lg bg-white/[0.02] border border-white/5 text-slate-500 hover:text-red-400 hover:border-red-500/10 transition-all cursor-pointer"
              title="Đăng xuất"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-4 text-center">
            <h2 className="text-lg font-light text-[#c5a059] flex items-center justify-center gap-1.5">
              <Users className="w-4.5 h-4.5" />
              <span>Kết nối tình yêu</span>
            </h2>
            <p className="text-[11px] text-slate-400 leading-relaxed max-w-[300px] mx-auto">
              Gửi mã của bạn cho người ấy hoặc nhập mã của người ấy để bắt đầu không gian riêng tư được bảo mật mã hóa E2EE.
            </p>
          </div>

          {/* User code copying widget */}
          <div className="bg-black/50 border border-white/5 p-4 rounded-2xl flex flex-col items-center justify-center space-y-2 relative">
            <span className="text-[8px] font-mono text-slate-500 uppercase tracking-widest">MÃ SỐ KẾT NỐI CỦA BẠN</span>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold font-mono text-[#ebd4b3] select-all tracking-wider">{userProfile.pairingCode}</span>
              <button
                onClick={handleCopyCode}
                className="p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] text-slate-400 hover:text-[#ebd4b3] border border-white/5 transition-all cursor-pointer"
                title="Sao chép mã"
              >
                {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Error Banner */}
          {pairingError && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs text-red-400 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{pairingError}</span>
            </div>
          )}

          {/* Enter partner's pairing code form */}
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

  // PASSCODE LOCK GUARD (If couple PIN passcode is set and not bypassed)
  if (isLocked && coupleData?.passcodeHash) {
    return (
      <PasscodeLock
        correctPasscode={coupleData.passcodeHash}
        onUnlock={() => {
          setIsLocked(false);
          localStorage.setItem(`unlocked_${coupleId}`, 'true');
        }}
      />
    );
  }

  // PASSCODE SETTING MODE (Inside Security tab config)
  if (isSettingPasscode) {
    return (
      <PasscodeLock
        correctPasscode=""
        isSettingMode={true}
        onUnlock={() => setIsSettingPasscode(false)}
        onSetPasscodeComplete={(pin) => handleSetPasscode(pin)}
        onCancelSetting={() => setIsSettingPasscode(false)}
      />
    );
  }

  // --- CORE PAIRED DASHBOARD ---
  return (
    <div className="min-h-screen bg-[#080808] font-sans flex flex-col text-slate-100 overflow-x-hidden relative select-none">
      {/* Glow Effect Decoration */}
      <div className="absolute inset-0 opacity-15 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-[#c5a059] blur-[140px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-[#201a15] blur-[140px]" />
      </div>

      {/* Top Banner Alert notification */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ y: -100, opacity: 0, x: '-50%' }}
            animate={{ y: 0, opacity: 1, x: '-50%' }}
            exit={{ y: -100, opacity: 0, x: '-50%' }}
            className="absolute top-6 left-1/2 z-50 bg-[#0c0c0c]/95 border border-[#c5a059]/30 text-[#c5a059] py-3 px-5 rounded-2xl shadow-2xl flex items-center gap-3 font-sans w-[90%] max-w-sm pointer-events-none backdrop-blur-md"
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

      {/* Responsive Workspace Grid */}
      <div className="flex-grow flex items-center justify-center p-4 md:p-6 z-10">
        <div className="w-full max-w-md h-[88vh] bg-[#0c0c0c] border border-white/5 rounded-[40px] shadow-2xl flex flex-col overflow-hidden relative">
          
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
              {/* Force screen lock button */}
              {coupleData?.passcodeHash && (
                <button
                  onClick={() => {
                    localStorage.removeItem(`unlocked_${coupleId}`);
                    setIsLocked(true);
                  }}
                  className="p-1.5 rounded-xl bg-white/[0.03] border border-white/10 text-white/40 hover:text-[#c5a059] transition-colors cursor-pointer"
                  title="Khóa không gian ngay"
                >
                  <Lock className="w-3.5 h-3.5" />
                </button>
              )}
              {/* Log out profile button */}
              <button
                onClick={handleSignOut}
                className="p-1.5 rounded-xl bg-white/[0.03] border border-white/10 text-white/40 hover:text-red-400 transition-colors cursor-pointer"
                title="Đăng xuất"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Main Tab Screen View */}
          <div className="flex-1 overflow-hidden relative">
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
                hasPasscode={!!coupleData?.passcodeHash}
                partnerA={coupleData?.partnerA}
                partnerB={coupleData?.partnerB}
                activePartner={activePartner}
                onUpdateProfile={handleUpdateProfile}
                onClearPasscode={handleClearPasscode}
                onTriggerSetPasscode={() => setIsSettingPasscode(true)}
                onResetDatabase={handleResetDatabase}
              />
            )}
          </div>

          {/* Bottom Native Application Tab Bar */}
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
                {/* Active Slider Indicator */}
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
      </div>
    </div>
  );
}
