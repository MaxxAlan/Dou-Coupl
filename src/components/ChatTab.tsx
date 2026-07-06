import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Send, Shield, Key, Eye, EyeOff, Check, FileCode2, Terminal, Info, 
  Phone, Video, Wifi, WifiOff, Image, Mic, MicOff, Film, 
  Clock, Trash2, Music, X, Loader2 
} from 'lucide-react';
import { EncryptedMessage, EncryptedPhoto, Partner } from '../types';
import { encryptData, decryptData } from '../lib/crypto';
import useKeyHex from '../hooks/useKeyHex';
import useDecryptedCollection from '../hooks/useDecryptedCollection';
import type { P2PStatus } from '../lib/p2pChannel';
import { compressAndResizeImage } from '../lib/image';

interface ChatTabProps {
  messages: EncryptedMessage[];
  activePartner: 'A' | 'B';
  partnerA: Partner;
  partnerB: Partner;
  symmetricKey: CryptoKey | null;
  pairingCode: string;
  onSendMessage: (ciphertext: string, iv: string, type?: 'text' | 'voice', duration?: number) => void;
  onStartCall: (type: 'voice' | 'video') => void;
  onUploadPhoto?: (ciphertext: string, iv: string, isViewOnce: boolean, captionCiphertext?: string, captionIv?: string) => void;
  photos?: EncryptedPhoto[];
  p2pStatus?: P2PStatus;
}

export default function ChatTab({
  messages,
  activePartner,
  partnerA,
  partnerB,
  symmetricKey,
  pairingCode,
  onSendMessage,
  onStartCall,
  onUploadPhoto,
  photos = [],
  p2pStatus
}: ChatTabProps) {
  const [text, setText] = useState<string>('');
  const [selectedMessage, setSelectedMessage] = useState<EncryptedMessage | null>(null);
  const [showRawSecret, setShowRawSecret] = useState<boolean>(false);
  const [isViewOnce, setIsViewOnce] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Voice recording states
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [voiceRecorder, setVoiceRecorder] = useState<MediaRecorder | null>(null);
  const [voiceChunks, setVoiceChunks] = useState<Blob[]>([]);
  const [voiceDuration, setVoiceDuration] = useState(0);
  const voiceTimerRef = useRef<any>(null);

  const localPartner = activePartner === 'A' ? partnerA : partnerB;
  const otherPartner = activePartner === 'A' ? partnerB : partnerA;

  const keyHex = useKeyHex(symmetricKey);

  const decryptedCache = useDecryptedCollection(
    messages,
    symmetricKey,
    async (msg, key) => decryptData(msg.ciphertext, msg.iv, key)
  );

  // Decrypt photos for inline display
  const decryptedPhotoCache = useDecryptedCollection(
    photos,
    symmetricKey,
    async (photo, key) => {
      try {
        const src = await decryptData(photo.ciphertext, photo.iv, key);
        let cap = '';
        if (photo.captionCiphertext && photo.captionIv) {
          cap = await decryptData(photo.captionCiphertext, photo.captionIv, key);
        }
        return { src, caption: cap };
      } catch {
        return { src: '', caption: '' };
      }
    }
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, decryptedCache]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !symmetricKey) return;
    const { ciphertext, iv } = await encryptData(text, symmetricKey);
    onSendMessage(ciphertext, iv);
    setText('');
  };

  // Voice recording
  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        if (!symmetricKey) return;
        const blob = new Blob(chunks, { type: mimeType });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = reader.result as string;
          const { ciphertext, iv } = await encryptData(base64, symmetricKey);
          onSendMessage(ciphertext, iv, 'voice', voiceDuration);
        };
        reader.readAsDataURL(blob);
        setVoiceDuration(0);
      };

      recorder.start(100);
      setVoiceRecorder(recorder);
      setIsRecordingVoice(true);
      setVoiceChunks(chunks);

      voiceTimerRef.current = setInterval(() => {
        setVoiceDuration(prev => prev + 1);
      }, 1000);
    } catch {
      alert('Không thể truy cập microphone');
    }
  };

  const stopVoiceRecording = () => {
    if (voiceRecorder && voiceRecorder.state !== 'inactive') {
      voiceRecorder.stop();
    }
    setIsRecordingVoice(false);
    if (voiceTimerRef.current) {
      clearInterval(voiceTimerRef.current);
    }
  };

  // Image/Video picker
  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>, isVideo: boolean) => {
    if (!e.target.files?.[0] || !symmetricKey || !onUploadPhoto) return;
    const file = e.target.files[0];
    const maxSize = isVideo ? 50 * 1024 * 1024 : 8 * 1024 * 1024;
    if (file.size > maxSize) {
      alert(isVideo ? 'Video quá lớn (tối đa 50MB)' : 'Ảnh quá lớn (tối đa 8MB)');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        let data = reader.result as string;
        if (!isVideo) {
          data = await compressAndResizeImage(data, 1600, 0.8);
        }
        const { ciphertext, iv } = await encryptData(data, symmetricKey);
        onUploadPhoto(ciphertext, iv, isViewOnce);
      } catch (err) {
        console.error(err);
        alert('Lỗi mã hóa file');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
    setIsViewOnce(false);
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Combine messages and recent photos into one timeline
  const combinedTimeline = (() => {
    const items: Array<{ type: 'msg' | 'photo'; data: EncryptedMessage | EncryptedPhoto; ts: number }> = [];
    for (const m of messages) {
      items.push({ type: 'msg', data: m, ts: m.timestamp });
    }
    for (const p of photos) {
      items.push({ type: 'photo', data: p, ts: p.timestamp });
    }
    items.sort((a, b) => a.ts - b.ts);
    return items.slice(-100);
  })();

  return (
    <div className="flex flex-col h-full bg-[#080808] font-sans text-slate-100 overflow-hidden relative">
      {/* Partner Header with Call Buttons */}
      <div className="bg-[#0e0e0e] border-b border-white/5 py-3 px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <img
            src={otherPartner.avatar || 'https://images.unsplash.com/photo-1518199266791-5375a83190b7'}
            alt={otherPartner.name}
            className="w-9 h-9 rounded-full object-cover border border-white/10"
          />
          <div>
            <h3 className="text-xs font-semibold text-slate-100">{otherPartner.name}</h3>
            <span className="text-[9px] flex items-center gap-1">
              {p2pStatus === 'connected' ? (
                <span className="text-emerald-400 flex items-center gap-1">
                  <Wifi className="w-3 h-3" />
                  <span>P2P Trực tiếp</span>
                </span>
              ) : p2pStatus === 'connecting' || p2pStatus === 'host_waiting' ? (
                <span className="text-amber-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
                  <span>Đang kết nối P2P...</span>
                </span>
              ) : (
                <span className="text-[#c5a059] flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-[#c5a059] rounded-full animate-pulse" />
                  <span>Đang kết nối</span>
                </span>
              )}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => onStartCall('voice')}
            className="p-2 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 text-slate-300 hover:text-slate-100 transition-all cursor-pointer"
            title="Gọi thoại E2EE"
          >
            <Phone className="w-4 h-4" />
          </button>
          <button
            onClick={() => onStartCall('video')}
            className="p-2 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 text-slate-300 hover:text-slate-100 transition-all cursor-pointer"
            title="Gọi video E2EE"
          >
            <Video className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Top cryptographic safety banner */}
      <div className={`border-b border-white/5 py-2.5 px-4 flex items-center justify-between text-[10px] font-mono shrink-0 ${p2pStatus === 'connected' ? 'bg-emerald-950/30 text-emerald-400' : 'bg-[#0e0e0e]/95 text-[#c5a059]'}`}>
        <div className="flex items-center gap-1.5">
          {p2pStatus === 'connected' ? <Wifi className="w-3.5 h-3.5" /> : <Shield className="w-3.5 h-3.5" />}
          <span className="tracking-wide">
            {p2pStatus === 'connected' ? 'P2P TRỰC TIẾP - KHÔNG QUA SERVER' : 'MÃ HÓA ĐẦU CUỐI (E2EE) HOẠT ĐỘNG'}
          </span>
        </div>
        <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] ${p2pStatus === 'connected' ? 'bg-emerald-500/10' : 'bg-[#c5a059]/10'}`}>
          <span className={`w-1 h-1 rounded-full ${p2pStatus === 'connected' ? 'bg-emerald-400' : 'bg-[#c5a059]'} animate-pulse`} />
          <span>{p2pStatus === 'connected' ? 'P2P' : 'AES-GCM-256'}</span>
        </div>
      </div>

      {/* Message Timeline */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-20 scrollbar-thin scrollbar-thumb-white/5 scrollbar-track-transparent">
        {combinedTimeline.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
            <motion.div
              animate={{ rotate: [0, 360] }}
              transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
              className="w-12 h-12 rounded-full border border-[#c5a059]/20 flex items-center justify-center mb-4 bg-[#c5a059]/5 text-[#c5a059]"
            >
              <Key className="w-5 h-5" />
            </motion.div>
            <h4 className="font-medium text-sm text-slate-200">Đã thiết lập kênh bí mật</h4>
            <p className="text-xs max-w-[240px] mt-2 leading-relaxed">
              Bắt đầu nhắn tin. Gửi ảnh, video, ghi âm — tất cả đều được mã hóa đầu cuối.
            </p>
          </div>
        ) : (
          combinedTimeline.map((item) => {
            if (item.type === 'msg') {
              const msg = item.data as EncryptedMessage;
              const isMe = msg.senderId === activePartner;
              const msgText = decryptedCache[msg.id];

              return (
                <motion.div
                  key={`msg-${msg.id}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className={`flex gap-3.5 items-end ${isMe ? 'justify-end' : 'justify-start'}`}
                >
                  {!isMe && (
                    <div className="w-8 h-8 rounded-full overflow-hidden border border-[#c5a059]/20 bg-white/[0.02] shrink-0 select-none">
                      <img src={(msg.senderId === 'A' ? partnerA : partnerB).avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    </div>
                  )}
                  <div className="flex flex-col max-w-[75%]">
                    {msg.type === 'voice' ? (
                      <div
                        onClick={() => setSelectedMessage(msg)}
                        className={`relative px-4 py-3 rounded-2xl text-[13px] cursor-pointer transition-all duration-150 ${
                          isMe
                            ? 'bg-[#211910] border border-[#c5a059]/30 hover:bg-[#2c2115] text-[#ebd4b3] rounded-br-none'
                            : 'bg-white/[0.03] hover:bg-white/[0.05] border border-white/5 text-slate-100 rounded-bl-none'
                        }`}
                      >
                        {msgText && msgText.startsWith('data:') ? (
                          <audio
                            src={msgText}
                            controls
                            preload="none"
                            className="max-w-[220px] h-9"
                            style={{ filter: 'invert(0.85) hue-rotate(180deg)' }}
                          />
                        ) : (
                          <div className="flex items-center gap-2">
                            <Music className="w-4 h-4 text-[#c5a059]" />
                            <div className="flex items-center gap-2">
                              <div className="flex gap-0.5">
                                {Array.from({ length: 4 }).map((_, i) => (
                                  <motion.div
                                    key={i}
                                    animate={{ height: [6, 16, 8, 14, 6] }}
                                    transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.15 }}
                                    className="w-0.5 bg-[#c5a059]/60 rounded-full"
                                  />
                                ))}
                              </div>
                              <span className="text-[10px] font-mono text-slate-400">
                                {msg.duration ? formatDuration(msg.duration) : '🎤'}
                              </span>
                            </div>
                          </div>
                        )}
                        {msg.isViewOnce && (
                          <Clock className="w-3 h-3 text-amber-400 ml-1" />
                        )}
                      </div>
                    ) : (
                      <div
                        onClick={() => setSelectedMessage(msg)}
                        className={`relative px-4 py-2.5 rounded-2xl text-[13px] leading-relaxed cursor-pointer transition-all duration-150 ${
                          isMe
                            ? 'bg-[#211910] border border-[#c5a059]/30 hover:bg-[#2c2115] text-[#ebd4b3] rounded-br-none shadow-[0_2px_12px_rgba(197,160,89,0.06)]'
                            : 'bg-white/[0.03] hover:bg-white/[0.05] border border-white/5 text-slate-100 rounded-bl-none'
                        }`}
                      >
                        <p className="break-words select-text">
                          {msg.type === 'image_ref' || msg.type === 'video_ref' ? (
                            <span className="flex items-center gap-1.5 text-[#c5a059]">
                              {msg.type === 'image_ref' ? <Image className="w-4 h-4" /> : <Film className="w-4 h-4" />}
                              <span className="text-slate-300">{msg.type === 'image_ref' ? 'Đã gửi ảnh' : 'Đã gửi video'}</span>
                              {msg.isViewOnce && <Clock className="w-3 h-3 text-amber-400" />}
                            </span>
                          ) : (
                            msgText || '🔒 Đang giải mã...'
                          )}
                        </p>
                      </div>
                    )}

                    <div className={`flex items-center gap-1.5 mt-1 px-1 text-[9px] text-slate-500 font-mono ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <span>•</span>
                      <button onClick={() => setSelectedMessage(msg)} className="hover:text-[#c5a059] flex items-center gap-0.5 transition-colors">
                        <Terminal className="w-2.5 h-2.5" />
                        <span>Xem mã hóa</span>
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            } else {
              // Photo inline in chat
              const photo = item.data as EncryptedPhoto;
              const isMe = photo.senderId === activePartner;
              const decrypted = decryptedPhotoCache[photo.id];
              const sender = photo.senderId === 'A' ? partnerA : partnerB;

              return (
                <motion.div
                  key={`photo-${photo.id}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-3.5 items-end ${isMe ? 'justify-end' : 'justify-start'}`}
                >
                  {!isMe && (
                    <div className="w-8 h-8 rounded-full overflow-hidden border border-[#c5a059]/20 bg-white/[0.02] shrink-0 select-none">
                      <img src={sender.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    </div>
                  )}
                  <div className="flex flex-col max-w-[70%]">
                    <div className="relative rounded-2xl overflow-hidden border border-white/5 bg-black">
                      {decrypted?.src ? (
                        <>
                          <img src={decrypted.src} alt="shared" className="w-full max-w-[240px] max-h-[240px] object-contain" />
                          {decrypted.caption && (
                            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                              <p className="text-[10px] text-slate-200">{decrypted.caption}</p>
                            </div>
                          )}
                          {photo.isViewOnce && (
                            <div className="absolute top-2 right-2 bg-amber-500/80 text-white text-[8px] px-1.5 py-0.5 rounded-full flex items-center gap-1">
                              <Clock className="w-2.5 h-2.5" />
                              <span>1 LẦN</span>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="w-32 h-32 flex items-center justify-center text-slate-600">
                          <Loader2 className="w-5 h-5 animate-spin" />
                        </div>
                      )}
                    </div>
                    <div className={`flex items-center gap-1.5 mt-1 px-1 text-[9px] text-slate-500 font-mono ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <span>{new Date(photo.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <span>•</span>
                      <span className="text-[#c5a059]">E2EE</span>
                    </div>
                  </div>
                </motion.div>
              );
            }
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Voice recording UI overlay */}
      <AnimatePresence>
        {isRecordingVoice && (
          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            className="absolute bottom-16 inset-x-0 z-30 bg-[#0e0e0e] border-t border-white/5 p-4 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ repeat: Infinity, duration: 0.8 }}
                className="w-3 h-3 rounded-full bg-red-500"
              />
              <span className="text-sm font-mono text-red-400">{formatDuration(voiceDuration)}</span>
              <div className="flex gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <motion.div
                    key={i}
                    animate={{ height: [4, 20, 8, 16, 4] }}
                    transition={{ repeat: Infinity, duration: 0.6, delay: i * 0.1 }}
                    className="w-1 bg-red-400/60 rounded-full"
                  />
                ))}
              </div>
            </div>
            <button
              onClick={stopVoiceRecording}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-full flex items-center gap-1.5 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Gửi</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Message Input Bar */}
      <form
        onSubmit={handleSend}
        className="absolute bottom-0 left-0 right-0 p-3 bg-[#080808]/95 border-t border-white/5 flex gap-2 items-end z-20"
      >
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          onChange={(e) => handleFilePick(e, false)}
          className="hidden"
        />
        <input
          type="file"
          ref={videoInputRef}
          accept="video/*"
          onChange={(e) => handleFilePick(e, true)}
          className="hidden"
        />

        <div className="flex gap-1 items-end">
          {/* Image attach */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2 rounded-full bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 text-slate-400 hover:text-[#c5a059] transition-all cursor-pointer"
            title="Gửi ảnh"
          >
            <Image className="w-4 h-4" />
          </button>
          {/* Video attach */}
          <button
            type="button"
            onClick={() => videoInputRef.current?.click()}
            className="p-2 rounded-full bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 text-slate-400 hover:text-[#c5a059] transition-all cursor-pointer"
            title="Gửi video"
          >
            <Film className="w-4 h-4" />
          </button>
          {/* Voice record */}
          <button
            type="button"
            onClick={isRecordingVoice ? stopVoiceRecording : startVoiceRecording}
            className={`p-2 rounded-full border transition-all cursor-pointer ${
              isRecordingVoice
                ? 'bg-red-600 border-red-500 text-white animate-pulse'
                : 'bg-white/[0.02] hover:bg-white/[0.06] border-white/5 text-slate-400 hover:text-[#c5a059]'
            }`}
            title={isRecordingVoice ? 'Gửi ghi âm' : 'Ghi âm'}
          >
            {isRecordingVoice ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
        </div>

        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={`Nhắn gửi ngọt ngào tới ${otherPartner.name}...`}
          className="flex-1 bg-white/[0.02] border border-white/5 rounded-full py-2.5 px-5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-[#c5a059]/50 focus:ring-1 focus:ring-[#c5a059]/30 transition-all font-sans"
        />

        <div className="flex flex-col items-center gap-1">
          <motion.button
            type="submit"
            whileTap={{ scale: 0.95 }}
            className="w-9 h-9 rounded-full bg-[#c5a059] flex items-center justify-center text-black hover:bg-[#b08b47] shadow-md shrink-0 transition-colors disabled:opacity-40 disabled:pointer-events-none"
            disabled={!text.trim()}
          >
            <Send className="w-3.5 h-3.5" />
          </motion.button>
          <label className="flex items-center gap-1 cursor-pointer" title="Xem một lần">
            <input
              type="checkbox"
              checked={isViewOnce}
              onChange={e => setIsViewOnce(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-7 h-3.5 bg-white/10 peer-checked:bg-amber-500 rounded-full relative transition-colors">
              <div className={`absolute top-0.5 left-0.5 w-2.5 h-2.5 bg-slate-300 rounded-full transition-all ${isViewOnce ? 'translate-x-3.5' : ''}`} />
            </div>
            <Clock className={`w-2.5 h-2.5 ${isViewOnce ? 'text-amber-400' : 'text-slate-500'}`} />
          </label>
        </div>
      </form>

      {/* Crypto Inspector Panel */}
      <AnimatePresence>
        {selectedMessage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 bg-black/80 backdrop-blur-sm flex items-end justify-center"
            onClick={() => setSelectedMessage(null)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="w-full max-h-[85%] bg-[#0e0e0e] border-t border-white/10 rounded-t-3xl p-5 overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-12 h-1 bg-white/10 rounded-full mx-auto mb-4" />

              <div className="flex items-center gap-2 text-[#c5a059] mb-4 font-sans font-medium text-sm">
                <FileCode2 className="w-4.5 h-4.5" />
                <h3 className="uppercase tracking-wider text-xs">Phân tích Cryptography (E2EE)</h3>
              </div>

              <div className="space-y-4 font-mono text-[10px]">
                <div className="bg-white/[0.02] p-3 rounded-xl border border-[#c5a059]/20 text-slate-400 leading-normal flex gap-2.5">
                  <Info className="w-4 h-4 text-[#c5a059] shrink-0 mt-0.5" />
                  <p className="text-[11px] font-sans">
                    Sử dụng mã mời <span className="text-[#c5a059] font-bold">{pairingCode}</span> để sinh ra khoá Symmetric AES-256-GCM. 
                    Nội dung tin nhắn được bảo mật hoàn toàn dưới dạng mã hoá vô nghĩa trên Server.
                  </p>
                </div>

                <div>
                  <span className="text-slate-400 block mb-1">■ Plaintext (Phía Client hiển thị):</span>
                  <div className="bg-[#c5a059]/10 border border-[#c5a059]/20 p-3 rounded-lg text-[#ebd4b3] font-sans text-xs select-all">
                    {decryptedCache[selectedMessage.id] || 'Đang giải mã...'}
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-slate-400">■ Key AES-GCM (Lấy từ thiết bị):</span>
                    <button onClick={() => setShowRawSecret(!showRawSecret)} className="text-[10px] text-[#c5a059] hover:underline flex items-center gap-1 font-sans font-medium">
                      {showRawSecret ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      <span>{showRawSecret ? 'Ẩn' : 'Xem khóa'}</span>
                    </button>
                  </div>
                  <div className="bg-black p-2.5 rounded-lg text-[9px] border border-white/5 break-all select-all text-slate-300">
                    {showRawSecret ? keyHex : '•'.repeat(64)} // Note: pairingCode no longer exposed via /api/state (SEC-1 fix)
                  </div>
                </div>

                <div>
                  <span className="text-slate-400 block mb-1">■ Initialization Vector (IV - Nonce):</span>
                  <div className="bg-black p-2.5 rounded-lg border border-white/5 break-all select-all text-amber-500 text-[9px]">
                    {selectedMessage.iv}
                  </div>
                </div>

                <div>
                  <span className="text-slate-400 block mb-1">■ Ciphertext (Lưu trên Server):</span>
                  <div className="bg-white/[0.02] border border-white/5 p-3 rounded-lg text-[9px] break-all select-all text-slate-400 leading-normal max-h-36 overflow-y-auto">
                    {selectedMessage.ciphertext}
                  </div>
                </div>

                <div className="pt-3 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-500">
                  <div className="flex items-center gap-1 font-sans">
                    <Check className="w-3.5 h-3.5 text-[#c5a059]" />
                    <span>Mã hóa AES-GCM 256-bit</span>
                  </div>
                  <div className="font-sans">
                    <span>Chỉ hai bạn đọc được</span>
                  </div>
                </div>

                <button onClick={() => setSelectedMessage(null)} className="w-full mt-3 bg-white/5 text-slate-200 py-3 rounded-xl font-sans font-medium text-xs border border-white/10 hover:bg-white/10 transition-colors">
                  Đóng phân tích
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
