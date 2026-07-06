import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Camera, 
  Image as ImageIcon, 
  Trash2, 
  Eye, 
  EyeOff, 
  ShieldCheck, 
  Clock, 
  UploadCloud, 
  X, 
  Lock, 
  HardDrive, 
  RefreshCw, 
  FileText, 
  ExternalLink, 
  Download, 
  Play, 
  Check, 
  AlertTriangle, 
  LogIn, 
  UserCheck, 
  Laptop,
  ArrowLeft,
  Binary,
  ShieldAlert,
  Key,
  Droplet,
  RotateCcw,
  Search,
  Book,
  LayoutGrid,
  Filter,
  Sparkles
} from 'lucide-react';
import { EncryptedPhoto, Partner, WaterLog } from '../types';
import { encryptData, decryptData } from '../lib/crypto';
import { ROMANTIC_PRESETS } from '../lib/demoData';
import { 
  initAuth, 
  googleSignIn, 
  logoutGoogle, 
  getAccessToken, 
  listGoogleDriveFiles, 
  downloadGoogleDriveFile, 
  listGooglePhotos, 
  uploadFileToGoogleDrive, 
  GoogleDriveFile, 
  GooglePhotoItem 
} from '../lib/googleApi';
import useKeyHex from '../hooks/useKeyHex';
import useDecryptedCollection from '../hooks/useDecryptedCollection';
import { compressAndResizeImage, applyFilterToImage, downloadAsPng, FILTER_PRESETS, type PhotoFilter } from '../lib/image';
import { storageHelper } from '../lib/storage';
import { useT } from '../lib/i18n';

interface AlbumTabProps {
  photos: EncryptedPhoto[];
  activePartner: 'A' | 'B';
  partnerA: Partner;
  partnerB: Partner;
  symmetricKey: CryptoKey | null;
  onUploadPhoto: (ciphertext: string, iv: string, isViewOnce: boolean, captionCiphertext?: string, captionIv?: string) => void;
  onDeletePhoto: (id: string) => void;
  storageMethodA?: 'p2p' | 'googledrive';
  storageMethodB?: 'p2p' | 'googledrive';
  waterLogs?: WaterLog[];
  onAddWaterLog?: (partnerId: 'A' | 'B', amount: number) => void;
  onDeleteWaterLog?: (id: string) => void;
}

type UploadTab = 'device' | 'camera' | 'drive' | 'photos';

export default function AlbumTab({
  photos,
  activePartner,
  partnerA,
  partnerB,
  symmetricKey,
  onUploadPhoto,
  onDeletePhoto,
  storageMethodA,
  storageMethodB,
  waterLogs = [],
  onAddWaterLog,
  onDeleteWaterLog
}: AlbumTabProps) {
  const t = useT();
  // --- HYDRATION HUB CALCULATIONS ---
  const todayStr = new Date().toDateString();
  const todayLogs = waterLogs.filter(log => new Date(log.timestamp).toDateString() === todayStr);
  const totalA = todayLogs.filter(log => log.partnerId === 'A').reduce((sum, log) => sum + log.amount, 0);
  const totalB = todayLogs.filter(log => log.partnerId === 'B').reduce((sum, log) => sum + log.amount, 0);
  const goal = 2000; // 2000 ml
  const percentA = Math.min(100, Math.round((totalA / goal) * 100));
  const percentB = Math.min(100, Math.round((totalB / goal) * 100));

  // Determine relative comparisons
  let comparisonText = '';
  if (totalA === 0 && totalB === 0) {
    comparisonText = 'Hôm nay chưa ai uống nước cả. Bắt đầu ngay nhé! 💧';
  } else if (totalA === totalB) {
    comparisonText = 'Cả hai đang uống bằng nhau! Cùng duy trì nhé! 🤝';
  } else {
    const diff = Math.abs(totalA - totalB);
    const leader = totalA > totalB ? partnerA.name : partnerB.name;
    const runner = totalA > totalB ? partnerB.name : partnerA.name;
    comparisonText = `${leader} đang dẫn trước ${runner} ${diff}ml! 🏆`;
  }

  // Get last log made by current user to allow undo
  const myTodayLogs = todayLogs.filter(log => log.partnerId === activePartner);
  const lastMyLog = myTodayLogs.length > 0 ? myTodayLogs[myTodayLogs.length - 1] : null;

  const handleDrink = (amount: number) => {
    if (onAddWaterLog) {
      onAddWaterLog(activePartner, amount);
    }
  };

  const handleUndoDrink = () => {
    if (lastMyLog && onDeleteWaterLog) {
      onDeleteWaterLog(lastMyLog.id);
    }
  };

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [activeUploadTab, setActiveUploadTab] = useState<UploadTab>('device');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [caption, setCaption] = useState<string>('');
  const [isViewOnce, setIsViewOnce] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Guided wizard flow step: 'main_choice' | 'upload_choice' | 'camera_flow' | 'device_flow' | 'drive_flow' | 'photos_flow'
  const [modalFlowStep, setModalFlowStep] = useState<'main_choice' | 'upload_choice' | 'camera_flow' | 'device_flow' | 'drive_flow' | 'photos_flow'>('main_choice');
  const [liveCiphertext, setLiveCiphertext] = useState<string>('');
  const [liveIv, setLiveIv] = useState<string>('');

  const [activePhotoView, setActivePhotoView] = useState<EncryptedPhoto | null>(null);

  // Google Integration states
  const [googleUser, setGoogleUser] = useState<any>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [driveType, setDriveType] = useState<'images' | 'documents'>('images');
  const [driveFiles, setDriveFiles] = useState<GoogleDriveFile[]>([]);
  const [photosItems, setPhotosItems] = useState<GooglePhotoItem[]>([]);
  const [isLoadingGoogle, setIsLoadingGoogle] = useState<boolean>(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [activeDocPreview, setActiveDocPreview] = useState<GoogleDriveFile | null>(null);
  const [docContent, setDocContent] = useState<string | null>(null);
  const [isLoadingDoc, setIsLoadingDoc] = useState<boolean>(false);

  // Camera capture states
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // PTB photo filter states
  const [currentFilter, setCurrentFilter] = useState<PhotoFilter>('normal');

  // Search & Photobook states
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'photobook'>('grid');

  // Hydration verification camera states
  const [pendingWaterDrink, setPendingWaterDrink] = useState<{ amount: number } | null>(null);
  const [isWaterCameraOpen, setIsWaterCameraOpen] = useState<boolean>(false);
  const [waterCameraStream, setWaterCameraStream] = useState<MediaStream | null>(null);
  const [waterCameraError, setWaterCameraError] = useState<boolean>(false);
  const waterVideoRef = useRef<HTMLVideoElement | null>(null);
  const waterCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Start water camera
  const startWaterCamera = async () => {
    setWaterCameraError(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 400, height: 405 }
      });
      setWaterCameraStream(stream);
      if (waterVideoRef.current) {
        waterVideoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.warn('Unable to access video camera for water verification:', err);
      setWaterCameraError(true);
    }
  };

  // Stop water camera
  const stopWaterCamera = () => {
    if (waterCameraStream) {
      waterCameraStream.getTracks().forEach(track => track.stop());
      setWaterCameraStream(null);
    }
  };

  // Clean up water camera on unmount
  useEffect(() => {
    return () => {
      if (waterCameraStream) {
        waterCameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [waterCameraStream]);

  // Upload E2EE photo for water verification
  const uploadWaterVerificationPhoto = async (dataUrl: string, amount: number) => {
    if (!symmetricKey) return;
    try {
      let processedImg = dataUrl;
      try {
        processedImg = await compressAndResizeImage(dataUrl, 600, 0.7);
      } catch (compressErr) {
        console.warn('Compression failed, using raw snapshot:', compressErr);
      }

      const { ciphertext: imgCiphertext, iv: imgIv } = await encryptData(processedImg, symmetricKey);
      const captionText = `Đã uống ${amount}ml nước! 💧`;
      const { ciphertext: capCiphertext, iv: capIv } = await encryptData(captionText, symmetricKey);

      const currentStorageMethod = activePartner === 'A' ? storageMethodA : storageMethodB;

      if (currentStorageMethod === 'googledrive') {
        if (!googleToken) {
          alert('Bạn chọn lưu trữ Google Drive nhưng chưa kết nối Google. Vui lòng kết nối tài khoản Google trước!');
          return;
        }

        const timestamp = Date.now();
        const payload = JSON.stringify({
          ciphertext: imgCiphertext,
          iv: imgIv
        });

        const base64Data = `data:text/plain;base64,${btoa(unescape(encodeURIComponent(payload)))}`;

        const driveFile = await uploadFileToGoogleDrive(
          activePartner,
          `DUO_E2EE_WATER_${timestamp}.enc`,
          'text/plain',
          base64Data
        );

        onUploadPhoto(`drive://${driveFile.id}`, 'drive-iv', false, capCiphertext, capIv);
      } else {
        onUploadPhoto(imgCiphertext, imgIv, false, capCiphertext, capIv);
      }
    } catch (error) {
      console.error('Failed to upload water verification photo:', error);
    }
  };

  const handleDrinkClick = (amount: number) => {
    setPendingWaterDrink({ amount });
  };

  // Retrieve Key Hex using useKeyHex custom hook
  const symmetricKeyHex = useKeyHex(symmetricKey);

  // Decrypt images client-side using useDecryptedCollection custom hook
  const decryptedImages = useDecryptedCollection(
    photos,
    symmetricKey,
    async (photo, key) => {
      let ciphertext = photo.ciphertext;
      let iv = photo.iv;

      if (ciphertext.startsWith('drive://')) {
        const fileId = ciphertext.substring(8);
        try {
          const fileDataUrl = await downloadGoogleDriveFile(activePartner, fileId);
          const base64Part = fileDataUrl.split(',')[1];
          const decodedText = decodeURIComponent(escape(atob(base64Part)));
          const payload = JSON.parse(decodedText);
          ciphertext = payload.ciphertext;
          iv = payload.iv;
        } catch (e) {
          console.warn('Failed to download/parse photo from Google Drive:', e);
          return { src: 'LOCKED_DRIVE', caption: 'Kết nối Google Drive để xem' };
        }
      }

      const imgSrc = await decryptData(ciphertext, iv, key);
      let cap = '';
      if (photo.captionCiphertext && photo.captionIv) {
        cap = await decryptData(photo.captionCiphertext, photo.captionIv, key);
      }
      return { src: imgSrc, caption: cap };
    }
  );

  // Synchronize Google Auth on mount and partner switch
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
    return () => {
      unsubscribe();
      stopCamera();
    };
  }, [activePartner]);

  // Real-time E2EE Reactive Encryption Visualizer
  useEffect(() => {
    if (!selectedFile || !symmetricKey) {
      setLiveCiphertext('');
      setLiveIv('');
      return;
    }
    const textToEncrypt = caption.trim() ? caption : "Kỷ niệm Locket ngọt ngào của chúng ta ❤️";
    encryptData(textToEncrypt, symmetricKey)
      .then(res => {
        setLiveCiphertext(res.ciphertext);
        setLiveIv(res.iv);
      })
      .catch(err => {
        console.error('Live encryption error:', err);
      });
  }, [caption, selectedFile, symmetricKey]);

  // Handle camera stream life cycle
  useEffect(() => {
    if (isModalOpen && modalFlowStep === 'camera_flow') {
      startCamera();
    } else {
      stopCamera();
    }
  }, [isModalOpen, modalFlowStep]);

  // Google APIs Fetch managers
  useEffect(() => {
    if (googleToken && isModalOpen) {
      if (modalFlowStep === 'drive_flow') {
        loadDriveFiles();
      } else if (modalFlowStep === 'photos_flow') {
        loadPhotos();
      }
    }
  }, [googleToken, modalFlowStep, driveType, isModalOpen]);

  // Start devices camera stream
  const startCamera = async () => {
    setCameraError(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 400, height: 400 }
      });
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.warn('Unable to access video camera devices:', err);
      setCameraError(true);
    }
  };

  // Stop active camera
  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
  };

  // Capture image snapshot from active camera stream
  const takeSnapshot = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        canvas.width = video.videoWidth || 400;
        canvas.height = video.videoHeight || 400;
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        const preset = FILTER_PRESETS.find(f => f.id === currentFilter);
        if (preset && preset.cssFilter !== 'none') ctx.filter = preset.cssFilter;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ctx.filter = 'none';
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const dataUrl = canvas.toDataURL('image/png');
        setSelectedFile(dataUrl);
        stopCamera();
      }
    }
  };

  // Capture & encrypt direct from camera
  const takeAndSendSnapshot = async () => {
    if (videoRef.current && canvasRef.current && symmetricKey) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        canvas.width = video.videoWidth || 400;
        canvas.height = video.videoHeight || 400;
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        const preset = FILTER_PRESETS.find(f => f.id === currentFilter);
        if (preset && preset.cssFilter !== 'none') ctx.filter = preset.cssFilter;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ctx.filter = 'none';
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const dataUrl = canvas.toDataURL('image/png');
        stopCamera();

        const compressed = await compressAndResizeImage(dataUrl, 1600, 0.8);
        const { ciphertext, iv } = await encryptData(compressed, symmetricKey);
        const capCiphertext = caption.trim()
          ? (await encryptData(caption, symmetricKey)).ciphertext
          : undefined;
        const capIv = caption.trim()
          ? (await encryptData(caption, symmetricKey)).iv
          : undefined;
        onUploadPhoto(ciphertext, iv, false, capCiphertext, capIv);
        setCaption('');
        setIsModalOpen(false);
      }
    }
  };

  // Connect Google account flow
  const handleConnectGoogle = async () => {
    try {
      const result = await googleSignIn(activePartner);
      if (result) {
        setGoogleUser(result.user);
        setGoogleToken(result.accessToken);
      }
    } catch (e) {
      console.error(e);
      alert('Kết nối Google thất bại. Vui lòng cho phép popups.');
    }
  };

  // Load files from Google Drive
  const loadDriveFiles = async () => {
    setIsLoadingGoogle(true);
    setGoogleError(null);
    try {
      const files = await listGoogleDriveFiles(activePartner, driveType);
      setDriveFiles(files);
    } catch (err: any) {
      setGoogleError(err.message || 'Không thể tải tệp tin từ Google Drive');
    } finally {
      setIsLoadingGoogle(false);
    }
  };

  // Load photos from Google Photos API
  const loadPhotos = async () => {
    setIsLoadingGoogle(true);
    setGoogleError(null);
    try {
      const items = await listGooglePhotos(activePartner);
      setPhotosItems(items);
    } catch (err: any) {
      // Graceful fallback for non-whitelisted or un-enabled test credentials on standard Photos API
      console.warn('Photos API unavailable. Active fallback presets activated.');
      setPhotosItems([]);
    } finally {
      setIsLoadingGoogle(false);
    }
  };

  // Load document content preview from Google Drive
  const handlePreviewDocument = async (file: GoogleDriveFile) => {
    setActiveDocPreview(file);
    setIsLoadingDoc(true);
    setDocContent(null);
    try {
      const text = await downloadGoogleDriveFile(activePartner, file.id);
      // Clean raw text formatting for screen reading
      setDocContent(text.substring(0, 10000)); // Limit size
    } catch (err) {
      console.error(err);
      setDocContent('Tài liệu nhị phân không khả dụng cho đọc trực tiếp dạng văn bản thô. Bạn có thể sử dụng liên kết xem bên dưới để truy cập trực tiếp.');
    } finally {
      setIsLoadingDoc(false);
    }
  };

  const handleBack = () => {
    if (modalFlowStep === 'upload_choice' || modalFlowStep === 'camera_flow') {
      stopCamera();
      setModalFlowStep('main_choice');
    } else if (modalFlowStep === 'device_flow' || modalFlowStep === 'drive_flow' || modalFlowStep === 'photos_flow') {
      setModalFlowStep('upload_choice');
    }
  };

  // File drop helper
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const processFile = (file: File) => {
    if (file.size > 8 * 1024 * 1024) {
      alert('Tệp hình ảnh quá lớn. Vui lòng chọn ảnh dưới 8MB.');
      return;
    }
    if (!file.type.startsWith('image/')) {
      alert('Vui lòng chọn tệp hình ảnh hợp lệ.');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const compressed = await compressAndResizeImage(reader.result as string, 1600, 0.8);
        setSelectedFile(compressed);
      } catch (err) {
        console.warn('Error compressing image, using raw data', err);
        setSelectedFile(reader.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  // Save selection from Google Photos or Google Drive
  const handleSelectGoogleImage = async (url: string) => {
    setIsLoadingGoogle(true);
    try {
      const headers: Record<string, string> = {};
      const isGoogleUrl = url.includes('googleusercontent.com') || url.includes('googleapis.com');
      if (isGoogleUrl && googleToken) {
        headers['Authorization'] = `Bearer ${googleToken}`;
      }
      const response = await fetch(url, { headers });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedFile(reader.result as string);
        setIsLoadingGoogle(false);
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      console.error('Failed to fetch image, using URL directly', err);
      setSelectedFile(url);
      setIsLoadingGoogle(false);
    }
  };

  // Submit and Upload Encrypted Photo
  const handleUploadSubmit = async () => {
    if (!selectedFile || !symmetricKey) return;

    setIsUploading(true);

    try {
      // 1. Encrypt image payload client-side
      const { ciphertext: imgCiphertext, iv: imgIv } = await encryptData(selectedFile, symmetricKey);

      // 2. Encrypt optional caption client-side
      let capCiphertext = undefined;
      let capIv = undefined;
      if (caption.trim()) {
        const encryptedCap = await encryptData(caption, symmetricKey);
        capCiphertext = encryptedCap.ciphertext;
        capIv = encryptedCap.iv;
      }

      // Check current storage preference
      const currentStorageMethod = activePartner === 'A' ? storageMethodA : storageMethodB;

      if (currentStorageMethod === 'googledrive') {
        if (!googleToken) {
          alert('Bạn chọn lưu trữ Google Drive nhưng chưa kết nối Google. Vui lòng kết nối tài khoản Google trước!');
          setIsUploading(false);
          return;
        }

        const timestamp = Date.now();
        const payload = JSON.stringify({
          ciphertext: imgCiphertext,
          iv: imgIv
        });

        // Convert payload to base64
        const base64Data = `data:text/plain;base64,${btoa(unescape(encodeURIComponent(payload)))}`;

        const driveFile = await uploadFileToGoogleDrive(
          activePartner,
          `DUO_E2EE_${timestamp}.enc`,
          'text/plain',
          base64Data
        );

        // Submit pointer drive://[id] to local server db
        onUploadPhoto(`drive://${driveFile.id}`, 'drive-iv', isViewOnce, capCiphertext, capIv);
      } else {
        // 3. Submit E2EE blobs directly to server db (P2P / Local mode)
        onUploadPhoto(imgCiphertext, imgIv, isViewOnce, capCiphertext, capIv);
      }

      // Reset state
      setSelectedFile(null);
      setCaption('');
      setIsViewOnce(false);
      setIsModalOpen(false);
    } catch (error) {
      console.error('Photo encryption failed', error);
    } finally {
      setIsUploading(false);
    }
  };

  const [pendingDeleteViewOnce, setPendingDeleteViewOnce] = useState<string | null>(null);

  const handleViewPhoto = (photo: EncryptedPhoto) => {
    setActivePhotoView(photo);
    if (photo.isViewOnce && photo.senderId !== activePartner) {
      setPendingDeleteViewOnce(photo.id);
    }
  };

  const handleCloseViewer = () => {
    if (pendingDeleteViewOnce) {
      onDeletePhoto(pendingDeleteViewOnce);
      setPendingDeleteViewOnce(null);
    }
    setActivePhotoView(null);
  };

  return (
    <div className="h-full bg-[#080808] font-sans text-slate-100 flex flex-col overflow-hidden relative">
      {/* Top security header */}
      <div className="bg-[#0e0e0e]/95 border-b border-white/5 py-3 px-4 flex items-center justify-between text-[10px] font-mono text-[#c5a059]">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-[#c5a059]" />
          <span>KHO LƯU TRỮ HÌNH ẢNH MÃ HÓA E2EE & GOOGLE HUB</span>
        </div>
      </div>

      {/* Main Grid View */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-20 scrollbar-thin scrollbar-thumb-white/5 animate-fade-in">
        {/* Hydration Hub (Trạm Cấp Nước) */}
        <div className="bg-[#0e0e0e]/80 border border-white/5 rounded-2xl p-4 shadow-lg backdrop-blur-sm relative overflow-hidden shrink-0 select-none">
          {/* Subtle water glow background effect */}
          <div className="absolute -right-12 -bottom-12 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />
          
          <div className="flex items-center justify-between mb-3.5 relative z-10">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                <Droplet className="w-4 h-4 fill-blue-400/20" />
              </div>
              <div>
                <h3 className="text-xs font-semibold text-slate-200">{t('water.title')}</h3>
                <p className="text-[10px] text-slate-400">{t('water.progress')}: {goal}ml</p>
              </div>
            </div>
            {lastMyLog && (
              <button
                onClick={handleUndoDrink}
                className="flex items-center gap-1 text-[10px] font-medium text-slate-400 hover:text-red-400 transition-colors cursor-pointer bg-white/5 border border-white/10 rounded-lg px-2 py-1 relative z-10"
                title="Hoàn tác lần uống gần nhất"
              >
                <RotateCcw className="w-3 h-3" />
                <span>{t('water.undo')} ({lastMyLog.amount}ml)</span>
              </button>
            )}
          </div>

          {/* Progress Section */}
          <div className="grid grid-cols-2 gap-3.5 my-3 relative z-10">
            {/* Partner A */}
            <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3 relative flex flex-col justify-between">
              <div className="flex items-center gap-2 mb-2">
                <img src={partnerA.avatar} alt={partnerA.name} className="w-5 h-5 rounded-full object-cover border border-white/10" />
                <span className="text-[10.5px] font-semibold text-slate-350 truncate">{partnerA.name}</span>
              </div>
              <div>
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-xs font-mono font-bold text-blue-400">{totalA}<span className="text-[9px] text-slate-500 font-normal ml-0.5">ml</span></span>
                  <span className="text-[10px] font-mono text-slate-450">{percentA}%</span>
                </div>
                <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${percentA}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="h-full bg-gradient-to-r from-blue-500 to-sky-400 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                  />
                </div>
              </div>
            </div>

            {/* Partner B */}
            <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3 relative flex flex-col justify-between">
              <div className="flex items-center gap-2 mb-2">
                <img src={partnerB.avatar} alt={partnerB.name} className="w-5 h-5 rounded-full object-cover border border-white/10" />
                <span className="text-[10.5px] font-semibold text-slate-355 truncate">{partnerB.name}</span>
              </div>
              <div>
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-xs font-mono font-bold text-sky-400">{totalB}<span className="text-[9px] text-slate-500 font-normal ml-0.5">ml</span></span>
                  <span className="text-[10px] font-mono text-slate-405">{percentB}%</span>
                </div>
                <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${percentB}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="h-full bg-gradient-to-r from-sky-500 to-teal-400 rounded-full shadow-[0_0_8px_rgba(14,165,233,0.5)]"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Quick Check-in Buttons */}
          <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-white/5 relative z-10">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium text-slate-400 shrink-0">{t('water.quick_add')}:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button 
                onClick={() => handleDrinkClick(250)}
                className="flex items-center gap-1 text-[10px] font-medium bg-blue-500/10 border border-blue-500/20 text-blue-300 rounded-xl px-2.5 py-1.5 hover:bg-blue-500/20 active:scale-95 transition-all cursor-pointer"
              >
                <span>🥛 +250ml</span>
              </button>
              <button 
                onClick={() => handleDrinkClick(350)}
                className="flex items-center gap-1 text-[10px] font-medium bg-sky-500/10 border border-sky-500/20 text-sky-300 rounded-xl px-2.5 py-1.5 hover:bg-sky-500/20 active:scale-95 transition-all cursor-pointer"
              >
                <span>🥤 +350ml</span>
              </button>
              <button 
                onClick={() => handleDrinkClick(500)}
                className="flex items-center gap-1 text-[10px] font-medium bg-teal-500/10 border border-teal-500/20 text-teal-300 rounded-xl px-2.5 py-1.5 hover:bg-teal-500/20 active:scale-95 transition-all cursor-pointer"
              >
                <span>💧 +500ml</span>
              </button>
              <button 
                onClick={() => handleDrinkClick(750)}
                className="flex items-center gap-1 text-[10px] font-medium bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 rounded-xl px-2.5 py-1.5 hover:bg-indigo-500/20 active:scale-95 transition-all cursor-pointer"
              >
                <span>🏺 +750ml</span>
              </button>
              <button 
                onClick={() => handleDrinkClick(1000)}
                className="flex items-center gap-1 text-[10px] font-medium bg-violet-500/10 border border-violet-500/20 text-violet-300 rounded-xl px-2.5 py-1.5 hover:bg-violet-500/20 active:scale-95 transition-all cursor-pointer"
              >
                <span>🫙 +1L</span>
              </button>
            </div>
          </div>

          {/* Fun comparison / motivational message */}
          <div className="mt-2.5 text-center relative z-10">
            <p className="text-[9.5px] italic text-slate-400">{comparisonText}</p>
          </div>
        </div>

        {/* Search & View Toolbar */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex-1 relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm ảnh theo chú thích, ngày..."
              className="w-full bg-white/[0.03] border border-white/5 rounded-xl py-2 pl-8 pr-3 text-[11px] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-[#c5a059]/40 transition-all"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <button
            onClick={() => setViewMode(viewMode === 'grid' ? 'photobook' : 'grid')}
            className="p-2 rounded-xl bg-white/[0.03] border border-white/5 hover:border-[#c5a059]/30 text-slate-400 hover:text-[#c5a059] transition-all"
            title={viewMode === 'grid' ? 'Chuyển sang Photobook' : 'Chuyển sang Grid'}
          >
            {viewMode === 'grid' ? <Book className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
          </button>
        </div>

        {photos.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 py-24">
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 4, repeat: Infinity }}
              className="w-16 h-16 rounded-full border border-white/5 flex items-center justify-center mb-4 bg-white/[0.01] text-slate-500"
            >
              <Camera className="w-7 h-7 text-[#c5a059]/60" />
            </motion.div>
            <h4 className="font-medium text-sm text-slate-200">Kho kỷ niệm trống</h4>
            <p className="text-xs max-w-[240px] mt-2 leading-relaxed">
              Chia sẻ những khoảnh khắc đời thường, hình locket bí mật hay ảnh từ Google Photos an toàn 100%.
            </p>
          </div>
        ) : (
          (() => {
            const filteredPhotos = searchQuery
              ? photos.filter(photo => {
                  const d = decryptedImages[photo.id];
                  const captionMatch = d?.caption?.toLowerCase().includes(searchQuery.toLowerCase());
                  const dateMatch = new Date(photo.timestamp).toLocaleDateString().includes(searchQuery);
                  const senderMatch = (photo.senderId === 'A' ? partnerA.name : partnerB.name).toLowerCase().includes(searchQuery.toLowerCase());
                  return captionMatch || dateMatch || senderMatch;
                })
              : photos;
            if (filteredPhotos.length === 0) {
              return (
                <div className="text-center py-16 text-slate-500">
                  <Search className="w-8 h-8 mx-auto mb-3 text-slate-600" />
                  <p className="text-[11px]">Không tìm thấy ảnh phù hợp</p>
                </div>
              );
            }
            if (viewMode === 'photobook') {
              const groupedByDate: Record<string, EncryptedPhoto[]> = {};
              for (const p of filteredPhotos) {
                const d = new Date(p.timestamp).toDateString();
                if (!groupedByDate[d]) groupedByDate[d] = [];
                groupedByDate[d].push(p);
              }
              return (
                <div className="space-y-6">
                  {Object.entries(groupedByDate).sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime()).map(([dateStr, datePhotos]) => (
                    <div key={dateStr}>
                      <div className="flex items-center gap-2 mb-2.5">
                        <div className="h-px flex-1 bg-white/5" />
                        <span className="text-[9px] font-mono text-slate-500 shrink-0 px-2">{dateStr}</span>
                        <div className="h-px flex-1 bg-white/5" />
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {datePhotos.sort((a, b) => b.timestamp - a.timestamp).map(photo => {
                          const isSender = photo.senderId === activePartner;
                          const decrypted = decryptedImages[photo.id];
                          const sender = photo.senderId === 'A' ? partnerA : partnerB;
                          return (
                            <motion.div
                              key={photo.id}
                              whileHover={{ y: -2 }}
                              onClick={() => handleViewPhoto(photo)}
                              className="relative aspect-square rounded-xl overflow-hidden bg-black border border-white/5 shadow-sm cursor-pointer group"
                            >
                              {decrypted && decrypted.src !== 'LOCKED_DRIVE' && !(photo.isViewOnce && !isSender) ? (
                                <img src={decrypted.src} alt="" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                              ) : (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                                  <Lock className="w-5 h-5 text-slate-500" />
                                </div>
                              )}
                              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                                {decrypted?.caption && <p className="text-[9px] text-slate-200 truncate">{decrypted.caption}</p>}
                                <p className="text-[7px] text-slate-500 font-mono">{sender.name}</p>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              );
            }
            return (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
                {filteredPhotos.map(photo => {
                  const isSender = photo.senderId === activePartner;
                  const decrypted = decryptedImages[photo.id];
                  const sender = photo.senderId === 'A' ? partnerA : partnerB;

                  return (
                    <motion.div
                      key={photo.id}
                      whileHover={{ y: -3 }}
                      onClick={() => handleViewPhoto(photo)}
                      className="relative aspect-square rounded-2xl overflow-hidden bg-black border border-white/5 shadow-md cursor-pointer group"
                    >
                      {decrypted ? (
                        <>
                          {decrypted.src === 'LOCKED_DRIVE' ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black p-4 text-center">
                              <HardDrive className="w-8 h-8 text-[#c5a059] mb-2 animate-bounce" />
                              <span className="text-[11px] font-medium text-slate-100">Cần Google Drive</span>
                              <span className="text-[9px] text-[#c5a059]/60 mt-1">Đăng nhập Google để xem</span>
                            </div>
                          ) : photo.isViewOnce && !isSender ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black p-4 text-center">
                              <Clock className="w-8 h-8 text-[#c5a059] mb-2 animate-pulse" />
                              <span className="text-[11px] font-medium text-slate-100">Ảnh xem 1 lần</span>
                              <span className="text-[9px] text-slate-400 mt-1">Gửi bởi {sender.name}</span>
                            </div>
                          ) : (
                            <img
                              src={decrypted.src}
                              alt="Encrypted Memory"
                              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                              referrerPolicy="no-referrer"
                            />
                          )}

                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/30 to-transparent p-2.5 flex items-end justify-between">
                            <div className="overflow-hidden pr-2">
                              {decrypted.caption && (
                                <p className="text-[11px] font-medium truncate text-slate-200">{decrypted.caption}</p>
                              )}
                              <p className="text-[9px] text-slate-500 font-mono">Gửi bởi {sender.name}</p>
                            </div>
                            {photo.isViewOnce && (
                              <span className="shrink-0 bg-[#c5a059]/20 text-[#ebd4b3] border border-[#c5a059]/30 text-[8px] px-1.5 py-0.5 rounded font-mono uppercase">
                                1 LẦN
                              </span>
                            )}
                          </div>
                        </>
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black">
                          <Lock className="w-5 h-5 text-slate-600 animate-pulse" />
                          <span className="text-[10px] text-slate-500 mt-1 font-mono">Đang giải mã...</span>
                        </div>
                      )}

                      {isSender && (
                        <button
                          onClick={e => { e.stopPropagation(); onDeletePhoto(photo.id); }}
                          className="absolute top-2.5 right-2.5 p-1.5 rounded-full bg-black/70 border border-white/10 text-slate-400 hover:text-red-400 hover:bg-black opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            );
          })()
        )}
      </div>

      {/* Floating action button: Add Photo */}
      <div className="absolute bottom-4 right-4 z-10">
        <button
          onClick={() => {
            setSelectedFile(null);
            setModalFlowStep('main_choice');
            setIsModalOpen(true);
          }}
          className="w-11 h-11 rounded-full bg-[#c5a059] flex items-center justify-center text-black hover:bg-[#b08b47] shadow-lg active:scale-95 transition-all cursor-pointer"
        >
          <Camera className="w-5 h-5" />
        </button>
      </div>

      {/* Modal: Select and Upload Photo */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 bg-black/95 backdrop-blur-md flex flex-col p-5 overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4 shrink-0">
              <div className="flex items-center gap-2">
                {modalFlowStep !== 'main_choice' && !selectedFile && (
                  <button
                    onClick={handleBack}
                    className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-[#c5a059] hover:text-slate-100 transition-colors cursor-pointer mr-1"
                    title="Quay lại bước trước"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                )}
                <h3 className="text-sm font-medium text-slate-100 flex items-center gap-2">
                  <Camera className="w-5 h-5 text-[#c5a059]" />
                  <span className="uppercase tracking-wider text-xs">Chia sẻ Khoảnh khắc</span>
                </h3>
              </div>
              <button
                onClick={() => {
                  stopCamera();
                  setIsModalOpen(false);
                  setSelectedFile(null);
                  setCaption('');
                  setIsViewOnce(false);
                }}
                className="p-1.5 rounded-full bg-white/5 border border-white/10 text-slate-400 hover:text-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Selection Stage */}
            {!selectedFile ? (
              <div className="flex-1 flex flex-col min-h-0 space-y-4 justify-center">
                {modalFlowStep === 'main_choice' && (
                  <div className="space-y-6 py-6 my-auto max-w-md mx-auto w-full">
                    <div className="text-center space-y-1.5 mb-2">
                      <h4 className="text-xs font-semibold text-[#c5a059] uppercase tracking-widest font-mono">BẮT TRỌN KỶ NIỆM CHUNG</h4>
                      <p className="text-[10.5px] text-slate-400 font-sans font-medium">Chọn phương thức chụp ảnh mới hoặc tải tệp lên từ các nguồn</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {/* Chụp ảnh mới */}
                      <button
                        onClick={() => {
                          setModalFlowStep('camera_flow');
                        }}
                        className="bg-white/[0.01] hover:bg-white/[0.03] border border-white/5 hover:border-[#c5a059]/40 rounded-2xl p-6 flex flex-col items-center justify-center text-center gap-3 transition-all group cursor-pointer"
                      >
                        <div className="w-12 h-12 rounded-full bg-[#c5a059]/10 flex items-center justify-center text-[#c5a059] group-hover:scale-110 transition-transform">
                          <Camera className="w-5.5 h-5.5" />
                        </div>
                        <div>
                          <h5 className="text-xs font-semibold text-slate-200">Chụp ảnh mới</h5>
                          <p className="text-[9.5px] text-slate-500 mt-1 leading-normal font-sans">Sử dụng webcam hoặc chụp thử locket cute</p>
                        </div>
                      </button>

                      {/* Tải tệp có sẵn */}
                      <button
                        onClick={() => {
                          setModalFlowStep('upload_choice');
                        }}
                        className="bg-white/[0.01] hover:bg-white/[0.03] border border-white/5 hover:border-[#c5a059]/40 rounded-2xl p-6 flex flex-col items-center justify-center text-center gap-3 transition-all group cursor-pointer"
                      >
                        <div className="w-12 h-12 rounded-full bg-[#ebd4b3]/10 flex items-center justify-center text-[#ebd4b3] group-hover:scale-110 transition-transform">
                          <UploadCloud className="w-5.5 h-5.5" />
                        </div>
                        <div>
                          <h5 className="text-xs font-semibold text-slate-200">Tải tệp lên</h5>
                          <p className="text-[9.5px] text-slate-500 mt-1 leading-normal font-sans">Chọn ảnh từ thư viện, Google Drive hoặc Photos</p>
                        </div>
                      </button>
                    </div>
                  </div>
                )}

                {modalFlowStep === 'upload_choice' && (
                  <div className="space-y-6 py-6 my-auto max-w-lg mx-auto w-full">
                    <div className="text-center space-y-1.5 mb-2">
                      <h4 className="text-xs font-semibold text-[#c5a059] uppercase tracking-widest font-mono">CHỌN NGUỒN TẢI LÊN</h4>
                      <p className="text-[10.5px] text-slate-400 font-sans font-medium">Chọn nguồn dữ liệu chứa bức ảnh kỷ niệm của hai bạn</p>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {/* Thư viện thiết bị */}
                      <button
                        onClick={() => {
                          setModalFlowStep('device_flow');
                        }}
                        className="bg-white/[0.01] hover:bg-white/[0.03] border border-white/5 hover:border-[#c5a059]/30 rounded-2xl p-5 flex flex-col items-center text-center gap-3 transition-all group cursor-pointer"
                      >
                        <div className="w-11 h-11 rounded-full bg-slate-900 border border-white/5 flex items-center justify-center text-[#ebd4b3] group-hover:scale-105 transition-all">
                          <Laptop className="w-5 h-5" />
                        </div>
                        <div>
                          <h5 className="text-[11.5px] font-semibold text-slate-200">Thư viện máy</h5>
                          <p className="text-[8.5px] text-slate-500 mt-1 leading-normal font-sans">Ảnh chụp thiết bị</p>
                        </div>
                      </button>

                      {/* Google Drive */}
                      <button
                        onClick={() => {
                          setModalFlowStep('drive_flow');
                        }}
                        className="bg-white/[0.01] hover:bg-white/[0.03] border border-white/5 hover:border-[#c5a059]/30 rounded-2xl p-5 flex flex-col items-center text-center gap-3 transition-all group cursor-pointer"
                      >
                        <div className="w-11 h-11 rounded-full bg-slate-900 border border-white/5 flex items-center justify-center text-amber-500 group-hover:scale-105 transition-all">
                          <HardDrive className="w-5 h-5" />
                        </div>
                        <div>
                          <h5 className="text-[11.5px] font-semibold text-slate-200 font-sans">Google Drive</h5>
                          <p className="text-[8.5px] text-slate-500 mt-1 leading-normal font-sans">Ổ lưu trữ đám mây</p>
                        </div>
                      </button>

                      {/* Google Photos */}
                      <button
                        onClick={() => {
                          setModalFlowStep('photos_flow');
                        }}
                        className="bg-white/[0.01] hover:bg-white/[0.03] border border-white/5 hover:border-[#c5a059]/30 rounded-2xl p-5 flex flex-col items-center text-center gap-3 transition-all group cursor-pointer"
                      >
                        <div className="w-11 h-11 rounded-full bg-slate-900 border border-white/5 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-all">
                          <ImageIcon className="w-5 h-5" />
                        </div>
                        <div>
                          <h5 className="text-[11.5px] font-semibold text-slate-200 font-sans">Google Photos</h5>
                          <p className="text-[8.5px] text-slate-500 mt-1 leading-normal font-sans">Album kỷ niệm</p>
                        </div>
                      </button>
                    </div>
                  </div>
                )}

                {/* Flow contents */}
                {modalFlowStep !== 'main_choice' && modalFlowStep !== 'upload_choice' && (
                  <div className="flex-1 overflow-y-auto min-h-0">
                    {modalFlowStep === 'device_flow' && (
                      <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={`h-[280px] border-2 border-dashed rounded-2xl flex flex-col items-center justify-center p-6 text-center transition-all ${
                          isDragging
                            ? 'border-[#c5a059] bg-[#c5a059]/5'
                            : 'border-white/5 bg-white/[0.01] hover:border-white/10 hover:bg-white/[0.02]'
                        }`}
                      >
                        <UploadCloud className="w-10 h-10 text-[#c5a059]/60 mb-3" />
                        <h4 className="font-medium text-xs text-slate-300">Chọn hoặc thả ảnh thiết bị</h4>
                        <p className="text-[10px] text-slate-500 mt-1 max-w-[180px] leading-relaxed">
                          Hệ thống sẽ mã hóa E2EE cục bộ an toàn trước khi gửi.
                        </p>
                        <label className="mt-5 px-4 py-2 bg-[#c5a059] hover:bg-[#b08b47] text-black text-[10px] font-semibold rounded-full cursor-pointer transition-colors shadow-sm">
                          Duyệt file hình ảnh
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleFileChange}
                            className="hidden"
                          />
                        </label>
                      </div>
                    )}

                    {modalFlowStep === 'camera_flow' && (
                      <div className="border border-white/5 bg-white/[0.01] rounded-2xl p-4 flex flex-col items-center justify-center space-y-4 min-h-[280px]">
                        {cameraError ? (
                          <div className="text-center p-4 space-y-3">
                            <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto animate-pulse" />
                            <h4 className="text-xs font-semibold text-slate-200">Không thể truy cập camera thực</h4>
                            <p className="text-[10px] text-slate-400 leading-relaxed max-w-[220px]">
                              Trình duyệt chặn webcam trong iFrame. Bạn có thể sử dụng **Selfie Simulator** (Ảnh chụp cặp đôi siêu cute) dưới đây để trải nghiệm!
                            </p>
                            <div className="grid grid-cols-2 gap-2 pt-2">
                              {ROMANTIC_PRESETS.map((preset, idx) => (
                                <button
                                  key={preset.id}
                                  onClick={() => setSelectedFile(preset.url)}
                                  className="border border-white/5 bg-black/40 hover:bg-[#c5a059]/10 rounded-xl overflow-hidden aspect-video relative group cursor-pointer"
                                >
                                  <img src={preset.url} alt="preset" className="w-full h-full object-cover opacity-60" />
                                  <span className="absolute bottom-1 inset-x-1 text-[8px] text-slate-300 truncate text-center font-semibold group-hover:text-[#ebd4b3]">
                                    Cute Selfie {idx + 1}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="w-full flex flex-col items-center space-y-3">
                            <div className="aspect-square w-full max-w-[220px] rounded-xl overflow-hidden border border-[#c5a059]/30 bg-black relative">
                              <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                muted
                                className="w-full h-full object-cover scale-x-[-1]"
                                style={{ filter: FILTER_PRESETS.find(f => f.id === currentFilter)?.cssFilter }}
                              />
                              <canvas ref={canvasRef} className="hidden" />
                              <div className="absolute bottom-2 left-2 bg-black/60 text-[8px] text-white px-2 py-0.5 rounded-full font-mono">
                                {FILTER_PRESETS.find(f => f.id === currentFilter)?.label}
                              </div>
                            </div>

                            {/* Filter selector */}
                            <div className="flex gap-1.5 flex-wrap justify-center max-w-[260px]">
                              {FILTER_PRESETS.map(f => (
                                <button
                                  key={f.id}
                                  onClick={() => setCurrentFilter(f.id)}
                                  className={`px-2.5 py-1 rounded-full text-[9px] font-medium transition-all cursor-pointer ${
                                    currentFilter === f.id
                                      ? 'bg-[#c5a059] text-black'
                                      : 'bg-white/5 text-slate-400 hover:text-slate-200 border border-white/10'
                                  }`}
                                >
                                  <Filter className="w-2.5 h-2.5 inline mr-1" />
                                  {f.label}
                                </button>
                              ))}
                            </div>

                            <div className="flex gap-2">
                              <button
                                onClick={takeSnapshot}
                                className="bg-[#c5a059] hover:bg-[#b08b47] text-black font-semibold text-xs py-2 px-5 rounded-full shadow-md flex items-center gap-1.5 cursor-pointer"
                              >
                                <Camera className="w-4 h-4" />
                                <span>Chụp ảnh</span>
                              </button>
                              <button
                                onClick={takeAndSendSnapshot}
                                className="bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs py-2 px-5 rounded-full shadow-md flex items-center gap-1.5 cursor-pointer"
                              >
                                <UploadCloud className="w-4 h-4" />
                                <span>Chụp & Gửi</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {modalFlowStep === 'drive_flow' && (
                      <div className="space-y-3">
                        {!googleToken ? (
                          <div className="border border-white/5 bg-white/[0.01] rounded-2xl p-6 text-center space-y-4">
                            <HardDrive className="w-10 h-10 text-[#c5a059]/60 mx-auto" />
                            <div className="space-y-1">
                              <h4 className="text-xs font-semibold text-slate-200">Kết nối Google Drive cá nhân</h4>
                              <p className="text-[10px] text-slate-400 max-w-[240px] mx-auto leading-relaxed">
                                Đăng nhập để duyệt tìm ảnh kỉ niệm hoặc quản lý, mở trực tiếp các tài liệu học tập, hợp đồng của hai bạn từ Drive.
                              </p>
                            </div>
                            <button
                              onClick={handleConnectGoogle}
                              className="mx-auto bg-[#c5a059] hover:bg-[#b08b47] text-black text-[10px] font-semibold py-2 px-4 rounded-full flex items-center gap-1.5 cursor-pointer"
                            >
                              <LogIn className="w-3.5 h-3.5" />
                              <span>Đăng nhập Google</span>
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {/* Sub-type selectors */}
                            <div className="flex border-b border-white/5 gap-4">
                              <button
                                onClick={() => setDriveType('images')}
                                className={`text-[11px] pb-1.5 font-medium relative ${
                                  driveType === 'images' ? 'text-[#c5a059]' : 'text-slate-500'
                                }`}
                              >
                                Hình ảnh
                                {driveType === 'images' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#c5a059]" />}
                              </button>
                              <button
                                onClick={() => setDriveType('documents')}
                                className={`text-[11px] pb-1.5 font-medium relative ${
                                  driveType === 'documents' ? 'text-[#c5a059]' : 'text-slate-500'
                                }`}
                              >
                                Tài liệu & Hợp đồng
                                {driveType === 'documents' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#c5a059]" />}
                              </button>
                            </div>

                            {/* Render files list */}
                            {isLoadingGoogle ? (
                              <div className="py-12 flex flex-col items-center justify-center space-y-2">
                                <RefreshCw className="w-5 h-5 text-[#c5a059] animate-spin" />
                                <span className="text-[10px] text-slate-500 font-mono">Đang tìm kiếm Drive...</span>
                              </div>
                            ) : googleError ? (
                              <div className="text-center py-6 text-slate-500 text-[10px] space-y-2">
                                <AlertTriangle className="w-5 h-5 text-amber-500 mx-auto" />
                                <p>{googleError}</p>
                                <button onClick={loadDriveFiles} className="text-[#c5a059] underline">Thử lại</button>
                              </div>
                            ) : driveFiles.length === 0 ? (
                              <p className="text-center py-10 text-[10px] text-slate-500 font-sans">Không tìm thấy tệp phù hợp trên Drive của bạn.</p>
                            ) : driveType === 'images' ? (
                              <div className="grid grid-cols-3 gap-2">
                                {driveFiles.map(file => (
                                  <button
                                    key={file.id}
                                    onClick={() => handleSelectGoogleImage(file.webContentLink || file.thumbnailLink || '')}
                                    className="aspect-square border border-white/5 rounded-xl bg-black overflow-hidden relative group cursor-pointer"
                                  >
                                    {file.thumbnailLink ? (
                                      <img src={file.thumbnailLink} alt={file.name} className="w-full h-full object-cover" />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center text-slate-600">
                                        <ImageIcon className="w-5 h-5" />
                                      </div>
                                    )}
                                    <div className="absolute inset-x-0 bottom-0 bg-black/60 p-1 truncate text-[7.5px] text-slate-300">
                                      {file.name}
                                    </div>
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <div className="space-y-1.5">
                                {driveFiles.map(file => (
                                  <div
                                    key={file.id}
                                    className="bg-white/[0.01] hover:bg-white/[0.03] border border-white/5 rounded-xl p-3 flex items-center justify-between"
                                  >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      <FileText className="w-5 h-5 text-[#c5a059] shrink-0" />
                                      <div className="min-w-0">
                                        <h5 className="text-[11px] font-semibold text-slate-200 truncate">{file.name}</h5>
                                        <p className="text-[8.5px] text-slate-500 font-mono">Type: {file.mimeType.split('/').pop()}</p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <button
                                        onClick={() => handlePreviewDocument(file)}
                                        className="p-1.5 rounded-lg bg-white/5 hover:bg-[#c5a059]/10 hover:text-[#c5a059] text-slate-400 transition-colors cursor-pointer"
                                        title="Xem trước tài liệu"
                                      >
                                        <Eye className="w-3.5 h-3.5" />
                                      </button>
                                      {file.webViewLink && (
                                        <a
                                          href={file.webViewLink}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 transition-colors"
                                          title="Mở trong Google Drive"
                                        >
                                          <ExternalLink className="w-3.5 h-3.5" />
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {modalFlowStep === 'photos_flow' && (
                      <div className="space-y-3">
                        {!googleToken ? (
                          <div className="border border-white/5 bg-white/[0.01] rounded-2xl p-6 text-center space-y-4">
                            <ImageIcon className="w-10 h-10 text-[#c5a059]/60 mx-auto animate-pulse" />
                            <div className="space-y-1">
                              <h4 className="text-xs font-semibold text-slate-200">Truy xuất Google Photos cá nhân</h4>
                              <p className="text-[10px] text-slate-400 max-w-[240px] mx-auto leading-relaxed">
                                Kết nối tài khoản của bạn để duyệt và tìm kiếm, tải lên các bức ảnh kỉ niệm từ Google Photos của bạn vào không gian chung.
                              </p>
                            </div>
                            <button
                              onClick={handleConnectGoogle}
                              className="mx-auto bg-[#c5a059] hover:bg-[#b08b47] text-black text-[10px] font-semibold py-2 px-4 rounded-full flex items-center gap-1.5 cursor-pointer"
                            >
                              <LogIn className="w-3.5 h-3.5" />
                              <span>Đăng nhập Google</span>
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="bg-[#c5a059]/5 border border-[#c5a059]/10 p-2.5 rounded-xl text-[9px] text-slate-400 leading-normal font-mono flex items-start gap-1.5">
                              <UserCheck className="w-4 h-4 text-[#c5a059] shrink-0 mt-0.5" />
                              <span>Đã kết nối tài khoản Google Photos an toàn! Nếu tài khoản chưa kích hoạt Photos API, bạn có thể tải các bức ảnh kỉ niệm được đề xuất bên dưới.</span>
                            </div>

                            {isLoadingGoogle ? (
                              <div className="py-12 flex flex-col items-center justify-center space-y-2">
                                <RefreshCw className="w-5 h-5 text-[#c5a059] animate-spin" />
                                <span className="text-[10px] text-slate-500 font-mono">Đang đồng bộ Google Photos...</span>
                              </div>
                            ) : (
                              <div>
                                {photosItems.length > 0 ? (
                                  <div className="grid grid-cols-3 gap-2">
                                    {photosItems.map(item => (
                                      <button
                                        key={item.id}
                                        onClick={() => handleSelectGoogleImage(item.baseUrl)}
                                        className="aspect-square border border-white/5 rounded-xl bg-black overflow-hidden relative cursor-pointer"
                                      >
                                        <img src={item.baseUrl} alt="Google Photo" className="w-full h-full object-cover" />
                                      </button>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="space-y-3">
                                    <h4 className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">HÌNH ẢNH CỦA HAI BẠN</h4>
                                    <div className="grid grid-cols-2 gap-3">
                                      {ROMANTIC_PRESETS.map(preset => (
                                        <button
                                          key={preset.id}
                                          onClick={() => handleSelectGoogleImage(preset.url)}
                                          className="aspect-video border border-white/5 rounded-xl bg-black overflow-hidden relative group cursor-pointer shadow"
                                        >
                                          <img src={preset.url} alt={preset.name} className="w-full h-full object-cover" />
                                          <div className="absolute inset-x-0 bottom-0 bg-black/60 p-1.5 truncate text-[8px] text-slate-300 font-semibold text-center">
                                            {preset.name}
                                          </div>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* Customization Stage */
              <div className="flex-1 flex flex-col justify-between space-y-4 min-h-0">
                <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                  {/* Photo Preview */}
                  <div className="aspect-square w-full max-w-[200px] mx-auto rounded-2xl overflow-hidden border border-white/10 bg-black relative shadow-lg">
                    <img src={selectedFile} alt="Preview" className="w-full h-full object-cover" />
                    <button
                      onClick={() => setSelectedFile(null)}
                      className="absolute top-2 right-2 p-1.5 rounded-full bg-black/70 hover:bg-black text-slate-300 hover:text-slate-100 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Caption input */}
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-mono text-slate-400 tracking-wider">CHÚ THÍCH HÌNH ẢNH (MÃ HÓA E2EE)</label>
                    <input
                      type="text"
                      value={caption}
                      onChange={e => setCaption(e.target.value)}
                      placeholder="Lời muốn nói... (Ví dụ: Chụp lúc đi ăn tối)"
                      className="w-full bg-white/[0.02] border border-white/5 rounded-xl py-3 px-4 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-[#c5a059]/50"
                    />
                  </div>

                  {/* LIVE REAL-TIME E2EE ENCRYPTION SANDBOX */}
                  <div className="border border-[#c5a059]/20 bg-[#c5a059]/5 rounded-2xl p-4 space-y-3.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-[#c5a059]">
                        <Binary className="w-4 h-4 animate-pulse" />
                        <h4 className="text-[10px] font-bold uppercase tracking-wider font-mono">Bảng mô phỏng Mã hóa E2EE cục bộ</h4>
                      </div>
                      <span className="text-[8px] bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider animate-pulse flex items-center gap-1">
                        <span className="w-1 h-1 rounded-full bg-emerald-400" /> Cục bộ thiết bị
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {/* Left side: Symmetric Key */}
                      <div className="bg-black/60 border border-white/5 p-2.5 rounded-xl space-y-1">
                        <span className="text-[8px] text-slate-400 font-mono flex items-center gap-1">
                          <Key className="w-3 h-3 text-[#c5a059]" /> Khóa đối xứng AES-GCM
                        </span>
                        <div className="text-[9px] font-mono text-slate-200 truncate bg-white/5 p-1 rounded border border-white/5" title={symmetricKeyHex}>
                          {symmetricKeyHex.substring(0, 16)}...
                        </div>
                        <p className="text-[7.5px] text-slate-500 leading-normal font-sans">
                          Mỗi cuộc trò chuyện cặp đôi được bảo mật riêng bằng một cặp khóa phân sinh.
                        </p>
                      </div>

                      {/* Right side: Plaintext */}
                      <div className="bg-black/60 border border-white/5 p-2.5 rounded-xl space-y-1">
                        <span className="text-[8px] text-slate-400 font-mono">Plaintext (Văn bản gốc)</span>
                        <div className="text-[9px] font-sans text-[#ebd4b3] truncate bg-white/5 p-1 rounded border border-white/5">
                          {caption.trim() ? caption : 'Kỷ niệm Locket ngọt ngào...'}
                        </div>
                        <p className="text-[7.5px] text-slate-500 leading-normal font-sans">
                          Dữ liệu dạng thô do bạn gõ trước khi mã hóa.
                        </p>
                      </div>
                    </div>

                    {/* Ciphertext representation */}
                    <div className="bg-black/80 border border-white/5 p-3 rounded-xl space-y-1.5 font-mono">
                      <div className="flex items-center justify-between text-[8px] text-slate-400">
                        <span>AES Ciphertext (Dữ liệu mã hóa sẽ gửi lên server)</span>
                        {liveIv && <span className="text-amber-500">IV: {liveIv.substring(0, 8)}...</span>}
                      </div>
                      <div className="bg-slate-900/40 border border-white/5 p-2 rounded text-[9.5px] text-emerald-400 break-all leading-normal max-h-[80px] overflow-y-auto select-all">
                        {liveCiphertext || 'Đang băm dữ liệu...'}
                      </div>
                      <div className="text-[7.5px] text-slate-500 leading-normal font-sans">
                        🔒 **Nguyên lý**: Server hoàn toàn chỉ nhận chuỗi vô nghĩa này. Kể cả admin server hay hacker can thiệp đường truyền cũng không thể giải mã nếu không có khóa riêng ở thiết bị đối tác của bạn.
                      </div>
                    </div>
                  </div>

                  {/* View Once Option Toggle */}
                  <div className="flex items-center justify-between p-3.5 bg-white/[0.01] border border-white/5 rounded-2xl">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#c5a059]/10 flex items-center justify-center text-[#c5a059] shrink-0">
                        <Clock className="w-4 h-4" />
                      </div>
                      <div>
                        <h5 className="text-xs font-medium text-slate-100">Hình ảnh Xem một lần</h5>
                        <p className="text-[9px] text-slate-500 mt-0.5">Sẽ bị xóa khỏi server ngay sau khi người ấy mở</p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isViewOnce}
                        onChange={e => setIsViewOnce(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-300 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#c5a059] peer-checked:after:bg-slate-100" />
                    </label>
                  </div>

                  {googleToken && storageHelper.getItem<string>(`storage_method_${activePartner}`, 'p2p') === 'googledrive' && (
                    <div className="bg-emerald-500/5 border border-emerald-500/10 p-3 rounded-2xl flex items-center gap-2.5 text-[9px] text-emerald-400 font-mono">
                      <HardDrive className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Sao lưu tự động bản gốc mã hóa an toàn lên Google Drive được kích hoạt</span>
                    </div>
                  )}
                </div>

                {/* Submit bar */}
                <button
                  onClick={handleUploadSubmit}
                  disabled={isUploading}
                  className="w-full bg-[#c5a059] hover:bg-[#b08b47] text-black py-3 rounded-xl font-semibold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0"
                >
                  {isUploading ? (
                    <>
                      <Lock className="w-4 h-4 animate-spin" />
                      <span>Đang mã hóa & Tải lên...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>Mã hóa & Đăng lên kho chung</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ephemeral Lightbox View Screen */}
      <AnimatePresence>
        {activePhotoView && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-black flex flex-col justify-between"
            onClick={handleCloseViewer}
          >
            {/* Top Close bar */}
            <div className="p-4 flex items-center justify-between border-b border-white/5 bg-white/[0.01]">
              <div className="flex items-center gap-2 text-[10px] font-mono text-[#c5a059]">
                <ShieldCheck className="w-4 h-4" />
                <span>GIẢI MÃ SỬ DỤNG KHÓA AES-GCM 256-BIT CỤC BỘ</span>
              </div>
              <button
                onClick={handleCloseViewer}
                className="p-1.5 rounded-full bg-white/5 border border-white/10 text-slate-300 hover:text-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Main Picture viewport */}
            <div className="flex-1 flex flex-col items-center justify-center p-4">
              <div className="relative max-w-full max-h-[70vh] rounded-2xl overflow-hidden border border-white/5 shadow-xl bg-black">
                {decryptedImages[activePhotoView.id] ? (
                  <img
                    src={decryptedImages[activePhotoView.id].src}
                    alt="Lightbox view"
                    className="max-w-full max-h-[70vh] object-contain"
                  />
                ) : (
                  <div className="w-64 h-64 flex items-center justify-center">
                    <Lock className="w-8 h-8 text-slate-600 animate-spin" />
                  </div>
                )}

                {activePhotoView.isViewOnce && activePhotoView.senderId !== activePartner && (
                  <div className="absolute top-3 left-3 bg-red-600/90 text-white font-mono text-[9px] px-2.5 py-1 rounded-full uppercase flex items-center gap-1">
                    <Clock className="w-3 h-3 animate-spin" />
                    <span>ẢNH ĐÃ TỰ HỦY TRÊN SERVER</span>
                  </div>
                )}
              </div>

              {/* Caption Card */}
              {decryptedImages[activePhotoView.id]?.caption && (
                <div className="mt-4 bg-white/[0.02] border border-white/5 p-4 rounded-2xl max-w-xs text-center space-y-2">
                  <p className="text-xs text-slate-200 font-sans italic">
                    "{decryptedImages[activePhotoView.id].caption}"
                  </p>

                  {/* Live Decryption Feedback Panel */}
                  <div className="border-t border-white/5 pt-2 mt-2 space-y-1.5 text-left font-mono">
                    <span className="text-[8px] text-[#c5a059] uppercase tracking-wider block font-bold">🔒 TIẾN TRÌNH GIẢI MÃ E2EE THÀNH CÔNG</span>
                    <div className="grid grid-cols-2 gap-1.5 text-[8px] text-slate-400">
                      <div>
                        <span className="text-[7px] text-slate-500 block uppercase">Bản mã nhận về</span>
                        <div className="truncate bg-black/40 p-1.5 rounded border border-white/5 text-[7px]">
                          {activePhotoView.captionCiphertext?.substring(0, 16) ?? 'N/A'}...
                        </div>
                      </div>
                      <div>
                        <span className="text-[7px] text-slate-500 block uppercase">Khóa đối xứng local</span>
                        <div className="truncate bg-black/40 p-1.5 rounded border border-white/5 text-[7px] text-[#ebd4b3]">
                          {symmetricKeyHex.substring(0, 12)}...
                        </div>
                      </div>
                    </div>
                    <div className="text-[7.5px] text-emerald-400 leading-tight font-sans">
                      ✓ Giải mã hoàn tất! Bản mã thô đã được chuyển đổi ngược thành văn bản gốc thành công.
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom info section */}
            <div className="p-5 border-t border-white/5 bg-white/[0.01] text-center space-y-2 select-none">
              <p className="text-xs font-medium text-slate-300 font-sans">
                Gửi bởi {activePhotoView.senderId === 'A' ? partnerA.name : partnerB.name}
              </p>
              <p className="text-[10px] text-slate-500 font-mono">
                {new Date(activePhotoView.timestamp).toLocaleString()}
              </p>
              {activePhotoView.isViewOnce && (
                <p className="text-[9px] text-[#c5a059] font-medium font-mono uppercase tracking-wider mt-1.5 animate-pulse">
                  ⚠️ Sau khi tắt màn hình này, ảnh sẽ biến mất mãi mãi!
                </p>
              )}
              {decryptedImages[activePhotoView.id]?.src && decryptedImages[activePhotoView.id].src !== 'LOCKED_DRIVE' && !activePhotoView.isViewOnce && (
                <button
                  onClick={e => {
                    e.stopPropagation();
                    downloadAsPng(decryptedImages[activePhotoView.id].src, `Duo_${activePhotoView.senderId}_${new Date(activePhotoView.timestamp).toISOString().split('T')[0]}.png`);
                  }}
                  className="inline-flex items-center gap-1.5 bg-white/5 hover:bg-[#c5a059]/15 border border-white/10 hover:border-[#c5a059]/30 text-slate-400 hover:text-[#c5a059] text-[10px] px-3 py-1.5 rounded-full transition-all cursor-pointer"
                >
                  <Download className="w-3 h-3" />
                  <span>Tải xuống PNG</span>
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Google Document Reader Panel */}
      <AnimatePresence>
        {activeDocPreview && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            className="absolute inset-0 z-50 bg-[#060606] flex flex-col p-5"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/5 pb-3.5 mb-4 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-5 h-5 text-[#c5a059]" />
                <div className="min-w-0">
                  <h4 className="text-xs font-semibold text-slate-200 truncate">{activeDocPreview.name}</h4>
                  <span className="text-[9px] font-mono text-slate-500 uppercase">Trình đọc bảo mật Drive</span>
                </div>
              </div>
              <button
                onClick={() => {
                  setActiveDocPreview(null);
                  setDocContent(null);
                }}
                className="p-1.5 rounded-full bg-white/5 border border-white/10 text-slate-400 hover:text-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content view */}
            <div className="flex-1 overflow-y-auto bg-black border border-white/5 rounded-2xl p-4.5 font-mono text-xs text-slate-300 leading-relaxed scrollbar-thin select-text">
              {isLoadingDoc ? (
                <div className="h-full flex flex-col items-center justify-center space-y-2 text-slate-500">
                  <RefreshCw className="w-6 h-6 text-[#c5a059] animate-spin" />
                  <span className="text-[10px]">Đang kết nối tải tài liệu bảo mật...</span>
                </div>
              ) : docContent ? (
                <div className="whitespace-pre-wrap">{docContent}</div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 p-4 space-y-4">
                  <Laptop className="w-10 h-10 text-slate-700" />
                  <p className="text-[10px] leading-relaxed max-w-[200px]">
                    Tài liệu không có nội dung văn bản thô hoặc không hỗ trợ đọc trực tiếp. Bạn có thể mở xem trực tiếp trên Google Drive chính thức.
                  </p>
                  {activeDocPreview.webViewLink && (
                    <a
                      href={activeDocPreview.webViewLink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-black bg-[#c5a059] hover:bg-[#b08b47] px-4 py-2 rounded-full transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Xem trực tiếp trên Drive</span>
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Bottom tools */}
            <div className="mt-4 pt-3.5 border-t border-white/5 flex gap-3 shrink-0">
              <button
                onClick={() => {
                  // We can import the file name & size into active reminders as a planning task!
                  alert(`Đã thêm kế hoạch thảo luận cho tài liệu "${activeDocPreview.name}" vào danh sách Kế hoạch của cặp đôi! ✓`);
                  setActiveDocPreview(null);
                }}
                className="flex-1 bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 py-2.5 rounded-xl text-[10px] font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4 text-emerald-400" />
                <span>Thêm vào Kế hoạch chung</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Verification Choice Modal */}
      {pendingWaterDrink && !isWaterCameraOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-[#0e0e0e] border border-white/10 rounded-2xl p-5 max-w-sm w-full shadow-2xl text-center space-y-4 relative z-50 select-none"
          >
            <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400 mx-auto">
              <Droplet className="w-6 h-6 fill-blue-400/20" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-slate-100 font-sans">{t('water.verify_popup')}</h4>
              <p className="text-xs text-slate-400 leading-relaxed font-sans">
                Bạn muốn xác thực cho lượt uống <span className="font-bold text-blue-400 font-mono">{pendingWaterDrink.amount}ml</span> này không?
              </p>
            </div>
            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={() => {
                  setIsWaterCameraOpen(true);
                  startWaterCamera();
                }}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded-xl py-2.5 text-xs font-semibold active:scale-98 transition-all cursor-pointer font-sans"
              >
                {t('water.verify_photo')}
              </button>
              <button
                onClick={() => {
                  handleDrink(pendingWaterDrink.amount);
                  setPendingWaterDrink(null);
                }}
                className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 rounded-xl py-2.5 text-xs font-semibold active:scale-98 transition-all cursor-pointer font-sans"
              >
                {t('water.verify_fast')}
              </button>
              <button
                onClick={() => setPendingWaterDrink(null)}
                className="w-full text-xs font-medium text-slate-500 hover:text-slate-350 py-1 transition-colors cursor-pointer font-sans"
              >
                {t('security.cancel')}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Water Camera Modal */}
      {isWaterCameraOpen && pendingWaterDrink && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black p-4 md:p-6 select-none">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Droplet className="w-4 h-4 text-blue-400" />
              <span className="text-xs font-semibold text-slate-200 font-sans">{t('water.verify_popup')} - {pendingWaterDrink.amount}ml</span>
            </div>
            <button 
              onClick={() => {
                stopWaterCamera();
                setIsWaterCameraOpen(false);
              }}
              className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center max-w-md mx-auto w-full">
            {waterCameraError ? (
              <div className="text-center p-6 bg-red-950/20 border border-red-950/30 rounded-2xl w-full">
                <p className="text-xs text-red-400 font-sans">Không thể truy cập camera thiết bị.</p>
                <button 
                  onClick={startWaterCamera}
                  className="mt-3 text-xs bg-red-950/40 hover:bg-red-950/60 border border-red-500/20 text-red-300 px-3 py-1.5 rounded-xl transition-all cursor-pointer font-sans"
                >
                  Thử lại
                </button>
              </div>
            ) : (
              <div className="relative aspect-square w-full rounded-2xl overflow-hidden bg-zinc-950 border border-white/5 shadow-inner">
                <video 
                  ref={waterVideoRef}
                  autoPlay 
                  playsInline 
                  muted
                  className="w-full h-full object-cover scale-x-[-1]"
                />
                <div className="absolute inset-0 border-[6px] border-blue-500/25 pointer-events-none rounded-2xl" />
              </div>
            )}

            <div className="w-full grid grid-cols-2 gap-3 mt-6">
              <button
                type="button"
                onClick={() => {
                  stopWaterCamera();
                  setIsWaterCameraOpen(false);
                }}
                className="bg-white/5 hover:bg-white/10 border border-white/10 text-slate-350 rounded-xl py-3 text-xs font-medium active:scale-95 transition-all cursor-pointer text-center font-sans"
              >
                Quay lại
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (waterVideoRef.current && waterCanvasRef.current) {
                    const video = waterVideoRef.current;
                    const canvas = waterCanvasRef.current;
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                      canvas.width = video.videoWidth || 400;
                      canvas.height = video.videoHeight || 400;
                      ctx.translate(canvas.width, 0);
                      ctx.scale(-1, 1);
                      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                      ctx.setTransform(1, 0, 0, 1, 0, 0);
                      
                      const dataUrl = canvas.toDataURL('image/jpeg');
                      stopWaterCamera();
                      setIsWaterCameraOpen(false);
                      
                      await uploadWaterVerificationPhoto(dataUrl, pendingWaterDrink.amount);
                      handleDrink(pendingWaterDrink.amount);
                      setPendingWaterDrink(null);
                    }
                  }
                }}
                disabled={waterCameraError || !waterCameraStream}
                className="bg-blue-650 hover:bg-blue-550 disabled:opacity-40 disabled:hover:bg-blue-650 text-white rounded-xl py-3 text-xs font-semibold active:scale-95 transition-all cursor-pointer text-center font-sans"
              >
                Chụp ảnh 📸
              </button>
            </div>
          </div>
          <canvas ref={waterCanvasRef} className="hidden" />
        </div>
      )}
    </div>
  );
}
