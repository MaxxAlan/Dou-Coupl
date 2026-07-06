import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Heart, 
  Calendar, 
  Sparkles, 
  AlertCircle, 
  Edit2, 
  Check, 
  Hourglass, 
  Loader2, 
  RefreshCw, 
  Plus, 
  Trash2, 
  Image as ImageIcon, 
  Bell, 
  Upload, 
  X, 
  MessageSquare,
  ChevronRight,
  ArrowRight,
  Info,
  CalendarCheck2,
  Camera,
  HardDrive
} from 'lucide-react';
import { storageHelper } from '../lib/storage';
import { Partner, SpecialAnniversary, EncryptedPhoto } from '../types';
import { decryptData, encryptData } from '../lib/crypto';
import { compressAndResizeImage } from '../lib/image';
import { apiClient } from '../lib/apiClient';
import { downloadGoogleDriveFile, uploadFileToGoogleDrive } from '../lib/googleApi';

interface AnniversaryTabProps {
  anniversaryDate: string;
  partnerA: Partner;
  partnerB: Partner;
  specialAnniversaries?: SpecialAnniversary[];
  activePartner: 'A' | 'B';
  onUpdateAnniversary: (date: string) => void;
  onAddSpecialAnniversary: (createdBy: 'A' | 'B', title: string, date: string, notes?: string, photo?: string, id?: string) => void;
  onDeleteSpecialAnniversary: (id: string) => void;
  photos?: EncryptedPhoto[];
  symmetricKey: CryptoKey | null;
  onUploadPhoto?: (ciphertext: string, iv: string, isViewOnce: boolean, captionCiphertext?: string, captionIv?: string) => Promise<void>;
  storageMethodA?: 'p2p' | 'googledrive';
  storageMethodB?: 'p2p' | 'googledrive';
}

export default function AnniversaryTab({
  anniversaryDate,
  partnerA,
  partnerB,
  specialAnniversaries = [],
  activePartner,
  onUpdateAnniversary,
  onAddSpecialAnniversary,
  onDeleteSpecialAnniversary,
  photos = [],
  symmetricKey,
  onUploadPhoto,
  storageMethodA,
  storageMethodB
}: AnniversaryTabProps) {
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [inputDate, setInputDate] = useState<string>(anniversaryDate);
  const [daysTogether, setDaysTogether] = useState<number>(0);
  const [nextAnniversaryText, setNextAnniversaryText] = useState<string>('');
  const [daysRemaining, setDaysRemaining] = useState<number>(0);
  
  // AI Suggestions State
  const [aiIdeas, setAiIdeas] = useState<string[]>([]);
  const [isLoadingAi, setIsLoadingAi] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Form State for Special Anniversary
  const [isAddingAnniv, setIsAddingAnniv] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState<string>('');
  const [newDate, setNewDate] = useState<string>('');
  const [newNotes, setNewNotes] = useState<string>('');
  const [newPhoto, setNewPhoto] = useState<string>('');
  const [selectedPhotoPreview, setSelectedPhotoPreview] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Full screen lightbox photo viewer
  const [lightboxPhoto, setLightboxPhoto] = useState<{ src: string; title: string } | null>(null);

  // Locket Photo Decryption states (Component 3)
  const latestPartnerPhoto = photos.find(p => p.senderId !== activePartner);
  const [decryptedPhoto, setDecryptedPhoto] = useState<string | null>(null);
  const [decryptedCaption, setDecryptedCaption] = useState<string | null>(null);
  const [isDecrypting, setIsDecrypting] = useState<boolean>(false);

  // Quick Camera Modal states (Component 3)
  const [showCameraModal, setShowCameraModal] = useState<boolean>(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [locketCaption, setLocketCaption] = useState<string>('');
  const [isUploadingLocket, setIsUploadingLocket] = useState<boolean>(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);

  // Decrypt latest locket photo sent by the partner
  useEffect(() => {
    if (!latestPartnerPhoto || !symmetricKey) {
      setDecryptedPhoto(null);
      setDecryptedCaption(null);
      return;
    }

    let active = true;
    setIsDecrypting(true);
    
    const decrypt = async () => {
      try {
        let ciphertext = latestPartnerPhoto.ciphertext;
        let iv = latestPartnerPhoto.iv;

        if (ciphertext.startsWith('drive://')) {
          const fileId = ciphertext.substring(8);
          try {
            const fileDataUrl = await downloadGoogleDriveFile(activePartner, fileId);
            const base64Part = fileDataUrl.split(',')[1];
            const decodedText = decodeURIComponent(escape(atob(base64Part)));
            const payload = JSON.parse(decodedText);
            ciphertext = payload.ciphertext;
            iv = payload.iv;
          } catch (err) {
            console.warn('Failed to download/parse photo from Google Drive:', err);
            if (active) {
              setDecryptedPhoto('LOCKED_DRIVE');
            }
            return;
          }
        }

        const decImg = await decryptData(ciphertext, iv, symmetricKey);
        let decCap = '';
        if (latestPartnerPhoto.captionCiphertext && latestPartnerPhoto.captionIv) {
          decCap = await decryptData(latestPartnerPhoto.captionCiphertext, latestPartnerPhoto.captionIv, symmetricKey);
        }
        if (active) {
          setDecryptedPhoto(decImg);
          setDecryptedCaption(decCap || null);
        }
      } catch (e) {
        console.error('Failed to decrypt locket photo:', e);
      } finally {
        if (active) setIsDecrypting(false);
      }
    };

    decrypt();
    return () => { active = false; };
  }, [latestPartnerPhoto?.id, symmetricKey]);

  // Camera Management (Component 3)
  const startCamera = async () => {
    try {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode }
      });
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Error accessing camera:', err);
      alert('Không thể truy cập camera thiết bị. Vui lòng cho phép quyền truy cập camera.');
    }
  };

  useEffect(() => {
    if (showCameraModal) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [showCameraModal, facingMode]);

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setCapturedImage(dataUrl);
        stopCamera();
      }
    }
  };

  const handleSendLocket = async () => {
    if (!capturedImage || !symmetricKey || !onUploadPhoto) return;
    setIsUploadingLocket(true);
    try {
      // Check current storage preference
      const currentStorageMethod = activePartner === 'A' ? storageMethodA : storageMethodB;

      // 1. Client-side compress and resize (Component 3)
      const compressedB64 = await compressAndResizeImage(capturedImage, 1080, 0.8);
      
      // 2. Encrypt Image
      const encImage = await encryptData(compressedB64, symmetricKey);

      // 3. Encrypt Caption
      let encCapCiphertext = undefined;
      let encCapIv = undefined;
      if (locketCaption.trim()) {
        const encCaption = await encryptData(locketCaption.trim(), symmetricKey);
        encCapCiphertext = encCaption.ciphertext;
        encCapIv = encCaption.iv;
      }

      if (currentStorageMethod === 'googledrive') {
        const googleToken = localStorage.getItem(`google_access_token_${activePartner}`);
        if (!googleToken) {
          alert('Bạn chọn lưu trữ Google Drive nhưng chưa kết nối Google. Vui lòng kết nối Google ở tab Bảo mật trước!');
          setIsUploadingLocket(false);
          return;
        }

        const timestamp = Date.now();
        const payload = JSON.stringify({
          ciphertext: encImage.ciphertext,
          iv: encImage.iv
        });

        // Convert payload to base64
        const base64Data = `data:text/plain;base64,${btoa(unescape(encodeURIComponent(payload)))}`;

        const driveFile = await uploadFileToGoogleDrive(
          activePartner,
          `DUO_LOCKET_${timestamp}.enc`,
          'text/plain',
          base64Data
        );

        // Submit pointer drive://[id] to local server db
        await onUploadPhoto(
          `drive://${driveFile.id}`,
          'drive-iv',
          false,
          encCapCiphertext,
          encCapIv
        );
      } else {
        // 4. Post E2EE Photo directly to server db (P2P / Local mode)
        await onUploadPhoto(
          encImage.ciphertext,
          encImage.iv,
          false,
          encCapCiphertext,
          encCapIv
        );
      }

      setShowCameraModal(false);
      setCapturedImage(null);
      setLocketCaption('');
      alert('Đã gửi ảnh Locket mã hóa thành công!');
    } catch (e) {
      console.error(e);
      alert('Gặp lỗi khi gửi ảnh Locket.');
    } finally {
      setIsUploadingLocket(false);
    }
  };

  // Sync main date state
  useEffect(() => {
    setInputDate(anniversaryDate);
  }, [anniversaryDate]);

  // Calculate days together & next milestone countdown
  useEffect(() => {
    if (!anniversaryDate) return;

    const startDate = new Date(anniversaryDate);
    const today = new Date();
    
    // Clear times
    startDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);

    const diffTime = today.getTime() - startDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    setDaysTogether(diffDays >= 0 ? diffDays : 0);

    // Calculate next milestone (every 100 days OR next annual anniversary)
    const nextMilestone = Math.ceil((diffDays + 1) / 100) * 100;
    const daysToMilestone = nextMilestone - diffDays;

    // Calculate days to next yearly anniversary
    const startYear = startDate.getFullYear();
    const currentYear = today.getFullYear();
    let targetYear = currentYear;
    
    let nextAnnual = new Date(startYear, startDate.getMonth(), startDate.getDate());
    nextAnnual.setFullYear(currentYear);
    if (nextAnnual < today) {
      nextAnnual.setFullYear(currentYear + 1);
      targetYear = currentYear + 1;
    }
    
    const diffAnnualTime = nextAnnual.getTime() - today.getTime();
    const diffAnnualDays = Math.ceil(diffAnnualTime / (1000 * 60 * 60 * 24));
    const yearsNum = targetYear - startYear;

    if (diffAnnualDays < daysToMilestone) {
      setNextAnniversaryText(`Kỷ niệm ${yearsNum} năm ngày yêu`);
      setDaysRemaining(diffAnnualDays);
    } else {
      setNextAnniversaryText(`Cột mốc ${nextMilestone} ngày bên nhau`);
      setDaysRemaining(daysToMilestone);
    }
  }, [anniversaryDate]);

  // AI suggestions loader
  const fetchAiSuggestions = async () => {
    if (!anniversaryDate || daysTogether <= 0) return;
    setIsLoadingAi(true);
    setAiError(null);
    try {
      const cached = storageHelper.getItem<any>(`ai_ideas_${daysTogether}`, null);
      if (cached && cached.date === anniversaryDate) {
        setAiIdeas(cached.ideas);
        setIsLoadingAi(false);
        return;
      }

      const res = await apiClient.post('/api/ai-ideas', {
        daysTogether,
        anniversaryDate
      });
      if (res.ideas && Array.isArray(res.ideas)) {
        setAiIdeas(res.ideas);
        storageHelper.setItem(`ai_ideas_${daysTogether}`, {
          date: anniversaryDate,
          ideas: res.ideas
        });
      }
    } catch (err: any) {
      console.warn('AI Dating ideas load failed:', err);
      // Fallback
      try {
        const todayStr = new Date(anniversaryDate).toLocaleDateString('vi-VN');
        const fallbackIdeas = [
          `Cùng nhau viết một bức thư tay lãng mạn nhân mốc ${daysTogether} ngày yêu và hẹn ngày mở ra đọc.`,
          `Chuẩn bị một bữa tối tự nấu nướng nến lãng mạn tại gia mô phỏng nhà hàng đầu tiên hai bạn hẹn hò.`,
          `Thiết kế một bản đồ mini những nơi kỷ niệm in dấu chân tình yêu từ ngày ${todayStr}.`,
          `Dành trọn vẹn một tối xem lại những thước phim hoặc bức ảnh locket cũ hai bạn từng chụp cho nhau.`
        ];
        setAiIdeas(fallbackIdeas);
        setAiError('Đang dùng gợi ý lãng mạn dự phòng (Không thể kết nối Gemini API).');
        storageHelper.setItem(
          `ai_ideas_${daysTogether}`,
          {
            date: anniversaryDate,
            daysTogether,
            ideas: fallbackIdeas
          }
        );
      } catch (e) {}
    } finally {
      setIsLoadingAi(false);
    }
  };

  useEffect(() => {
    fetchAiSuggestions();
  }, [daysTogether]);

  const handleSaveDate = () => {
    if (!inputDate) return;
    onUpdateAnniversary(inputDate);
    setIsEditing(false);
  };

  // Helper to calculate countdown for a specific anniversary date
  const getAnniversaryCountdown = (dateStr: string) => {
    if (!dateStr) return { daysLeft: 999, yearsPassed: 0, isToday: false };
    const date = new Date(dateStr);
    const today = new Date();
    
    // Reset time for precise day comparison
    today.setHours(0, 0, 0, 0);
    
    const currentYear = today.getFullYear();
    let nextDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    nextDate.setFullYear(currentYear);
    
    if (nextDate < today) {
      nextDate.setFullYear(currentYear + 1);
    }

    const diffTime = nextDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    const yearsPassed = nextDate.getFullYear() - date.getFullYear();
    const isToday = today.getMonth() === date.getMonth() && today.getDate() === date.getDate();

    return {
      daysLeft: isToday ? 0 : diffDays,
      yearsPassed,
      isToday
    };
  };

  // Image Upload handler
  const handlePhotoUploadChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.type.startsWith('image/')) {
        alert('Vui lòng tải lên một tệp hình ảnh hợp lệ.');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setNewPhoto(reader.result as string);
        setSelectedPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddSpecialAnnivSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newDate) {
      alert('Vui lòng điền tiêu đề và ngày kỷ niệm.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onAddSpecialAnniversary(activePartner, newTitle.trim(), newDate, newNotes.trim(), newPhoto);
      
      // Reset Form State
      setIsAddingAnniv(false);
      setNewTitle('');
      setNewDate('');
      setNewNotes('');
      setNewPhoto('');
      setSelectedPhotoPreview('');
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Calculate upcoming anniversaries (today or within next 7 days)
  const upcomingReminders = specialAnniversaries
    .map(anniv => ({
      ...anniv,
      countdown: getAnniversaryCountdown(anniv.date)
    }))
    .filter(anniv => anniv.countdown.isToday || anniv.countdown.daysLeft <= 7)
    .sort((a, b) => a.countdown.daysLeft - b.countdown.daysLeft);

  // Chronologically sorted list of all anniversaries
  const allAnniversariesSorted = [...specialAnniversaries]
    .map(anniv => ({
      ...anniv,
      countdown: getAnniversaryCountdown(anniv.date)
    }))
    .sort((a, b) => {
      // Sort so that today is on top, then closest coming, then past
      if (a.countdown.isToday) return -1;
      if (b.countdown.isToday) return 1;
      return a.countdown.daysLeft - b.countdown.daysLeft;
    });

  return (
    <div className="h-full bg-[#080808] font-sans text-slate-100 flex flex-col overflow-hidden relative">
      <div className="flex-1 overflow-y-auto p-5 space-y-6 pb-24 scrollbar-thin scrollbar-thumb-slate-800">
        
        {/* Days Together Counter Hero Section */}
        <div className="relative rounded-3xl overflow-hidden border border-[#c5a059]/20 bg-gradient-to-b from-[#16120c] to-[#0d0d0d] p-6 flex flex-col items-center justify-center text-center shadow-lg">
          {/* Floating animated hearts */}
          <motion.div
            animate={{ scale: [1, 1.1, 1], rotate: [0, 3, -3, 0] }}
            transition={{ repeat: Infinity, duration: 4 }}
            className="w-12 h-12 rounded-full bg-[#c5a059]/10 flex items-center justify-center text-[#c5a059] mb-3 border border-[#c5a059]/20"
          >
            <Heart className="w-5 h-5 fill-[#c5a059]" />
          </motion.div>

          <p className="text-[9px] font-mono tracking-[0.25em] text-[#c5a059] uppercase">CHÚNG TA ĐÃ BÊN NHAU</p>
          <h1 className="text-4xl font-light tracking-tight mt-1 text-slate-100 flex items-baseline gap-1.5 font-serif">
            <span className="text-[#c5a059] font-medium">{daysTogether.toLocaleString()}</span>
            <span className="text-sm font-light text-slate-400 italic">ngày hạnh phúc</span>
          </h1>

          {/* Edit Date Indicator */}
          <div className="mt-4 flex items-center gap-2">
            {!isEditing ? (
              <>
                <Calendar className="w-3 h-3 text-slate-500" />
                <span className="text-[10px] text-slate-400 font-mono">Khởi đầu: {new Date(anniversaryDate).toLocaleDateString('vi-VN')}</span>
                <button
                  onClick={() => setIsEditing(true)}
                  className="p-1 text-slate-500 hover:text-[#c5a059] rounded transition-colors cursor-pointer"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
              </>
            ) : (
              <div className="flex items-center gap-1.5 bg-black p-1.5 rounded-xl border border-white/5">
                <input
                  type="date"
                  value={inputDate}
                  onChange={e => setInputDate(e.target.value)}
                  className="bg-transparent border-none text-[10px] text-slate-100 focus:outline-none focus:ring-0 p-0 font-mono"
                />
                <button
                  onClick={handleSaveDate}
                  className="p-1 rounded bg-[#c5a059]/20 text-[#c5a059] hover:bg-[#c5a059]/30 cursor-pointer"
                >
                  <Check className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Locket Polaroid Widget (Component 3) */}
        <div className="bg-[#0e0e0e]/40 border border-white/5 p-5 rounded-3xl flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-1.5 text-slate-300">
              <ImageIcon className="w-4 h-4 text-[#c5a059]" />
              <h3 className="text-xs font-semibold font-sans tracking-wide">Khoảnh khắc Locket lứa đôi</h3>
            </div>
            <button
              onClick={() => {
                setCapturedImage(null);
                setLocketCaption('');
                setShowCameraModal(true);
              }}
              className="px-3.5 py-1.5 bg-[#c5a059] hover:bg-[#b08b47] text-black font-semibold text-[10px] rounded-full transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Gửi Locket</span>
            </button>
          </div>

          {/* Polaroid Frame */}
          <div className="bg-slate-900 border border-white/5 p-4 rounded-2xl flex flex-col items-center shadow-lg relative max-w-[280px] mx-auto w-full group">
            {isDecrypting ? (
              <div className="aspect-square w-full rounded-lg bg-black/40 flex flex-col items-center justify-center text-slate-500 font-mono text-[9px] uppercase tracking-wider gap-2">
                <Loader2 className="w-5 h-5 text-[#c5a059] animate-spin" />
                <span>Đang giải mã Locket...</span>
              </div>
            ) : decryptedPhoto === 'LOCKED_DRIVE' ? (
              <div className="aspect-square w-full rounded-lg bg-black/40 flex flex-col items-center justify-center text-center p-6 text-slate-500 gap-2">
                <HardDrive className="w-8 h-8 text-[#c5a059] animate-bounce" />
                <h5 className="text-[10px] font-semibold text-slate-400">Yêu cầu kết nối Drive</h5>
                <p className="text-[8.5px] text-slate-600 max-w-[150px] leading-normal font-sans">
                  Vui lòng kết nối Google Drive ở tab Bảo mật để tải ảnh Locket của bạn.
                </p>
              </div>
            ) : decryptedPhoto ? (
              <div className="w-full space-y-4">
                {/* Image container */}
                <div className="aspect-square w-full rounded-lg overflow-hidden border border-white/5 bg-black relative">
                  <img
                    src={decryptedPhoto}
                    alt="Latest Partner Locket"
                    className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-300"
                  />
                  {/* Polaroid tape effect */}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-4 bg-white/10 backdrop-blur-sm border-x border-white/5 rotate-[-2deg]" />
                </div>
                {/* Caption / Signature */}
                <div className="text-center font-serif italic text-slate-300 text-xs px-2 pt-1 min-h-[20px] tracking-wide break-words">
                  {decryptedCaption || "Gửi một chút ngọt ngào... 💕"}
                </div>
                <div className="text-center text-[8px] font-mono text-slate-500 tracking-wider">
                  Gửi bởi {latestPartnerPhoto?.senderId === 'A' ? partnerA.name : partnerB.name} · {new Date(latestPartnerPhoto?.timestamp || 0).toLocaleDateString('vi-VN')}
                </div>
              </div>
            ) : (
              <div className="aspect-square w-full rounded-lg bg-black/40 border border-dashed border-white/10 flex flex-col items-center justify-center text-center p-6 text-slate-500 gap-2">
                <Camera className="w-8 h-8 text-slate-600 animate-pulse" />
                <h5 className="text-[10px] font-semibold text-slate-400">Chưa có ảnh Locket nào</h5>
                <p className="text-[8.5px] text-slate-600 max-w-[150px] leading-normal font-sans">
                  Chụp ảnh và chia sẻ ngay khoảnh khắc hiện tại của bạn cho đối phương!
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Partner Connect Visual representation */}
        <div className="grid grid-cols-3 items-center px-4">
          <div className="flex flex-col items-center space-y-1.5">
            <div className="w-14 h-14 rounded-full overflow-hidden border border-[#c5a059]/30 p-0.5 shadow-md bg-white/[0.02]">
              <img src={partnerA.avatar} alt={partnerA.name} className="w-full h-full object-cover rounded-full" referrerPolicy="no-referrer" />
            </div>
            <span className="text-xs font-medium text-slate-300">{partnerA.name}</span>
          </div>

          <div className="flex justify-center">
            <div className="relative w-full flex items-center justify-center">
              <div className="absolute w-full h-[1px] bg-white/5 border-dashed border-t border-slate-700" />
              <div className="z-10 w-8 h-8 rounded-full bg-[#0d0d0d] border border-white/5 flex items-center justify-center">
                <Heart className="w-4 h-4 text-[#c5a059] fill-[#c5a059] animate-pulse" />
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center space-y-1.5">
            <div className="w-14 h-14 rounded-full overflow-hidden border border-[#c5a059]/30 p-0.5 shadow-md bg-white/[0.02]">
              <img src={partnerB.avatar} alt={partnerB.name} className="w-full h-full object-cover rounded-full" referrerPolicy="no-referrer" />
            </div>
            <span className="text-xs font-medium text-slate-300">{partnerB.name}</span>
          </div>
        </div>

        {/* ACTIVE REMINDERS WIDGET */}
        {upcomingReminders.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-[#c5a059]/40 bg-[#c5a059]/5 p-4.5 space-y-3 shadow-md"
          >
            <div className="flex items-center gap-2 text-[#c5a059]">
              <Bell className="w-4 h-4 animate-bounce" />
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider">NHẮC NHỞ NGÀY KỶ NIỆM SẮP TỚI</h3>
            </div>
            <div className="space-y-2">
              {upcomingReminders.map(anniv => (
                <div 
                  key={anniv.id} 
                  className="flex items-center justify-between text-xs bg-black/40 p-2.5 rounded-xl border border-white/5"
                >
                  <div className="flex flex-col">
                    <span className="font-medium text-slate-200">{anniv.title}</span>
                    <span className="text-[10px] text-slate-500 font-mono mt-0.5">
                      Ngày: {new Date(anniv.date).toLocaleDateString('vi-VN')}
                    </span>
                  </div>
                  <div>
                    {anniv.countdown.isToday ? (
                      <span className="text-[10px] font-semibold bg-rose-500/20 text-rose-400 py-1 px-2.5 rounded-full border border-rose-500/20 animate-pulse uppercase tracking-wide">
                        Hôm Nay 🎉
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium bg-[#c5a059]/20 text-[#ebd4b3] py-1 px-2.5 rounded-full border border-[#c5a059]/20">
                        Còn {anniv.countdown.daysLeft} ngày
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Next Countdown card */}
        <div className="bg-white/[0.02] border border-white/5 p-4.5 rounded-2xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/5 flex items-center justify-center text-slate-300">
              <Hourglass className="w-5 h-5 text-[#c5a059]" />
            </div>
            <div>
              <h4 className="text-xs font-medium text-slate-100">{nextAnniversaryText}</h4>
              <p className="text-[10px] text-slate-500 mt-0.5">Thời gian trôi đi thật ý nghĩa</p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-xl font-bold text-[#c5a059] font-serif">{daysRemaining}</span>
            <p className="text-[9px] text-slate-500 font-mono mt-0.5">ngày nữa</p>
          </div>
        </div>

        {/* AI suggestions matching the days */}
        <div className="space-y-3.5 bg-gradient-to-b from-[#0a0a0a] to-[#0c0c0c] border border-white/5 rounded-3xl p-5 shadow-inner">
          <div className="flex items-center justify-between text-slate-300">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#c5a059] animate-pulse" />
              <h3 className="text-xs font-semibold font-sans tracking-wide">Ý tưởng lãng mạn từ AI</h3>
            </div>
            <button
              onClick={fetchAiSuggestions}
              disabled={isLoadingAi}
              className="p-1 rounded bg-white/[0.03] border border-white/10 text-slate-400 hover:text-slate-200 cursor-pointer disabled:opacity-50"
              title="Tải lại ý tưởng"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAi ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {isLoadingAi ? (
            <div className="py-8 flex flex-col items-center justify-center text-center gap-2">
              <Loader2 className="w-6 h-6 text-[#c5a059] animate-spin" />
              <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Đang tham vấn trí tuệ nhân tạo...</p>
            </div>
          ) : (
            <>
              {aiError && (
                <div className="bg-[#c5a059]/10 border border-[#c5a059]/20 rounded-xl p-2.5 flex items-start gap-2 text-[10px] text-[#ebd4b3] font-sans">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#c5a059]" />
                  <span className="leading-normal">{aiError}</span>
                </div>
              )}
              
              <ul className="space-y-3">
                {aiIdeas.map((idea, idx) => (
                  <motion.li
                    key={idx}
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="flex gap-2.5 items-start text-xs text-slate-300 leading-relaxed group"
                  >
                    <span className="text-[#c5a059] font-mono select-none mt-0.5 group-hover:scale-110 transition-transform">0{idx + 1}.</span>
                    <span>{idea}</span>
                  </motion.li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* Special Anniversary dates timeline */}
        <div className="space-y-3.5">
          <div className="flex justify-between items-center text-slate-300">
            <div className="flex items-center gap-2">
              <CalendarCheck2 className="w-4 h-4 text-[#c5a059]" />
              <h3 className="text-xs font-semibold font-sans tracking-wide">Mốc kỷ niệm lứa đôi</h3>
            </div>
            <button
              onClick={() => setIsAddingAnniv(true)}
              className="p-1 bg-[#c5a059] hover:bg-[#b08b47] text-black rounded-lg cursor-pointer flex items-center justify-center"
              title="Thêm kỷ niệm mới"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {allAnniversariesSorted.length === 0 ? (
            <div className="bg-white/[0.01] border border-dashed border-white/5 rounded-2xl p-6 text-center text-slate-500 text-xs">
              Chưa thiết lập mốc kỷ niệm riêng nào. Ấn nút (+) ở góc để thêm mới nhé!
            </div>
          ) : (
            <div className="space-y-3">
              {allAnniversariesSorted.map(anniv => (
                <div 
                  key={anniv.id}
                  className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 flex flex-col gap-3.5 hover:border-white/10 transition-colors relative"
                >
                  <button
                    onClick={() => onDeleteSpecialAnniversary(anniv.id)}
                    className="absolute top-4 right-4 p-1.5 rounded-lg bg-white/[0.02] border border-white/5 text-slate-500 hover:text-red-400 cursor-pointer"
                    title="Xóa kỷ niệm"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>

                  <div className="flex gap-3">
                    {anniv.photo ? (
                      <button 
                        onClick={() => setLightboxPhoto({ src: anniv.photo, title: anniv.title })}
                        className="w-16 h-16 rounded-xl overflow-hidden border border-white/5 shrink-0 cursor-pointer bg-black"
                      >
                        <img src={anniv.photo} alt={anniv.title} className="w-full h-full object-cover" />
                      </button>
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-center shrink-0 text-slate-600">
                        <Heart className="w-6 h-6" />
                      </div>
                    )}
                    
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className="text-xs font-semibold text-slate-100">{anniv.title}</h4>
                        {anniv.countdown.isToday && (
                          <span className="text-[8px] font-semibold bg-rose-500/20 text-rose-400 py-0.5 px-2 rounded-full border border-rose-500/20 uppercase animate-pulse">
                            Hôm nay 🎉
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 font-mono">
                        {new Date(anniv.date).toLocaleDateString('vi-VN')}
                      </p>
                      {anniv.notes && (
                        <p className="text-[10.5px] text-slate-400 leading-normal line-clamp-2">{anniv.notes}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox photo viewer */}
      {lightboxPhoto && (
        <div 
          className="fixed inset-0 z-[9999] bg-black/95 flex flex-col items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setLightboxPhoto(null)}
        >
          <div className="w-full max-w-lg space-y-4">
            <div className="flex justify-between items-center text-slate-300">
              <span className="text-xs font-semibold">{lightboxPhoto.title}</span>
              <button className="p-1 rounded hover:bg-white/10"><X className="w-5 h-5" /></button>
            </div>
            <div className="aspect-[4/3] w-full rounded-2xl overflow-hidden bg-black flex items-center justify-center">
              <img src={lightboxPhoto.src} alt={lightboxPhoto.title} className="w-full h-full object-contain" />
            </div>
          </div>
        </div>
      )}

      {/* Quick Camera Capture Modal (Component 3) */}
      {showCameraModal && (
        <div className="fixed inset-0 z-[9999] bg-[#090b11]/98 backdrop-blur-xl flex flex-col justify-between p-6 overflow-hidden">
          {/* Header */}
          <div className="flex justify-between items-center text-slate-100">
            <h3 className="text-xs font-semibold tracking-wide">Chụp ảnh Locket mới</h3>
            <button
              onClick={() => {
                stopCamera();
                setShowCameraModal(false);
              }}
              className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Camera View / Preview */}
          <div className="flex-1 flex flex-col items-center justify-center my-6">
            {!capturedImage ? (
              <div className="w-full max-w-sm aspect-square bg-black rounded-3xl overflow-hidden border border-white/5 relative shadow-2xl">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 pointer-events-none border-[12px] border-black/30 rounded-3xl" />
              </div>
            ) : (
              <div className="w-full max-w-sm aspect-square bg-slate-900 rounded-3xl overflow-hidden border border-white/5 relative shadow-2xl flex flex-col">
                <img
                  src={capturedImage}
                  alt="Captured Preview"
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            {/* Caption Input for Captured Photo */}
            {capturedImage && (
              <div className="w-full max-w-sm mt-4">
                <input
                  type="text"
                  maxLength={80}
                  placeholder="Thêm lời nhắn ngọt ngào cho ảnh..."
                  value={locketCaption}
                  onChange={(e) => setLocketCaption(e.target.value)}
                  className="w-full bg-white/[0.02] border border-white/5 hover:border-white/10 rounded-2xl py-3 px-4 text-center text-xs text-slate-100 focus:outline-none focus:border-[#c5a059]/40 transition-colors placeholder:text-slate-600 font-serif italic"
                />
              </div>
            )}
          </div>

          {/* Controls Footer */}
          <div className="w-full max-w-sm mx-auto mb-4">
            {!capturedImage ? (
              <div className="flex justify-around items-center">
                {/* Switch Camera */}
                <button
                  onClick={() => setFacingMode(prev => prev === 'user' ? 'environment' : 'user')}
                  className="p-3 rounded-full bg-white/5 border border-white/10 text-slate-300 hover:text-slate-100 hover:bg-white/10 transition-colors cursor-pointer"
                  title="Đổi camera"
                >
                  <RefreshCw className="w-5 h-5" />
                </button>
                {/* Capture Shutter Button */}
                <button
                  onClick={capturePhoto}
                  className="w-16 h-16 rounded-full bg-white border-4 border-slate-700 flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95 cursor-pointer"
                />
                <div className="w-11" />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => {
                    setCapturedImage(null);
                    setLocketCaption('');
                    startCamera();
                  }}
                  className="bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 text-xs font-semibold py-3.5 rounded-2xl cursor-pointer transition-colors"
                >
                  Chụp lại
                </button>
                <button
                  disabled={isUploadingLocket}
                  onClick={handleSendLocket}
                  className="bg-[#c5a059] hover:bg-[#b08b47] text-black text-xs font-semibold py-3.5 rounded-2xl flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"
                >
                  {isUploadingLocket ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang gửi...</span>
                    </>
                  ) : (
                    <>
                      <span>Gửi Locket</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Special Anniversary Modal Form */}
      <AnimatePresence>
        {isAddingAnniv && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm bg-gradient-to-b from-[#111] to-[#0c0c0c] border border-white/5 rounded-3xl p-6.5 space-y-4 shadow-2xl relative"
            >
              <button
                onClick={() => setIsAddingAnniv(false)}
                className="absolute top-4 right-4 p-1 rounded hover:bg-white/10 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>

              <div>
                <h3 className="text-sm font-semibold text-slate-100">Thêm ngày kỷ niệm</h3>
                <p className="text-[10px] text-slate-500 mt-0.5">Lưu lại các mốc thời gian đặc biệt của hai bạn</p>
              </div>

              <form onSubmit={handleAddSpecialAnnivSubmit} className="space-y-4.5">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-mono tracking-wider text-slate-500 uppercase block">TIÊU ĐỀ KỶ NIỆM</label>
                  <input
                    type="text"
                    required
                    maxLength={100}
                    placeholder="Ví dụ: Lần đầu đi xem phim cùng nhau"
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    className="w-full bg-black border border-white/5 rounded-2xl py-3 px-4 text-xs text-slate-200 focus:outline-none focus:border-[#c5a059]/40 transition-colors"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-mono tracking-wider text-slate-500 uppercase block">NGÀY KỶ NIỆM</label>
                    <input
                      type="date"
                      required
                      value={newDate}
                      onChange={e => setNewDate(e.target.value)}
                      className="w-full bg-black border border-white/5 rounded-2xl py-3 px-4 text-xs text-slate-200 focus:outline-none focus:border-[#c5a059]/40 transition-colors font-mono"
                    />
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-mono tracking-wider text-slate-500 uppercase block">HÌNH ẢNH ĐÍNH KÈM</label>
                    <div className="relative">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoUploadChange}
                        className="hidden"
                        id="anniv-photo-upload"
                      />
                      <label
                        htmlFor="anniv-photo-upload"
                        className="w-full bg-black border border-white/5 hover:border-white/10 rounded-2xl py-3 px-4 text-xs text-slate-400 hover:text-slate-200 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span className="truncate">{selectedPhotoPreview ? 'Đã chọn ảnh' : 'Chọn tệp'}</span>
                      </label>
                    </div>
                  </div>
                </div>

                {selectedPhotoPreview && (
                  <div className="aspect-[4/3] w-full rounded-2xl overflow-hidden border border-white/5 bg-black relative">
                    <img src={selectedPhotoPreview} alt="Selected Preview" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => { setNewPhoto(''); setSelectedPhotoPreview(''); }}
                      className="absolute top-2.5 right-2.5 p-1 rounded-full bg-black/60 text-slate-400 hover:text-slate-200"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-[9px] font-mono tracking-wider text-slate-500 uppercase block">GHI CHÚ / KÝ ỨC (TÙY CHỌN)</label>
                  <textarea
                    maxLength={1000}
                    placeholder="Ghi lại cảm xúc hoặc ký ức của hai bạn tại đây..."
                    value={newNotes}
                    onChange={e => setNewNotes(e.target.value)}
                    rows={3}
                    className="w-full bg-black border border-white/5 rounded-2xl py-3 px-4 text-xs text-slate-200 focus:outline-none focus:border-[#c5a059]/40 transition-colors resize-none leading-relaxed"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || !newTitle.trim() || !newDate}
                  className="w-full bg-[#c5a059] hover:bg-[#b08b47] disabled:opacity-50 text-black font-semibold text-xs py-3.5 rounded-2xl transition-all shadow-lg active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang lưu...</span>
                    </>
                  ) : (
                    <>
                      <span>Lưu kỷ niệm</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
