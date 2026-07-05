import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  User, 
  Lock, 
  HardDrive, 
  Heart, 
  Sparkles, 
  CheckCircle, 
  ChevronRight, 
  Fingerprint, 
  Globe, 
  RefreshCw, 
  Cloud, 
  Key,
  Shield,
  HelpCircle,
  AlertCircle
} from 'lucide-react';

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

interface OnboardingProps {
  partnerId: 'A' | 'B';
  onComplete: (data: {
    nickname: string;
    avatar: string;
    passcode: string;
    storageMethod: 'p2p' | 'googledrive';
    pairingCode: string;
  }) => void;
}

export default function Onboarding({ partnerId, onComplete }: OnboardingProps) {
  const [step, setStep] = useState<number>(0);
  
  // Step 0: Nickname & Avatar
  const [nickname, setNickname] = useState<string>('');
  const [selectedAvatar, setSelectedAvatar] = useState<string>(PRESET_AVATARS[partnerId === 'A' ? 0 : 4]);
  const [customAvatar, setCustomAvatar] = useState<string>('');

  // Step 1: Security PIN
  const [pin, setPin] = useState<string>('');
  const [confirmPin, setConfirmPin] = useState<string>('');
  const [pinError, setPinError] = useState<string | null>(null);

  // Step 2: Storage Method
  const [storageMethod, setStorageMethod] = useState<'p2p' | 'googledrive'>('p2p');
  const [isDriveModalOpen, setIsDriveModalOpen] = useState<boolean>(false);
  const [isDriveConnecting, setIsDriveConnecting] = useState<boolean>(false);
  const [driveEmail, setDriveEmail] = useState<string>('');
  const [driveConnected, setDriveConnected] = useState<boolean>(false);

  // Step 3: 12-char Pairing Code
  const [inputPairingCode, setInputPairingCode] = useState<string>('');
  const [pairingStatus, setPairingStatus] = useState<'idle' | 'linking' | 'syncing' | 'success' | 'error'>('idle');
  const [pairingMessage, setPairingMessage] = useState<string>('');

  // Auto-generate pairing code
  const generatePairingCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'LOVE-';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    code += '-';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setInputPairingCode(code); // e.g. LOVE-8FA2-D34E -> exactly 12 characters counting the dashes
  };

  // Google Drive Simulation Connection
  const handleConnectDrive = () => {
    if (!driveEmail.includes('@')) {
      alert('Vui lòng nhập địa chỉ email Google hợp lệ.');
      return;
    }
    setIsDriveConnecting(true);
    setTimeout(() => {
      setIsDriveConnecting(false);
      setDriveConnected(true);
      setIsDriveModalOpen(false);
    }, 2000);
  };

  // Validate Pairing Code and complete setup
  const handleStartPairing = () => {
    // Clean string (e.g. remove spaces, uppercase)
    const cleaned = inputPairingCode.trim().toUpperCase();
    if (cleaned.length !== 14 && cleaned.length !== 12) {
      setPairingMessage('Mã ghép đôi phải đúng định dạng 12 ký tự (Ví dụ: LOVE-A1B2-C3D4 hoặc 12 ký tự liên tục).');
      setPairingStatus('error');
      return;
    }

    setPairingStatus('linking');
    setPairingMessage('Đang tìm kiếm thiết bị của đối tác trên mạng truyền dẫn...');

    // Simulate multi-step cryptographic handshake
    setTimeout(() => {
      setPairingStatus('syncing');
      setPairingMessage('Đã tìm thấy nửa kia! Đang trao đổi khóa công khai & khởi tạo đường truyền E2EE...');
      
      setTimeout(() => {
        setPairingStatus('success');
        setPairingMessage('Thiết lập kênh bảo mật thành công! Chào mừng hai bạn đến với Không gian riêng.');
        
        setTimeout(() => {
          onComplete({
            nickname: nickname.trim(),
            avatar: customAvatar.trim() || selectedAvatar,
            passcode: pin,
            storageMethod,
            pairingCode: cleaned
          });
        }, 1500);
      }, 2000);
    }, 2000);
  };

  const nextStep = () => {
    if (step === 0) {
      if (!nickname.trim()) {
        alert('Vui lòng nhập biệt danh của bạn.');
        return;
      }
      setStep(1);
    } else if (step === 1) {
      if (pin.length !== 4) {
        setPinError('Mã PIN bảo mật phải gồm đúng 4 chữ số.');
        return;
      }
      if (pin !== confirmPin) {
        setPinError('Mã xác nhận PIN không khớp.');
        return;
      }
      setPinError(null);
      setStep(2);
    } else if (step === 2) {
      if (storageMethod === 'googledrive' && !driveConnected) {
        alert('Bạn đã chọn lưu trữ Google Drive, vui lòng hoàn tất liên kết tài khoản Google.');
        return;
      }
      setStep(3);
    }
  };

  return (
    <div id={`onboarding-container-${partnerId}`} className="h-full bg-[#080808] text-slate-100 flex flex-col justify-between overflow-hidden relative font-sans">
      
      {/* Top Progress Header */}
      <div className="px-5 pt-6 pb-2 shrink-0 border-b border-white/5 bg-[#0a0a0a]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <Heart className="w-4.5 h-4.5 text-[#c5a059] fill-[#c5a059]/20" />
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
              Khởi tạo không gian riêng
            </span>
          </div>
          <span className="text-[10px] text-[#c5a059] font-mono font-medium bg-[#c5a059]/10 py-0.5 px-2 rounded-full border border-[#c5a059]/20">
            Bước {step + 1} / 4
          </span>
        </div>
        
        {/* Progress Bar */}
        <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
          <motion.div 
            className="h-full bg-[#c5a059]"
            initial={{ width: '25%' }}
            animate={{ width: `${(step + 1) * 25}%` }}
            transition={{ ease: 'easeInOut' }}
          />
        </div>
      </div>

      {/* Main Form Area */}
      <div className="flex-1 overflow-y-auto px-5 py-6">
        <AnimatePresence mode="wait">
          
          {/* STEP 0: NICKNAME & AVATAR */}
          {step === 0 && (
            <motion.div
              key="step-nickname"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-5"
            >
              <div className="text-center space-y-1.5">
                <div className="w-12 h-12 rounded-full bg-[#c5a059]/10 border border-[#c5a059]/20 flex items-center justify-center mx-auto text-[#c5a059]">
                  <User className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-semibold text-slate-200">Đặt biệt danh của bạn</h3>
                <p className="text-[10.5px] text-slate-400 max-w-xs mx-auto">
                  Biệt danh này sẽ hiển thị trên thiết bị của đối phương khi gửi tin nhắn, ảnh locket và kế hoạch.
                </p>
              </div>

              {/* Name input */}
              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-[#c5a059] uppercase tracking-wider block">
                  Biệt danh của bạn
                </label>
                <input
                  type="text"
                  placeholder={partnerId === 'A' ? 'Ví dụ: Minh (Anh)' : 'Ví dụ: Linh (Em)'}
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-[#c5a059]/50 focus:bg-white/[0.05] transition-all"
                />
              </div>

              {/* Avatar choosing */}
              <div className="space-y-2.5">
                <label className="text-[11px] font-semibold text-[#c5a059] uppercase tracking-wider block">
                  Chọn ảnh đại diện
                </label>
                
                <div className="grid grid-cols-4 gap-2">
                  {PRESET_AVATARS.map((url, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setSelectedAvatar(url);
                        setCustomAvatar('');
                      }}
                      className={`relative aspect-square rounded-xl overflow-hidden border-2 cursor-pointer transition-all ${
                        selectedAvatar === url && !customAvatar
                          ? 'border-[#c5a059] scale-95 shadow-[0_0_10px_rgba(197,160,89,0.3)]'
                          : 'border-transparent hover:scale-102 opacity-70 hover:opacity-100'
                      }`}
                    >
                      <img src={url} alt={`Preset ${idx}`} className="w-full h-full object-cover" />
                      {selectedAvatar === url && !customAvatar && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white">
                          <CheckCircle className="w-4 h-4 text-[#c5a059]" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>

                <div className="pt-1.5">
                  <span className="text-[9px] text-slate-500 block mb-1">Hoặc sử dụng URL ảnh của riêng bạn:</span>
                  <input
                    type="url"
                    placeholder="https://example.com/avatar.jpg"
                    value={customAvatar}
                    onChange={(e) => {
                      setCustomAvatar(e.target.value);
                    }}
                    className="w-full bg-white/[0.02] border border-white/5 rounded-xl px-3 py-2 text-[11px] text-slate-300 placeholder-slate-600 focus:outline-none focus:border-[#c5a059]/30 transition-all font-mono"
                  />
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 1: SECURITY PIN */}
          {step === 1 && (
            <motion.div
              key="step-pin"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-5"
            >
              <div className="text-center space-y-1.5">
                <div className="w-12 h-12 rounded-full bg-[#c5a059]/10 border border-[#c5a059]/20 flex items-center justify-center mx-auto text-[#c5a059]">
                  <Lock className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-semibold text-slate-200">Đặt mật mã khóa PIN</h3>
                <p className="text-[10.5px] text-slate-400 max-w-xs mx-auto">
                  Khóa PIN giúp ngăn chặn người lạ tò mò mở ứng dụng trên thiết bị của bạn. Chỉ 4 số bảo mật để đăng nhập nhanh chóng.
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[11px] font-semibold text-[#c5a059] uppercase tracking-wider block">
                    Mã PIN bảo mật (4 số)
                  </label>
                  <input
                    type="password"
                    maxLength={4}
                    pattern="[0-9]*"
                    inputMode="numeric"
                    placeholder="• • • •"
                    value={pin}
                    onChange={(e) => {
                      const cleanVal = e.target.value.replace(/[^0-9]/g, '');
                      setPin(cleanVal);
                    }}
                    className="w-full bg-white/[0.03] border border-white/10 rounded-xl py-3 text-center text-lg tracking-[1.5em] text-[#c5a059] placeholder-slate-600 focus:outline-none focus:border-[#c5a059]/50 focus:bg-white/[0.05] transition-all font-mono font-bold"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Xác nhận mã PIN
                  </label>
                  <input
                    type="password"
                    maxLength={4}
                    pattern="[0-9]*"
                    inputMode="numeric"
                    placeholder="• • • •"
                    value={confirmPin}
                    onChange={(e) => {
                      const cleanVal = e.target.value.replace(/[^0-9]/g, '');
                      setConfirmPin(cleanVal);
                    }}
                    className="w-full bg-white/[0.03] border border-white/10 rounded-xl py-3 text-center text-lg tracking-[1.5em] text-[#c5a059] placeholder-slate-600 focus:outline-none focus:border-[#c5a059]/30 focus:bg-white/[0.04] transition-all font-mono font-bold"
                  />
                </div>

                {pinError && (
                  <div className="bg-red-500/10 border border-red-500/25 p-2.5 rounded-xl flex items-center gap-2 text-[10px] text-red-400 font-medium">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{pinError}</span>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* STEP 2: STORAGE METHOD */}
          {step === 2 && (
            <motion.div
              key="step-storage"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <div className="text-center space-y-1.5">
                <div className="w-12 h-12 rounded-full bg-[#c5a059]/10 border border-[#c5a059]/20 flex items-center justify-center mx-auto text-[#c5a059]">
                  <HardDrive className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-semibold text-slate-200">Chọn phương thức lưu trữ</h3>
                <p className="text-[10.5px] text-slate-400 max-w-xs mx-auto">
                  Xác định cách thức lưu trữ dữ liệu của cặp đôi. Hãy chọn phương thức phù hợp với độ riêng tư bạn mong muốn.
                </p>
              </div>

              <div className="space-y-3.5 pt-2">
                
                {/* Method 1: Serverless P2P Card */}
                <button
                  onClick={() => setStorageMethod('p2p')}
                  className={`w-full text-left p-4 rounded-2xl border transition-all cursor-pointer relative flex gap-3.5 ${
                    storageMethod === 'p2p'
                      ? 'bg-[#c5a059]/5 border-[#c5a059] shadow-[0_4px_20px_rgba(197,160,89,0.05)]'
                      : 'bg-white/[0.02] border-white/5 hover:border-white/10 hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="shrink-0 pt-0.5">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
                      storageMethod === 'p2p' ? 'bg-[#c5a059]/20 text-[#c5a059]' : 'bg-white/5 text-slate-400'
                    }`}>
                      <Globe className="w-4.5 h-4.5" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-xs font-semibold text-slate-200">Serverless P2P (Ngang Hàng)</h4>
                      <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[8px] px-1.5 py-0.5 rounded-full font-bold">
                        Bảo mật tuyệt đối
                      </span>
                    </div>
                    <p className="text-[9.5px] text-slate-400 leading-normal">
                      Dữ liệu mã hóa đầu cuối chỉ chia sẻ trực tiếp giữa hai bạn khi cả hai cùng Online. Máy chủ không lưu trữ bất kỳ thông tin nào. Khi cả hai Offline, dữ liệu sẽ tự động biến mất khỏi máy chủ.
                    </p>
                  </div>
                </button>

                {/* Method 2: Google Drive Card */}
                <div className="space-y-2">
                  <button
                    onClick={() => setStorageMethod('googledrive')}
                    className={`w-full text-left p-4 rounded-2xl border transition-all cursor-pointer relative flex gap-3.5 ${
                      storageMethod === 'googledrive'
                        ? 'bg-[#c5a059]/5 border-[#c5a059] shadow-[0_4px_20px_rgba(197,160,89,0.05)]'
                        : 'bg-white/[0.02] border-white/5 hover:border-white/10 hover:bg-white/[0.03]'
                    }`}
                  >
                    <div className="shrink-0 pt-0.5">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
                        storageMethod === 'googledrive' ? 'bg-[#c5a059]/20 text-[#c5a059]' : 'bg-white/5 text-slate-400'
                      }`}>
                        <Cloud className="w-4.5 h-4.5" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-xs font-semibold text-slate-200">Đồng bộ Google Drive</h4>
                        <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[8px] px-1.5 py-0.5 rounded-full font-bold">
                          Đám mây cá nhân
                        </span>
                      </div>
                      <p className="text-[9.5px] text-slate-400 leading-normal">
                        Dữ liệu được mã hóa và sao lưu vĩnh viễn trên thư mục ứng dụng Google Drive cá nhân của chính hai bạn. An toàn, lâu dài và tự động khôi phục.
                      </p>
                    </div>
                  </button>

                  {storageMethod === 'googledrive' && (
                    <motion.div 
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white/[0.02] border border-white/5 p-3 rounded-xl flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping shrink-0" />
                        <span className="text-[10px] text-slate-400 font-medium">
                          {driveConnected ? `✓ Đã kết nối: ${driveEmail}` : 'Yêu cầu liên kết tài khoản Google Drive'}
                        </span>
                      </div>
                      {!driveConnected ? (
                        <button
                          onClick={() => setIsDriveModalOpen(true)}
                          className="bg-white/5 hover:bg-white/10 text-[10px] text-[#c5a059] font-semibold py-1 px-3 rounded-lg border border-[#c5a059]/30 cursor-pointer"
                        >
                          Liên kết ngay
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setDriveConnected(false);
                            setDriveEmail('');
                          }}
                          className="text-[9px] text-red-400 underline cursor-pointer"
                        >
                          Huỷ liên kết
                        </button>
                      )}
                    </motion.div>
                  )}
                </div>

              </div>
            </motion.div>
          )}

          {/* STEP 3: 12-CHARACTER PAIRING */}
          {step === 3 && (
            <motion.div
              key="step-pairing"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <div className="text-center space-y-1.5">
                <div className="w-12 h-12 rounded-full bg-[#c5a059]/10 border border-[#c5a059]/20 flex items-center justify-center mx-auto text-[#c5a059]">
                  <Key className="w-6 h-6 animate-pulse" />
                </div>
                <h3 className="text-sm font-semibold text-slate-200">Ghép đôi qua mã bảo mật 12 ký tự</h3>
                <p className="text-[10.5px] text-slate-400 max-w-xs mx-auto">
                  Để thiết lập kênh truyền tin mật mã hóa đối xứng E2EE, cả hai người cần nhập chung **12 ký tự ghép đôi**.
                </p>
              </div>

              {pairingStatus !== 'idle' ? (
                <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-6 text-center space-y-4 flex flex-col items-center">
                  {pairingStatus === 'linking' && (
                    <div className="relative w-16 h-16">
                      <motion.div 
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                        className="w-full h-full rounded-full border-4 border-dashed border-[#c5a059]/50"
                      />
                      <Globe className="w-6 h-6 text-[#c5a059] absolute inset-0 m-auto animate-pulse" />
                    </div>
                  )}
                  
                  {pairingStatus === 'syncing' && (
                    <div className="relative w-16 h-16 flex items-center justify-center">
                      <div className="absolute inset-0 bg-[#c5a059]/10 rounded-full animate-ping" />
                      <Key className="w-7 h-7 text-[#c5a059] animate-bounce" />
                    </div>
                  )}

                  {pairingStatus === 'success' && (
                    <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                      <CheckCircle className="w-8 h-8 animate-scale-up" />
                    </div>
                  )}

                  {pairingStatus === 'error' && (
                    <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400">
                      <AlertCircle className="w-8 h-8" />
                    </div>
                  )}

                  <div className="space-y-1 max-w-xs">
                    <p className="text-xs font-semibold text-slate-200">
                      {pairingStatus === 'linking' && 'Đang bắt tay kết nối...'}
                      {pairingStatus === 'syncing' && 'Đang đồng bộ mật mã...'}
                      {pairingStatus === 'success' && 'Kết nối thành công!'}
                      {pairingStatus === 'error' && 'Không thể ghép đôi'}
                    </p>
                    <p className="text-[10px] text-slate-400 leading-normal">
                      {pairingMessage}
                    </p>
                  </div>

                  {pairingStatus === 'error' && (
                    <button
                      onClick={() => setPairingStatus('idle')}
                      className="bg-white/5 border border-white/10 hover:bg-white/10 text-xs py-1.5 px-4 rounded-xl text-slate-200 transition-all cursor-pointer"
                    >
                      Thử lại
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-white/[0.02] border border-white/5 p-4 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-medium">Bạn chưa có mã ghép đôi?</span>
                      <button
                        onClick={generatePairingCode}
                        className="bg-[#c5a059]/10 hover:bg-[#c5a059]/20 text-[#c5a059] font-bold text-[10px] py-1 px-3 border border-[#c5a059]/30 rounded-lg cursor-pointer flex items-center gap-1 transition-colors"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>Tạo mã mới</span>
                      </button>
                    </div>

                    <div className="relative">
                      <input
                        type="text"
                        placeholder="LOVE-XXXX-XXXX (12 kí tự)"
                        value={inputPairingCode}
                        onChange={(e) => {
                          const val = e.target.value.toUpperCase();
                          setInputPairingCode(val);
                        }}
                        className="w-full bg-white/[0.03] border border-white/10 rounded-xl py-3 text-center text-md tracking-[0.1em] text-[#c5a059] placeholder-slate-600 focus:outline-none focus:border-[#c5a059]/50 focus:bg-white/[0.05] transition-all font-mono font-bold"
                      />
                    </div>

                    <p className="text-[9px] text-slate-500 leading-normal text-center">
                      *Mã này đóng vai trò là "Salt" mã hóa đầu cuối. Hãy chắc chắn đối tác của bạn cũng nhập chính xác mã này.
                    </p>
                  </div>

                  <button
                    onClick={handleStartPairing}
                    className="w-full bg-[#c5a059] hover:bg-[#b08b47] text-black font-semibold text-xs py-3 rounded-xl transition-all shadow-[0_4px_15px_rgba(197,160,89,0.15)] flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
                  >
                    <span>Kiểm tra & Kết nối đôi</span>
                    <Heart className="w-3.5 h-3.5 fill-black" />
                  </button>
                </div>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* Bottom Button Panel */}
      <div className="px-5 pb-6 pt-3 shrink-0 border-t border-white/5 bg-[#0a0a0a]/90 flex items-center justify-between gap-4">
        {step > 0 && pairingStatus === 'idle' ? (
          <button
            onClick={() => setStep(prev => prev - 1)}
            className="text-xs text-slate-400 hover:text-slate-200 transition-colors font-medium py-2 px-3 cursor-pointer"
          >
            Quay lại
          </button>
        ) : (
          <div />
        )}

        {step < 3 && (
          <button
            onClick={nextStep}
            className="bg-white/5 hover:bg-white/10 border border-white/10 hover:border-[#c5a059]/30 text-[#c5a059] font-bold text-xs py-2 px-5 rounded-xl transition-all flex items-center gap-1 cursor-pointer"
          >
            <span>Tiếp theo</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Google Drive Mock Connection Modal */}
      {isDriveModalOpen && (
        <div className="absolute inset-0 bg-black/85 z-50 flex items-center justify-center p-5">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-zinc-900 border border-white/10 rounded-2xl p-5 w-full max-w-xs space-y-4"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#c5a059]/10 flex items-center justify-center text-[#c5a059]">
                <Cloud className="w-4.5 h-4.5" />
              </div>
              <h4 className="text-xs font-semibold text-slate-100">Liên kết Google Drive</h4>
            </div>

            <p className="text-[10px] text-slate-400 leading-normal">
              Đăng nhập tài khoản Google để ứng dụng tạo một tệp tin cấu hình bảo mật ẩn trong thư mục an toàn của bạn.
            </p>

            <div className="space-y-3 pt-1">
              <div className="space-y-1">
                <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Email Google</label>
                <input
                  type="email"
                  placeholder="partner@gmail.com"
                  value={driveEmail}
                  onChange={(e) => setDriveEmail(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-[11px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-[#c5a059]/40"
                />
              </div>

              {isDriveConnecting ? (
                <div className="flex items-center justify-center gap-2 text-[10px] text-slate-400 py-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#c5a059]" />
                  <span>Đang cấp quyền OAuth an toàn...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={() => setIsDriveModalOpen(false)}
                    className="flex-1 bg-white/5 hover:bg-white/10 text-slate-400 text-[10px] py-2 rounded-lg cursor-pointer"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    onClick={handleConnectDrive}
                    className="flex-1 bg-[#c5a059] text-black font-semibold text-[10px] py-2 rounded-lg cursor-pointer hover:bg-[#b08b47]"
                  >
                    Đăng nhập
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}

    </div>
  );
}
