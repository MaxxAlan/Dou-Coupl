import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Shield, Key, Eye, EyeOff, Check, FileCode2, Terminal, Info, Phone, Video, Wifi, WifiOff } from 'lucide-react';
import { EncryptedMessage, Partner } from '../types';
import { encryptData, decryptData } from '../lib/crypto';
import useKeyHex from '../hooks/useKeyHex';
import useDecryptedCollection from '../hooks/useDecryptedCollection';
import type { P2PStatus } from '../lib/p2pChannel';

interface ChatTabProps {
  messages: EncryptedMessage[];
  activePartner: 'A' | 'B';
  partnerA: Partner;
  partnerB: Partner;
  symmetricKey: CryptoKey | null;
  pairingCode: string;
  onSendMessage: (ciphertext: string, iv: string) => void;
  onStartCall: (type: 'voice' | 'video') => void;
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
  p2pStatus
}: ChatTabProps) {
  const [text, setText] = useState<string>('');
  const [selectedMessage, setSelectedMessage] = useState<EncryptedMessage | null>(null);
  const [showRawSecret, setShowRawSecret] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const localPartner = activePartner === 'A' ? partnerA : partnerB;
  const otherPartner = activePartner === 'A' ? partnerB : partnerA;

  // Retrieve Key Hex using the custom hook
  const keyHex = useKeyHex(symmetricKey);

  // Decrypt all messages client-side using the custom hook
  const decryptedCache = useDecryptedCollection(
    messages,
    symmetricKey,
    async (msg, key) => decryptData(msg.ciphertext, msg.iv, key)
  );

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, decryptedCache]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !symmetricKey) return;

    // Encrypt client side FIRST
    const { ciphertext, iv } = await encryptData(text, symmetricKey);
    onSendMessage(ciphertext, iv);
    setText('');
  };

  return (
    <div className="flex flex-col h-full bg-[#080808] font-sans text-slate-100 overflow-hidden relative">
      {/* Partner Header with Call Buttons */}
      <div className="bg-[#0e0e0e] border-b border-white/5 py-3 px-4 flex items-center justify-between">
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
      <div className={`border-b border-white/5 py-2.5 px-4 flex items-center justify-between text-[10px] font-mono ${p2pStatus === 'connected' ? 'bg-emerald-950/30 text-emerald-400' : 'bg-[#0e0e0e]/95 text-[#c5a059]'}`}>
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
        {messages.length === 0 ? (
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
              Bắt đầu nhắn tin. Tất cả cuộc đối thoại sẽ được mã hóa tại thiết bị của bạn trước khi gửi lên server.
            </p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isMe = msg.senderId === activePartner;
            const msgText = decryptedCache[msg.id] || '🔒 Đang giải mã...';
            const senderPartner = msg.senderId === 'A' ? partnerA : partnerB;

            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={`flex gap-3.5 items-end ${isMe ? 'justify-end' : 'justify-start'}`}
              >
                {/* Partner Avatar (left side only) */}
                {!isMe && (
                  <div className="w-8 h-8 rounded-full overflow-hidden border border-[#c5a059]/20 bg-white/[0.02] shrink-0 select-none">
                    <img
                      src={senderPartner.avatar}
                      alt={senderPartner.name}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                )}

                <div className="flex flex-col max-w-[70%]">
                  {/* Bubble body */}
                  <div
                    onClick={() => setSelectedMessage(msg)}
                    className={`relative px-4 py-2.5 rounded-2xl text-[13px] leading-relaxed cursor-pointer transition-all duration-150 ${
                      isMe
                        ? 'bg-[#211910] border border-[#c5a059]/30 hover:bg-[#2c2115] text-[#ebd4b3] rounded-br-none shadow-[0_2px_12px_rgba(197,160,89,0.06)]'
                        : 'bg-white/[0.03] hover:bg-white/[0.05] border border-white/5 text-slate-100 rounded-bl-none'
                    }`}
                  >
                    <p className="break-words select-text">{msgText}</p>

                    {/* Shield crypto inspect tag */}
                    <span className="absolute -bottom-2 -right-1 px-1 rounded bg-slate-950 text-[8px] border border-slate-800 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                      E2EE
                    </span>
                  </div>

                  {/* Timestamp and inspector trigger hint */}
                  <div className={`flex items-center gap-1.5 mt-1 px-1 text-[9px] text-slate-500 font-mono ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <span>
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span>•</span>
                    <button
                      onClick={() => setSelectedMessage(msg)}
                      className="hover:text-[#c5a059] flex items-center gap-0.5 transition-colors"
                    >
                      <Terminal className="w-2.5 h-2.5" />
                      <span>Xem mã hóa</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input Bar */}
      <form
        onSubmit={handleSend}
        className="absolute bottom-0 left-0 right-0 p-3 bg-[#080808]/95 border-t border-white/5 flex gap-2 items-center"
      >
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={`Nhắn gửi ngọt ngào tới ${otherPartner.name}...`}
          className="flex-1 bg-white/[0.02] border border-white/5 rounded-full py-2.5 px-5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-[#c5a059]/50 focus:ring-1 focus:ring-[#c5a059]/30 transition-all font-sans"
        />
        <motion.button
          type="submit"
          whileTap={{ scale: 0.95 }}
          className="w-9 h-9 rounded-full bg-[#c5a059] flex items-center justify-center text-black hover:bg-[#b08b47] shadow-md shrink-0 transition-colors disabled:opacity-40 disabled:pointer-events-none"
          disabled={!text.trim()}
        >
          <Send className="w-3.5 h-3.5" />
        </motion.button>
      </form>

      {/* Crypto Inspector Panel (Drawer Modal) */}
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
              {/* Drawer Handle */}
              <div className="w-12 h-1 bg-white/10 rounded-full mx-auto mb-4" />

              <div className="flex items-center gap-2 text-[#c5a059] mb-4 font-sans font-medium text-sm">
                <FileCode2 className="w-4.5 h-4.5" />
                <h3 className="uppercase tracking-wider text-xs">Phân tích Cryptography (E2EE)</h3>
              </div>

              <div className="space-y-4 font-mono text-[10px]">
                {/* Intro alert */}
                <div className="bg-white/[0.02] p-3 rounded-xl border border-[#c5a059]/20 text-slate-400 leading-normal flex gap-2.5">
                  <Info className="w-4 h-4 text-[#c5a059] shrink-0 mt-0.5" />
                  <p className="text-[11px] font-sans">
                    Sử dụng mã mời <span className="text-[#c5a059] font-bold">{pairingCode}</span> để sinh ra khoá Symmetric AES-256-GCM. 
                    Nội dung tin nhắn được bảo mật hoàn toàn dưới dạng mã hoá vô nghĩa trên Server.
                  </p>
                </div>

                {/* Plaintext view */}
                <div>
                  <span className="text-slate-400 block mb-1">■ Plaintext (Phía Client hiển thị):</span>
                  <div className="bg-[#c5a059]/10 border border-[#c5a059]/20 p-3 rounded-lg text-[#ebd4b3] font-sans text-xs select-all">
                    {decryptedCache[selectedMessage.id] || 'Đang giải mã...'}
                  </div>
                </div>

                {/* Symmetric key */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-slate-400">■ Key AES-GCM (Lấy từ thiết bị):</span>
                    <button
                      onClick={() => setShowRawSecret(!showRawSecret)}
                      className="text-[10px] text-[#c5a059] hover:underline flex items-center gap-1 font-sans font-medium"
                    >
                      {showRawSecret ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      <span>{showRawSecret ? 'Ẩn' : 'Xem khóa'}</span>
                    </button>
                  </div>
                  <div className="bg-black p-2.5 rounded-lg text-[9px] border border-white/5 break-all select-all text-slate-300">
                    {showRawSecret ? keyHex : '•'.repeat(64)}
                  </div>
                </div>

                {/* Initialization Vector (IV) */}
                <div>
                  <span className="text-slate-400 block mb-1">■ Initialization Vector (IV - Nonce):</span>
                  <div className="bg-black p-2.5 rounded-lg border border-white/5 break-all select-all text-amber-500 text-[9px]">
                    {selectedMessage.iv}
                  </div>
                </div>

                {/* Ciphertext (What's stored on server) */}
                <div>
                  <span className="text-slate-400 block mb-1">■ Ciphertext (Lưu trên Server):</span>
                  <div className="bg-white/[0.02] border border-white/5 p-3 rounded-lg text-[9px] break-all select-all text-slate-400 leading-normal max-h-36 overflow-y-auto">
                    {selectedMessage.ciphertext}
                  </div>
                </div>

                {/* Protocol summary check */}
                <div className="pt-3 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-500">
                  <div className="flex items-center gap-1 font-sans">
                    <Check className="w-3.5 h-3.5 text-[#c5a059]" />
                    <span>Mã hóa AES-GCM 256-bit</span>
                  </div>
                  <div className="font-sans">
                    <span>Chỉ hai bạn đọc được</span>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedMessage(null)}
                  className="w-full mt-3 bg-white/5 text-slate-200 py-3 rounded-xl font-sans font-medium text-xs border border-white/10 hover:bg-white/10 transition-colors"
                >
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
