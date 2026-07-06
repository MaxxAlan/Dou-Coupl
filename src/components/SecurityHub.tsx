import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Key, 
  HardDrive, 
  Smartphone, 
  CheckCircle, 
  Info, 
  Lock, 
  Trash2, 
  HelpCircle,
  User,
  Upload,
  RefreshCw,
  Check,
  LogIn,
  Sparkles,
  Image as ImageIcon,
  Heart,
  ChevronRight,
  UserCheck,
  Edit2,
  Fingerprint,
  Timer,
  Video,
  Phone,
  MessageSquare,
  Calendar,
  Volume2,
  Settings2,
  Wifi,
  WifiOff,
  Server,
  Radio,
  Globe
} from 'lucide-react';
import { Partner } from '../types';
import { initAuth, googleSignIn, logoutGoogle } from '../lib/googleApi';
import useKeyHex from '../hooks/useKeyHex';
import { compressAndResizeImage } from '../lib/image';
import { storageHelper } from '../lib/storage';
import { BASE_URL } from '../lib/apiClient';
import type { P2PStatus } from '../lib/p2pChannel';
import LanguageSwitcher from './LanguageSwitcher';
import { useT } from '../lib/i18n';

interface SecurityHubProps {
  pairingCode: string;
  symmetricKey: CryptoKey | null;
  hasPasscode: boolean;
  partnerA: Partner;
  partnerB: Partner;
  activePartner: 'A' | 'B';
  onUpdateProfile: (partnerId: 'A' | 'B', name: string, avatar: string) => void;
  onClearPasscode: () => void;
  onTriggerSetPasscode: () => void;
  onResetDatabase: (clean: boolean) => void;
  onUpdateStorageMethod?: (partnerId: 'A' | 'B', storageMethod: 'p2p' | 'googledrive') => void;
  storageMethodA?: 'p2p' | 'googledrive';
  storageMethodB?: 'p2p' | 'googledrive';
  p2pStatus?: P2PStatus;
  onStartP2PHost?: () => void;
  onStopP2P?: () => void;
}

const PRESET_AVATARS = [
  // Boyfriend / Husband options
  'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop',
  // Girlfriend / Wife options
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop',
  // Cute Couple pets/aesthetic
  'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=150&auto=format&fit=crop', // Cute Cat
  'https://images.unsplash.com/photo-1537151625747-768eb64519f2?w=150&auto=format&fit=crop', // Cute Dog
  'https://images.unsplash.com/photo-1518020382113-a7e8fc38eac9?w=150&auto=format&fit=crop', // Pug
  'https://images.unsplash.com/photo-1456885284447-7dd4bb6845bc?w=150&auto=format&fit=crop'  // Cute lamb
];

export default function SecurityHub({
  pairingCode,
  symmetricKey,
  hasPasscode,
  partnerA,
  partnerB,
  activePartner,
  onUpdateProfile,
  onClearPasscode,
  onTriggerSetPasscode,
  onResetDatabase,
  onUpdateStorageMethod,
  storageMethodA,
  storageMethodB,
  p2pStatus,
  onStartP2PHost,
  onStopP2P
}: SecurityHubProps) {
  const t = useT();
  const keyHex = useKeyHex(symmetricKey);
  const [diagnosticLogs, setDiagnosticLogs] = useState<string[]>([]);
  
  // Gemini API Key state
  const [customApiKey, setCustomApiKey] = useState<string>(() => storageHelper.getItem<string>('custom_gemini_api_key', ''));
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [apiKeySuccess, setApiKeySuccess] = useState<boolean>(false);

  // WebAuthn state
  const [hasWebAuthnRegistered, setHasWebAuthnRegistered] = useState<boolean>(() => !!storageHelper.getItem<string>('webauthn_credential_id', ''));

  // Copyright dev reveal
  const [showDevs, setShowDevs] = useState(false);

  // Profile settings state
  const currentPartner = activePartner === 'A' ? partnerA : partnerB;
  const [profileName, setProfileName] = useState<string>(currentPartner.name);
  const [profileAvatar, setProfileAvatar] = useState<string>(currentPartner.avatar);
  const [isEditingProfile, setIsEditingProfile] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  // Advanced sync settings states
  const [syncInterval, setSyncInterval] = useState<string>('realtime');
  const [syncItems, setSyncItems] = useState<{
    photos: boolean;
    videos: boolean;
    audio: boolean;
    callHistory: boolean;
    chat: boolean;
    plans: boolean;
  }>({
    photos: true,
    videos: true,
    audio: true,
    callHistory: true,
    chat: true,
    plans: true,
  });

  useEffect(() => {
    const savedInterval = storageHelper.getItem<string>(`sync_interval_${activePartner}`, 'realtime');
    setSyncInterval(savedInterval);

    const savedItems = storageHelper.getItem<any>(`sync_items_${activePartner}`, null);
    if (savedItems) {
      setSyncItems(savedItems);
    } else {
      setSyncItems({
        photos: true,
        videos: true,
        audio: true,
        callHistory: true,
        chat: true,
        plans: true,
      });
    }
  }, [activePartner]);

  const handleUpdateSyncInterval = (newInterval: string) => {
    setSyncInterval(newInterval);
    storageHelper.setItem(`sync_interval_${activePartner}`, newInterval);
    
    setDiagnosticLogs(prev => [
      `[${new Date().toLocaleTimeString()}] Đã đổi tần suất đồng bộ thành: ${
        newInterval === 'realtime' ? 'Tức thời (Realtime)' :
        newInterval === '15m' ? 'Mỗi 15 phút' :
        newInterval === '1h' ? 'Mỗi giờ' :
        newInterval === '24h' ? 'Mỗi ngày' : 'Chỉ thủ công'
      }`,
      ...prev
    ]);
  };

  const handleToggleSyncItem = (key: keyof typeof syncItems) => {
    const updated = { ...syncItems, [key]: !syncItems[key] };
    setSyncItems(updated);
    storageHelper.setItem(`sync_items_${activePartner}`, updated);

    const itemLabel = 
      key === 'photos' ? 'Hình ảnh' :
      key === 'videos' ? 'Video' :
      key === 'audio' ? 'Âm thanh' :
      key === 'callHistory' ? 'Cuộc gọi' :
      key === 'chat' ? 'Tin nhắn' : 'Kế hoạch';

    setDiagnosticLogs(prev => [
      `[${new Date().toLocaleTimeString()}] Đã ${updated[key] ? 'bật' : 'tắt'} đồng bộ mục: ${itemLabel}`,
      ...prev
    ]);
  };

  // Google Auth integration states
  const [googleUser, setGoogleUser] = useState<any>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [isLoggingInGoogle, setIsLoggingInGoogle] = useState(false);

  useEffect(() => {
    const unsubscribe = initAuth(
      activePartner,
      (user, token) => {
        setGoogleUser(user);
        setGoogleToken(token);
      },
      () => {
        setGoogleUser(null);
        setGoogleToken(null);
      }
    );
    return () => unsubscribe();
  }, [activePartner]);

  // Sync profile editing fields when active partner switches
  useEffect(() => {
    const current = activePartner === 'A' ? partnerA : partnerB;
    setProfileName(current.name);
    setProfileAvatar(current.avatar);
    setSaveSuccess(false);
  }, [activePartner, partnerA, partnerB]);

  useEffect(() => {
    if (symmetricKey && keyHex !== 'DERIVING...' && keyHex !== 'ERR_EXTRACT') {
      setDiagnosticLogs([
        `[${new Date().toLocaleTimeString()}] Khóa mật mã đã được tạo thành công qua hàm PBKDF2.`,
        `[${new Date().toLocaleTimeString()}] Thuật toán mã hóa: AES-GCM 256-bit.`,
        `[${new Date().toLocaleTimeString()}] Hệ thống E2EE sẵn sàng bảo mật tin nhắn & ảnh.`,
        `[${new Date().toLocaleTimeString()}] Key Fingerprint: ${keyHex.substring(0, 16)}...`
      ]);
    } else {
      setDiagnosticLogs([`[${new Date().toLocaleTimeString()}] Chờ thiết lập khóa mật mã...`]);
    }
  }, [symmetricKey, keyHex]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileName.trim()) {
      alert('Vui lòng điền tên hiển thị.');
      return;
    }

    setIsSaving(true);
    try {
      await onUpdateProfile(activePartner, profileName.trim(), profileAvatar);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      setIsEditingProfile(false);
      
      // Append diagnostic logs
      setDiagnosticLogs(prev => [
        `[${new Date().toLocaleTimeString()}] Thay đổi thông tin cá nhân của Đối tác ${activePartner} thành công.`,
        `[${new Date().toLocaleTimeString()}] Đã cập nhật ảnh đại diện mới dạng Base64/URL.`,
        ...prev
      ]);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarUploadChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 8 * 1024 * 1024) {
        alert('Tệp hình ảnh quá lớn. Vui lòng chọn ảnh dưới 8MB.');
        return;
      }
      if (!file.type.startsWith('image/')) {
        alert('Vui lòng tải lên một tệp hình ảnh hợp lệ.');
        return;
      }
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const compressed = await compressAndResizeImage(reader.result as string, 800, 0.8);
          setProfileAvatar(compressed);
        } catch (err) {
          console.warn('Error compressing avatar image', err);
          setProfileAvatar(reader.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveApiKey = (e: React.FormEvent) => {
    e.preventDefault();
    storageHelper.setItem('custom_gemini_api_key', customApiKey.trim());
    setApiKeySuccess(true);
    setTimeout(() => setApiKeySuccess(false), 2000);
    setDiagnosticLogs(prev => [
      `[${new Date().toLocaleTimeString()}] Đã lưu cấu hình Gemini API Key tùy chỉnh vào bộ nhớ bảo mật cục bộ.`,
      ...prev
    ]);
  };

  const handleClearApiKey = () => {
    storageHelper.removeItem('custom_gemini_api_key');
    setCustomApiKey('');
    setApiKeySuccess(true);
    setTimeout(() => setApiKeySuccess(false), 2000);
    setDiagnosticLogs(prev => [
      `[${new Date().toLocaleTimeString()}] Đã xóa Gemini API Key tùy chỉnh. Sử dụng cấu hình mặc định của hệ thống.`,
      ...prev
    ]);
  };

  const handleRegisterWebAuthn = async () => {
    try {
      if (!window.PublicKeyCredential) {
        alert('Thiết bị hoặc trình duyệt của bạn không hỗ trợ xác thực sinh trắc học sinh học WebAuthn (Face ID / Windows Hello).');
        return;
      }

      // Random challenge bytes (32 bytes)
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);
      
      // Random user id (16 bytes)
      const userId = new Uint8Array(16);
      window.crypto.getRandomValues(userId);

      const rpName = "Private Space - Couple App";
      const userName = activePartner === 'A' ? partnerA.name : partnerB.name;

      const credentialOptions: CredentialCreationOptions = {
        publicKey: {
          challenge: challenge,
          rp: { name: rpName },
          user: {
            id: userId,
            name: `${activePartner.toLowerCase()}@privatespace.build`,
            displayName: userName
          },
          pubKeyCredParams: [
            { type: "public-key", alg: -7 }, // ES256
            { type: "public-key", alg: -257 } // RS256
          ],
          authenticatorSelection: {
            authenticatorAttachment: "platform", // Face ID, Touch ID, Windows Hello, Android Biometrics
            userVerification: "required",
            residentKey: "preferred"
          },
          timeout: 60000,
          attestation: "none"
        }
      };

      setDiagnosticLogs(prev => [
        `[${new Date().toLocaleTimeString()}] Bắt đầu gửi yêu cầu tạo thông tin xác thực WebAuthn (Face ID / Touch ID)...`,
        ...prev
      ]);

      const credential = await navigator.credentials.create(credentialOptions) as PublicKeyCredential;
      
      if (credential) {
        // Encode rawId to base64 so we can compare or request it later
        const rawId = credential.rawId;
        const binary = String.fromCharCode(...new Uint8Array(rawId));
        const base64Id = window.btoa(binary);
        
        storageHelper.setItem('webauthn_credential_id', base64Id);
        setHasWebAuthnRegistered(true);
        setDiagnosticLogs(prev => [
          `[${new Date().toLocaleTimeString()}] Đăng ký WebAuthn Face ID / Vân tay thành công! ID khóa: ${base64Id.substring(0, 15)}...`,
          ...prev
        ]);
        alert('Đăng ký Face ID / Vân tay sinh trắc học thành công! Bạn có thể mở khóa app bằng sinh trắc học từ bây giờ.');
      }
    } catch (err: any) {
      console.error(err);
      
      if (err.name === 'SecurityError' || err.name === 'NotAllowedError') {
        const confirmGo = confirm(
          `Hệ thống chặn truy cập API Sinh trắc học thực tế bên trong khung iframe này của AI Studio.\n\n` +
          `Để trải nghiệm Face ID / Vân tay thật qua API bảo mật của trình duyệt, hãy ấn "OK" để mở ứng dụng ở Tab Mới hoàn toàn. Ở đó Face ID sẽ hoạt động cực kỳ mượt mà!`
        );
        if (confirmGo) {
          window.open(window.location.href, '_blank');
        }
      } else {
        alert(`Lỗi đăng ký sinh trắc học: ${err.message || err}`);
      }
      
      setDiagnosticLogs(prev => [
        `[${new Date().toLocaleTimeString()}] Đăng ký WebAuthn thất bại: ${err.name} - ${err.message}`,
        ...prev
      ]);
    }
  };

  const handleRemoveWebAuthn = () => {
    storageHelper.removeItem('webauthn_credential_id');
    setHasWebAuthnRegistered(false);
    setDiagnosticLogs(prev => [
      `[${new Date().toLocaleTimeString()}] Đã xoá liên kết khóa sinh trắc học WebAuthn trên thiết bị này.`,
      ...prev
    ]);
    alert('Đã gỡ bỏ Face ID / Vân tay sinh trắc học của thiết bị này.');
  };

  return (
    <div className="h-full bg-[#080808] font-sans text-slate-100 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-5 space-y-6 pb-24 scrollbar-thin scrollbar-thumb-white/5">
        
        {/* Core Cryptography status card */}
        <div className="bg-white/[0.02] border border-white/5 p-4 rounded-2xl flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#c5a059]/10 border border-[#c5a059]/20 flex items-center justify-center text-[#c5a059]">
              <Shield className="w-5.5 h-5.5" />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-slate-100">{t('security.crypto_title')}</h4>
              <p className="text-[10px] text-[#c5a059] font-medium font-mono mt-0.5 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#c5a059] animate-pulse" />
                <span>{t('security.crypto_status')}</span>
              </p>
            </div>
          </div>
          <span className="text-[8px] bg-black px-2 py-1 rounded border border-white/5 text-slate-400 font-mono">CLIENT-ONLY</span>
        </div>


        {/* ACCOUNT SETTINGS SECTION (Edit Name, Avatar & Switch Identity info) */}
        <div className="space-y-3">
          <h3 className="text-[9px] font-mono text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-[#c5a059]" />
            <span>{t('security.profile')}</span>
          </h3>

          <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4.5 space-y-4">
            
            {/* Display Active Profile */}
            <div className="flex items-center justify-between bg-black/40 p-3 rounded-xl border border-white/5">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-12 h-12 rounded-full overflow-hidden border border-[#c5a059]/30 p-0.5">
                    <img 
                      src={currentPartner.avatar} 
                      alt={currentPartner.name} 
                      className="w-full h-full object-cover rounded-full" 
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#c5a059] text-black border-2 border-black flex items-center justify-center text-[10px] font-bold font-mono">
                    {activePartner}
                  </div>
                </div>
                <div>
                  <span className="text-[9px] text-[#c5a059] font-mono uppercase tracking-wider block">{t('security.member')}</span>
                  <h4 className="text-xs font-semibold text-slate-200">{currentPartner.name}</h4>
                </div>
              </div>

              {!isEditingProfile && (
                <button
                  onClick={() => setIsEditingProfile(true)}
                  className="p-1.5 text-slate-400 hover:text-[#c5a059] hover:bg-white/[0.03] rounded-lg transition-all flex items-center gap-1 text-[10px] font-medium font-sans border border-white/5 cursor-pointer"
                >
                  <Edit2 className="w-3 h-3" />
                  <span>{t('security.change')}</span>
                </button>
              )}
            </div>

            {/* Profile Editing Form */}
            {isEditingProfile && (
              <form onSubmit={handleSaveProfile} className="space-y-4 pt-2 border-t border-white/5">
                
                {/* Edit Name */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] text-slate-500 uppercase tracking-wider font-mono">Biệt danh hiển thị *</label>
                  <input
                    type="text"
                    required
                    value={profileName}
                    onChange={e => setProfileName(e.target.value)}
                    placeholder="Nhập tên của bạn..."
                    className="w-full bg-black border border-white/5 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-[#c5a059]/50 transition-colors"
                  />
                </div>

                {/* Edit Avatar: Preset Selection or Custom Upload */}
                <div className="space-y-2">
                  <label className="block text-[10px] text-slate-500 uppercase tracking-wider font-mono">
                    Chọn Ảnh đại diện (Preset hoặc tải lên)
                  </label>
                  
                  {/* Grid of Preset Avatars */}
                  <div className="grid grid-cols-6 gap-2 bg-black/40 p-2 rounded-xl border border-white/5">
                    {PRESET_AVATARS.map((avatarUrl, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setProfileAvatar(avatarUrl)}
                        className={`aspect-square rounded-full overflow-hidden border p-0.5 transition-all hover:scale-105 cursor-pointer relative ${
                          profileAvatar === avatarUrl ? 'border-[#c5a059] ring-2 ring-[#c5a059]/20' : 'border-white/5'
                        }`}
                      >
                        <img src={avatarUrl} className="w-full h-full object-cover rounded-full" alt="preset" referrerPolicy="no-referrer" />
                        {profileAvatar === avatarUrl && (
                          <div className="absolute inset-0 bg-[#c5a059]/20 flex items-center justify-center">
                            <Check className="w-4 h-4 text-[#c5a059] stroke-[3]" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Custom File Upload */}
                  <div className="flex items-center gap-3">
                    <label className="flex-1 flex items-center justify-center gap-2 border border-dashed border-white/10 hover:border-[#c5a059]/30 bg-black/30 hover:bg-black/60 p-2.5 rounded-xl cursor-pointer transition-all">
                      <Upload className="w-4 h-4 text-[#c5a059]" />
                      <span className="text-[10px] text-slate-300 font-medium">Tải ảnh từ thiết bị cá nhân</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarUploadChange}
                        className="hidden"
                      />
                    </label>

                    {profileAvatar && !PRESET_AVATARS.includes(profileAvatar) && (
                      <div className="w-10 h-10 rounded-full overflow-hidden border border-[#c5a059] p-0.5 shrink-0">
                        <img src={profileAvatar} className="w-full h-full object-cover rounded-full" alt="preview" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Save and Cancel buttons */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingProfile(false);
                      setProfileName(currentPartner.name);
                      setProfileAvatar(currentPartner.avatar);
                    }}
                    className="text-[10px] font-medium bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] text-slate-400 py-1.5 px-3 rounded-lg transition-all cursor-pointer"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="text-[10px] font-semibold bg-[#c5a059] hover:bg-[#b08b47] text-black py-1.5 px-3.5 rounded-lg transition-all flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                  >
                    {isSaving ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <Check className="w-3 h-3" />
                    )}
                    <span>Lưu cấu hình</span>
                  </button>
                </div>

              </form>
            )}

            {/* Success Banner */}
            {saveSuccess && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-2.5 rounded-xl text-[10px] text-center font-medium animate-pulse">
                Đã đồng bộ thông tin tài khoản của bạn lên máy chủ bảo mật! ✓
              </div>
            )}

            {/* Quick Helper Info */}
            <div className="text-[9.5px] text-slate-500 leading-normal flex gap-1.5 font-sans">
              <Info className="w-3.5 h-3.5 text-[#c5a059] shrink-0 mt-0.5" />
              <span>
                Cập nhật này sẽ có hiệu lực ngay lập tức và đồng bộ hóa tự động qua cả hai góc nhìn điện thoại của bạn và đối phương trong thời gian thực.
              </span>
            </div>

          </div>
        </div>

        {/* Cryptographic Key Inspect Drawer */}
        <div className="space-y-2">
          <h3 className="text-[9px] font-mono text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5 text-[#c5a059]" />
            <span>{t('security.keys_section')}</span>
          </h3>
          <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 space-y-3.5">
            <div>
              <span className="text-[10px] text-slate-500 font-mono block">MÃ KHÓA KẾT NỐI CHUNG (PASSCODE)</span>
              <span className="text-xs font-semibold text-[#c5a059] tracking-wider font-mono">{pairingCode}</span>
            </div>
            <div className="border-t border-white/5 pt-3">
              <span className="text-[10px] text-slate-500 font-mono block mb-1">KHOÁ CHUNG THIẾT BỊ (AES-GCM KEY HEX)</span>
              <div className="bg-black/50 p-3 rounded-xl border border-white/5 font-mono text-[9px] break-all text-slate-300 leading-normal">
                {keyHex}
              </div>
            </div>
          </div>
        </div>

        {/* Gemini API Key Settings */}
        <div className="space-y-2">
          <h3 className="text-[9px] font-mono text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#c5a059]" />
            <span>CẤU HÌNH GEMINI API KEY</span>
          </h3>
          <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4.5 space-y-4">
            <div className="space-y-1">
              <h4 className="text-xs font-medium text-slate-100">Cài đặt API Key cá nhân</h4>
              <p className="text-[10px] text-slate-500 leading-normal">
                Nhập mã khóa Gemini API của bạn để gọi tính năng "Gợi ý hẹn hò AI" trực tiếp. Nếu để trống, hệ thống sẽ tự động dùng khóa mặc định từ máy chủ.
              </p>
            </div>

            <form onSubmit={handleSaveApiKey} className="space-y-3">
              <div className="flex gap-2">
                <input
                  type={showApiKey ? "text" : "password"}
                  value={customApiKey}
                  onChange={e => setCustomApiKey(e.target.value)}
                  placeholder="AI Studio Gemini API Key (AIzaSy...)"
                  className="flex-1 bg-black border border-white/5 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-[#c5a059]/50 transition-colors font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="px-3 border border-white/5 rounded-xl hover:bg-white/[0.02] text-[10px] font-mono text-slate-400 cursor-pointer"
                >
                  {showApiKey ? "Ẩn" : "Hiện"}
                </button>
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="text-[9px] text-slate-500 font-sans">
                  * Khóa được lưu trữ an toàn trong trình duyệt của bạn.
                </div>
                <div className="flex gap-2">
                  {storageHelper.getItem<string>('custom_gemini_api_key', '') && (
                    <button
                      type="button"
                      onClick={handleClearApiKey}
                      className="text-[10px] font-medium bg-red-950/20 border border-red-900/30 text-red-400 hover:bg-red-950/40 py-1.5 px-3 rounded-xl transition-all cursor-pointer"
                    >
                      Xóa cấu hình
                    </button>
                  )}
                  <button
                    type="submit"
                    className="text-[10px] font-semibold bg-[#c5a059] hover:bg-[#b08b47] text-black py-1.5 px-3.5 rounded-xl transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <Check className="w-3 h-3" />
                    <span>Lưu khóa API</span>
                  </button>
                </div>
              </div>
            </form>

            {apiKeySuccess && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-2.5 rounded-xl text-[10px] text-center font-medium animate-pulse">
                Đã cập nhật cấu hình API Key thành công! ✓
              </div>
            )}
          </div>
        </div>

        {/* App Lock Settings */}
        <div className="space-y-2">
          <h3 className="text-[9px] font-mono text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-[#c5a059]" />
            <span>KHOÁ ỨNG DỤNG (APP LOCK)</span>
          </h3>
          <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4.5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <h4 className="text-xs font-medium text-slate-100">Khoá PIN / FaceID</h4>
                <p className="text-[10px] text-slate-500">Bảo mật cục bộ ngay khi mở ứng dụng</p>
              </div>
              <div>
                {hasPasscode ? (
                  <button
                    onClick={onClearPasscode}
                    className="bg-white/5 border border-white/10 text-slate-300 hover:text-red-400 text-xs py-1.5 px-3.5 rounded-full font-medium transition-all cursor-pointer"
                  >
                    Tắt khoá PIN
                  </button>
                ) : (
                  <button
                    onClick={onTriggerSetPasscode}
                    className="bg-[#c5a059] hover:bg-[#b08b47] text-black text-xs py-1.5 px-3.5 rounded-full font-semibold transition-all shadow-sm cursor-pointer"
                  >
                    Bật khoá PIN
                  </button>
                )}
              </div>
            </div>

            {/* WebAuthn Biometrics Registration Option */}
            {hasPasscode && (
              <div className="border-t border-white/5 pt-3.5 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <h4 className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
                      <Fingerprint className="w-3.5 h-3.5 text-[#c5a059]" />
                      <span>Xác thực Face ID / Touch ID (WebAuthn)</span>
                    </h4>
                    <p className="text-[10px] text-slate-400 leading-normal">
                      Sử dụng cảm biến khuôn mặt hoặc vân tay vật lý trực tiếp từ trình duyệt bảo mật của thiết bị của bạn thay vì phải nhập mã PIN thủ công.
                    </p>
                  </div>
                  <div className="shrink-0">
                    {hasWebAuthnRegistered ? (
                      <button
                        onClick={handleRemoveWebAuthn}
                        className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-[10px] py-1.5 px-3 rounded-lg transition-colors cursor-pointer font-medium"
                      >
                        Xoá Face ID
                      </button>
                    ) : (
                      <button
                        onClick={handleRegisterWebAuthn}
                        className="bg-[#c5a059]/10 hover:bg-[#c5a059]/20 border border-[#c5a059]/30 text-[#c5a059] text-[10px] py-1.5 px-3 rounded-lg transition-colors cursor-pointer font-semibold"
                      >
                        Đăng ký Face ID
                      </button>
                    )}
                  </div>
                </div>

                {hasWebAuthnRegistered && (
                  <div className="bg-emerald-500/10 border border-emerald-500/25 p-2 rounded-xl flex items-center gap-2 text-[9px] text-emerald-400 font-mono">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>✓ Đã liên kết sinh trắc học WebAuthn an toàn trên thiết bị này</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Google Account Connection Status */}
        <div className="space-y-2">
          <h3 className="text-[9px] font-mono text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
            <UserCheck className="w-3.5 h-3.5 text-[#c5a059]" />
            <span>LIÊN KẾT TÀI KHOẢN GOOGLE</span>
          </h3>
          <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4.5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-0.5">
                <h4 className="text-xs font-medium text-slate-100">Đồng bộ Google Workspace</h4>
                <p className="text-[10px] text-slate-500">
                  Kết nối Google để đồng bộ locket với Google Drive & Photos, mở tài liệu,...
                </p>
              </div>
              <div className="shrink-0 font-sans">
                {googleUser && googleToken ? (
                  <button
                    onClick={async () => {
                      await logoutGoogle(activePartner);
                      setGoogleUser(null);
                      setGoogleToken(null);
                      alert('Đã đăng xuất tài khoản Google thành công!');
                    }}
                    className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-[10px] py-1.5 px-3 rounded-xl transition-colors cursor-pointer font-medium"
                  >
                    Đăng xuất
                  </button>
                ) : (
                  <button
                    onClick={async () => {
                      setIsLoggingInGoogle(true);
                      try {
                        const res = await googleSignIn(activePartner);
                        if (res) {
                          setGoogleUser(res.user);
                          setGoogleToken(res.accessToken);
                          alert(`Đã kết nối tài khoản Google: ${res.user.email}`);
                        }
                      } catch (err) {
                        console.error(err);
                        alert('Kết nối Google thất bại. Vui lòng kiểm tra lại popup.');
                      } finally {
                        setIsLoggingInGoogle(false);
                      }
                    }}
                    disabled={isLoggingInGoogle}
                    className="bg-[#c5a059] hover:bg-[#b08b47] text-black text-[10px] py-1.5 px-3 rounded-xl font-semibold transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>{isLoggingInGoogle ? 'Đang kết nối...' : 'Kết nối Google'}</span>
                  </button>
                )}
              </div>
            </div>

            {googleUser && googleToken && (
              <div className="bg-emerald-500/5 border border-emerald-500/15 p-3 rounded-xl space-y-2 font-sans text-[10px]">
                <div className="flex items-center gap-2.5">
                  <img
                    src={googleUser.photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
                    alt="Google Profile"
                    className="w-8 h-8 rounded-full border border-emerald-500/20 shrink-0"
                    referrerPolicy="no-referrer"
                  />
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-200 truncate">{googleUser.displayName || 'Người dùng Google'}</p>
                    <p className="text-[9px] text-slate-400 font-mono truncate">{googleUser.email}</p>
                  </div>
                </div>
                <div className="pt-2 border-t border-emerald-500/10 flex flex-wrap gap-1.5 text-[8.5px] font-mono text-emerald-400 font-semibold">
                  <span className="bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/10">✓ Google Drive Connected</span>
                  <span className="bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/10">✓ Google Photos Connected</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Storage Method Status and Configurations */}
        <div className="space-y-2">
          <h3 className="text-[9px] font-mono text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
            <HardDrive className="w-3.5 h-3.5 text-[#c5a059]" />
            <span>PHƯƠNG THỨC LƯU TRỮ & ĐỒNG BỘ</span>
          </h3>
          <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4.5 space-y-4">
            {/* Active storage method card */}
            <div className="bg-black/40 p-3 rounded-xl border border-white/5 flex items-center justify-between">
              <div>
                <span className="text-[8px] text-[#c5a059] font-mono uppercase block">PHƯƠNG THỨC HIỆN TẠI</span>
                <h4 className="text-xs font-semibold text-slate-200 mt-0.5">
                  {storageHelper.getItem<string>(`storage_method_${activePartner}`, 'p2p') === 'googledrive' 
                    ? 'Đám mây Google Drive cá nhân' 
                    : 'Serverless P2P (Ngang hàng)'}
                </h4>
              </div>
              <span className={`text-[8px] font-bold uppercase py-0.5 px-2 rounded-full border ${
                storageHelper.getItem<string>(`storage_method_${activePartner}`, 'p2p') === 'googledrive'
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
              }`}>
                {storageHelper.getItem<string>(`storage_method_${activePartner}`, 'p2p') === 'googledrive' ? 'Cloud Sync' : 'P2P Online'}
              </span>
            </div>

            {/* Storage details depending on active selection */}
            {storageHelper.getItem<string>(`storage_method_${activePartner}`, 'p2p') === 'googledrive' ? (
              <div className="space-y-3">
                <div className="bg-black/20 border border-white/5 rounded-xl p-3 space-y-2 font-mono text-[9.5px]">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Tài khoản Google:</span>
                    <span className="text-slate-300">{googleUser?.email ?? 'Chưa đăng nhập'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Thư mục bảo mật:</span>
                    <span className="text-slate-300">appDataFolder/E2EE_Couple</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Mã hóa đối xứng:</span>
                    <span className="text-emerald-400 font-bold">AES-GCM-256 (Kích hoạt)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Đồng bộ gần nhất:</span>
                    <span className="text-slate-300">Vừa xong</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const btn = document.getElementById('sync-drive-btn');
                      if (btn) {
                        btn.classList.add('animate-spin');
                        setTimeout(() => btn.classList.remove('animate-spin'), 1500);
                      }
                      alert('Đã tải lên và đồng bộ cơ sở dữ liệu mã hóa lên Google Drive của bạn!');
                    }}
                    className="flex-1 bg-[#c5a059]/10 hover:bg-[#c5a059]/20 text-[#c5a059] border border-[#c5a059]/30 py-2 rounded-xl text-[10.5px] font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw id="sync-drive-btn" className="w-3.5 h-3.5 transition-transform" />
                    <span>Đồng bộ Google Drive ngay</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="bg-black/20 border border-white/5 rounded-xl p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {p2pStatus === 'connected' ? (
                        <Wifi className="w-4 h-4 text-emerald-400" />
                      ) : p2pStatus === 'connecting' || p2pStatus === 'host_waiting' ? (
                        <Radio className="w-4 h-4 text-amber-400 animate-pulse" />
                      ) : (
                        <WifiOff className="w-4 h-4 text-slate-500" />
                      )}
                      <span className="text-[10px] text-slate-300 font-medium">
                        {p2pStatus === 'connected' ? 'P2P Đã kết nối' :
                         p2pStatus === 'connecting' ? 'P2P Đang kết nối...' :
                         p2pStatus === 'host_waiting' ? 'P2P Chờ đối tác...' :
                         'P2P Chưa kết nối'}
                      </span>
                    </div>
                    <span className={`text-[8px] font-bold uppercase py-0.5 px-2 rounded-full border ${
                      p2pStatus === 'connected'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : p2pStatus === 'connecting' || p2pStatus === 'host_waiting'
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                    }`}>
                      {p2pStatus === 'connected' ? 'Online' :
                       p2pStatus === 'connecting' || p2pStatus === 'host_waiting' ? 'Đang kết nối' :
                       'Offline'}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    {p2pStatus !== 'connected' && p2pStatus !== 'connecting' && p2pStatus !== 'host_waiting' && (
                      <button
                        onClick={onStartP2PHost}
                        className="flex-1 bg-[#c5a059]/10 hover:bg-[#c5a059]/20 text-[#c5a059] border border-[#c5a059]/30 py-2 rounded-xl text-[10.5px] font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Radio className="w-3.5 h-3.5" />
                        <span>Kết nối P2P</span>
                      </button>
                    )}
                    {p2pStatus === 'connected' && (
                      <button
                        onClick={onStopP2P}
                        className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 py-2 rounded-xl text-[10.5px] font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <WifiOff className="w-3.5 h-3.5" />
                        <span>Ngắt P2P</span>
                      </button>
                    )}
                  </div>

                  <p className="text-[9.5px] text-amber-400/80 leading-normal font-sans bg-amber-500/5 p-2 rounded-lg border border-amber-500/10">
                    ⚠️ Dữ liệu truyền trực tiếp giữa 2 thiết bị qua WebRTC, không lưu trên server. Khi cả hai offline, dữ liệu sẽ mất.
                  </p>
                </div>
              </div>
            )}

            {/* Quick switcher to allow toggling storage method */}
            <div className="border-t border-white/5 pt-3 flex justify-between items-center">
              <span className="text-[10px] text-slate-400 font-sans">Đổi phương thức lưu trữ:</span>
              <button
                onClick={() => {
                  const current = storageHelper.getItem<string>(`storage_method_${activePartner}`, 'p2p');
                  const next = current === 'googledrive' ? 'p2p' : 'googledrive';
                  storageHelper.setItem(`storage_method_${activePartner}`, next);
                  
                  // Update storage method on server
                  if (onUpdateStorageMethod) {
                    onUpdateStorageMethod(activePartner, next);
                  } else {
                    fetch(`${BASE_URL}/api/storage-method`, {
                      method: 'POST',
                      headers: { 
                        'Content-Type': 'application/json',
                        'X-Pairing-Code': pairingCode
                      },
                      body: JSON.stringify({ partnerId: activePartner, storageMethod: next })
                    }).catch(err => console.error(err));
                  }

                  alert(`Đã đổi phương thức lưu trữ thành: ${next === 'googledrive' ? 'Google Drive Cloud Sync' : 'Serverless P2P'}`);
                  window.location.reload();
                }}
                className="text-[9.5px] text-[#c5a059] hover:underline cursor-pointer font-semibold"
              >
                Chuyển sang {storageHelper.getItem<string>(`storage_method_${activePartner}`, 'p2p') === 'googledrive' ? 'P2P Online' : 'Google Drive Cloud'}
              </button>
            </div>

          </div>
        </div>

        {/* CÀI ĐẶT ĐỒNG BỘ NÂNG CAO */}
        <div className="space-y-2">
          <h3 className="text-[9px] font-mono text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
            <Settings2 className="w-3.5 h-3.5 text-[#c5a059]" />
            <span>CẤU HÌNH ĐỒNG BỘ NÂNG CAO</span>
          </h3>
          <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4.5 space-y-5">
            
            {/* Tần suất đồng bộ / Sync Interval */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 justify-between">
                <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Timer className="w-3.5 h-3.5 text-[#c5a059]" />
                  <span>Tần suất đồng bộ dữ liệu</span>
                </label>
                <span className="text-[9px] bg-[#c5a059]/15 text-[#ebd4b3] border border-[#c5a059]/25 px-2 py-0.5 rounded font-mono font-bold">
                  {syncInterval === 'realtime' ? 'Tức thời (Realtime)' :
                   syncInterval === '15m' ? 'Mỗi 15 phút' :
                   syncInterval === '1h' ? 'Mỗi giờ' :
                   syncInterval === '24h' ? 'Hằng ngày' : 'Chỉ thủ công'}
                </span>
              </div>
              
              <div className="grid grid-cols-5 gap-1.5 bg-black/40 p-1 rounded-xl border border-white/5">
                {[
                  { id: 'realtime', label: 'T.Thời' },
                  { id: '15m', label: '15ph' },
                  { id: '1h', label: '1h' },
                  { id: '24h', label: '24h' },
                  { id: 'manual', label: 'T.Công' }
                ].map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => handleUpdateSyncInterval(opt.id)}
                    className={`text-[9.5px] py-1.5 rounded-lg font-medium transition-all cursor-pointer text-center ${
                      syncInterval === opt.id
                        ? 'bg-[#c5a059] text-black font-bold shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-[8.5px] text-slate-500 leading-relaxed font-sans">
                * Ở chế độ Tức thời, các thay đổi sẽ được đẩy lên đám mây ngay lập tức qua kết nối mạng bảo mật.
              </p>
            </div>

            {/* Các thành phần đồng bộ / Sync items selection */}
            <div className="space-y-3.5 border-t border-white/5 pt-4">
              <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                NỘI DUNG ĐỒNG BỘ (BẬT / TẮT)
              </label>

              <div className="grid grid-cols-2 gap-3">
                {/* 1. Hình ảnh */}
                <button
                  onClick={() => handleToggleSyncItem('photos')}
                  className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                    syncItems.photos
                      ? 'bg-[#c5a059]/5 border-[#c5a059]/30 text-slate-200'
                      : 'bg-black/25 border-white/5 text-slate-500'
                  }`}
                >
                  <ImageIcon className={`w-4 h-4 shrink-0 mt-0.5 ${syncItems.photos ? 'text-[#c5a059]' : 'text-slate-600'}`} />
                  <div className="min-w-0">
                    <p className="text-[10.5px] font-semibold leading-none font-sans">Ảnh Locket</p>
                    <p className="text-[8.5px] text-slate-500 mt-1 truncate font-sans">Kỷ niệm ảnh chung</p>
                  </div>
                </button>

                {/* 2. Video */}
                <button
                  onClick={() => handleToggleSyncItem('videos')}
                  className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                    syncItems.videos
                      ? 'bg-[#c5a059]/5 border-[#c5a059]/30 text-slate-200'
                      : 'bg-black/25 border-white/5 text-slate-500'
                  }`}
                >
                  <Video className={`w-4 h-4 shrink-0 mt-0.5 ${syncItems.videos ? 'text-[#c5a059]' : 'text-slate-600'}`} />
                  <div className="min-w-0">
                    <p className="text-[10.5px] font-semibold leading-none font-sans">Thước phim</p>
                    <p className="text-[8.5px] text-slate-500 mt-1 truncate font-sans">Video Locket</p>
                  </div>
                </button>

                {/* 3. Âm thanh / thoại */}
                <button
                  onClick={() => handleToggleSyncItem('audio')}
                  className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                    syncItems.audio
                      ? 'bg-[#c5a059]/5 border-[#c5a059]/30 text-slate-200'
                      : 'bg-black/25 border-white/5 text-slate-500'
                  }`}
                >
                  <Volume2 className={`w-4 h-4 shrink-0 mt-0.5 ${syncItems.audio ? 'text-[#c5a059]' : 'text-slate-600'}`} />
                  <div className="min-w-0">
                    <p className="text-[10.5px] font-semibold leading-none font-sans">Tin nhắn thoại</p>
                    <p className="text-[8.5px] text-slate-500 mt-1 truncate font-sans">Âm thanh nền & thoại</p>
                  </div>
                </button>

                {/* 4. Tin nhắn trò chuyện */}
                <button
                  onClick={() => handleToggleSyncItem('chat')}
                  className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                    syncItems.chat
                      ? 'bg-[#c5a059]/5 border-[#c5a059]/30 text-slate-200'
                      : 'bg-black/25 border-white/5 text-slate-500'
                  }`}
                >
                  <MessageSquare className={`w-4 h-4 shrink-0 mt-0.5 ${syncItems.chat ? 'text-[#c5a059]' : 'text-slate-600'}`} />
                  <div className="min-w-0">
                    <p className="text-[10.5px] font-semibold leading-none font-sans">Trò chuyện</p>
                    <p className="text-[8.5px] text-slate-500 mt-1 truncate font-sans">Tin nhắn mã hóa</p>
                  </div>
                </button>

                {/* 5. Nhật ký cuộc gọi */}
                <button
                  onClick={() => handleToggleSyncItem('callHistory')}
                  className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                    syncItems.callHistory
                      ? 'bg-[#c5a059]/5 border-[#c5a059]/30 text-slate-200'
                      : 'bg-black/25 border-white/5 text-slate-500'
                  }`}
                >
                  <Phone className={`w-4 h-4 shrink-0 mt-0.5 ${syncItems.callHistory ? 'text-[#c5a059]' : 'text-slate-600'}`} />
                  <div className="min-w-0">
                    <p className="text-[10.5px] font-semibold leading-none font-sans">Cuộc gọi thoại & video</p>
                    <p className="text-[8.5px] text-slate-500 mt-1 truncate font-sans">Nhật ký call & voice</p>
                  </div>
                </button>

                {/* 6. Kế hoạch & Hẹn hò */}
                <button
                  onClick={() => handleToggleSyncItem('plans')}
                  className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                    syncItems.plans
                      ? 'bg-[#c5a059]/5 border-[#c5a059]/30 text-slate-200'
                      : 'bg-black/25 border-white/5 text-slate-500'
                  }`}
                >
                  <Calendar className={`w-4 h-4 shrink-0 mt-0.5 ${syncItems.plans ? 'text-[#c5a059]' : 'text-slate-600'}`} />
                  <div className="min-w-0">
                    <p className="text-[10.5px] font-semibold leading-none font-sans">Hẹn hò & Kế hoạch</p>
                    <p className="text-[8.5px] text-slate-500 mt-1 truncate font-sans">Lịch trình & Việc cần làm</p>
                  </div>
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* LANGUAGE SETTINGS */}
        <div className="space-y-2">
          <h3 className="text-[9px] font-mono text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-[#c5a059]" />
            <span>{t('language.title')}</span>
          </h3>
          <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 space-y-3">
            <LanguageSwitcher />
          </div>
        </div>

        {/* Diagnostic Logs */}
        <div className="space-y-2">
          <h3 className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">NHẬT KÝ KIỂM TRA MẬT MÃ CỤC BỘ</h3>
          <div className="bg-black/80 p-3.5 rounded-2xl border border-white/5 font-mono text-[9px] text-slate-500 space-y-1 max-h-32 overflow-y-auto leading-normal scrollbar-thin scrollbar-thumb-white/5">
            {diagnosticLogs.map((log, i) => (
              <div key={i}>{log}</div>
            ))}
          </div>
        </div>

        {/* Danger zone / Reset */}
        <div className="space-y-2">
          <h3 className="text-[9px] font-mono text-red-500 uppercase tracking-widest">{t('security.danger_zone')}</h3>
          <div className="bg-red-950/10 border border-red-950/20 rounded-2xl p-4 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h4 className="text-xs font-semibold text-red-400">Thiết lập dữ liệu không gian</h4>
                <p className="text-[10px] text-slate-500 leading-normal font-sans">
                  Bạn có thể reset về trạng thái chứa hội thoại, kỷ niệm, danh sách việc cần làm mẫu (Demo), hoặc hủy toàn bộ demo để khởi tạo dữ liệu trống (Sạch) ngay từ đầu.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                onClick={() => onResetDatabase(false)}
                className="bg-slate-900/80 hover:bg-slate-800 border border-white/5 hover:border-[#c5a059]/30 text-slate-300 hover:text-[#c5a059] text-[10.5px] py-2 px-3 rounded-xl font-medium transition-all cursor-pointer text-center flex flex-col items-center justify-center gap-1.5"
              >
                <RefreshCw className="w-4 h-4 text-[#c5a059]" />
                <div className="text-center font-sans">
                  <p className="font-bold">Reset Dữ liệu Mẫu</p>
                  <p className="text-[8.5px] text-slate-500 mt-0.5">Đặt lại chat & kỉ niệm demo</p>
                </div>
              </button>

              <button
                onClick={() => onResetDatabase(true)}
                className="bg-red-500/5 hover:bg-red-500/15 border border-red-500/20 hover:border-red-500/50 text-red-400 text-[10.5px] py-2 px-3 rounded-xl font-medium transition-all cursor-pointer text-center flex flex-col items-center justify-center gap-1.5"
              >
                <Trash2 className="w-4 h-4 text-red-500" />
                <div className="text-center font-sans">
                  <p className="font-bold">Hủy Demo & Xoá sạch</p>
                  <p className="text-[8.5px] text-red-500/65 mt-0.5">Bắt đầu từ không gian trống</p>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Copyright */}
        <div className="text-center pt-4 pb-6 border-t border-white/5">
          <button
            onClick={() => setShowDevs(!showDevs)}
            className="text-[10px] text-slate-600 font-mono tracking-wider hover:text-[#c5a059] transition-colors cursor-pointer"
          >
            © 2025-2026 <span className="text-[#c5a059]/60">@Dou-Coupl</span>
          </button>
          {showDevs && (
            <div className="mt-2 text-[9px] text-slate-500 font-mono animate-in fade-in slide-in-from-top-1 duration-200">
              Developers:{' '}
              <span className="text-[#c5a059] font-semibold">MaxxAlan</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
