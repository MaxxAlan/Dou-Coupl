import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Heart, MessageCircle, ImageIcon, CheckSquare, Shield,
  Search, Command, ArrowRight, LogOut, Lock, BellRing,
  User, Camera, Mic, Phone, Video, Sparkles, X, Loader2,
  ChevronLeft, ChevronRight, Monitor, Keyboard, Sunset,
  FileText, Gift, Calendar, Clock, Terminal, Wifi,
  Volume2, VolumeX
} from 'lucide-react';

const TABS = [
  { id: 'anniversary', icon: Heart, label: 'Kỷ niệm', shortcut: '1', color: 'text-rose-400' },
  { id: 'chat', icon: MessageCircle, label: 'Chat', shortcut: '2', color: 'text-sky-400' },
  { id: 'album', icon: ImageIcon, label: 'Locket', shortcut: '3', color: 'text-amber-400' },
  { id: 'reminders', icon: CheckSquare, label: 'Kế hoạch', shortcut: '4', color: 'text-emerald-400' },
  { id: 'security', icon: Shield, label: 'Bảo mật', shortcut: '5', color: 'text-violet-400' },
];

interface DesktopUIProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  activePartner: 'A' | 'B';
  partnerA?: { name: string; avatar: string };
  partnerB?: { name: string; avatar: string };
  onSignOut: () => void;
  onLock: () => void;
  hasPasscode?: boolean;
  children: React.ReactNode;
  onStartCall?: (type: 'voice' | 'video') => void;
  onSendQuickPhoto?: () => void;
  musicPlaying?: boolean;
  onToggleMusic?: () => void;
}

export default function DesktopUI({
  activeTab,
  onTabChange,
  activePartner,
  partnerA,
  partnerB,
  onSignOut,
  onLock,
  hasPasscode,
  children,
  onStartCall,
  onSendQuickPhoto,
  musicPlaying,
  onToggleMusic,
}: DesktopUIProps) {
  const [commandOpen, setCommandOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotText, setCopilotText] = useState('');
  const [copilotMessages, setCopilotMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([]);

  const currentPartner = activePartner === 'A' ? partnerA : partnerB;
  const otherPartner = activePartner === 'A' ? partnerB : partnerA;

  // Command palette keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K → command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandOpen(prev => !prev);
        return;
      }
      // Cmd/Ctrl + 1-5 → tab switching
      if ((e.metaKey || e.ctrlKey) && /^[1-5]$/.test(e.key)) {
        e.preventDefault();
        const tab = TABS[parseInt(e.key) - 1];
        if (tab) onTabChange(tab.id);
        return;
      }
      // Escape → close modals
      if (e.key === 'Escape') {
        setCommandOpen(false);
        setCopilotOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onTabChange]);

  // Focus search when command palette opens
  useEffect(() => {
    if (commandOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
      setSearchQuery('');
    }
  }, [commandOpen]);

  const commandItems = [
    ...TABS.map(tab => ({
      id: tab.id,
      icon: tab.icon,
      label: `Mở ${tab.label}`,
      shortcut: `⌘${tab.shortcut}`,
      action: () => { onTabChange(tab.id); setCommandOpen(false); }
    })),
    { id: 'call-voice', icon: Phone, label: 'Gọi thoại cho đối phương', shortcut: '', action: () => { onStartCall?.('voice'); setCommandOpen(false); } },
    { id: 'call-video', icon: Video, label: 'Gọi video cho đối phương', shortcut: '', action: () => { onStartCall?.('video'); setCommandOpen(false); } },
    { id: 'photo', icon: Camera, label: 'Chụp ảnh Locket nhanh', shortcut: '', action: () => { onSendQuickPhoto?.(); setCommandOpen(false); } },
    { id: 'lock', icon: Lock, label: 'Khóa thiết bị', shortcut: '', action: () => { onLock(); setCommandOpen(false); } },
    { id: 'copilot', icon: Sparkles, label: 'Mở Duo Copilot (AI)', shortcut: '', action: () => { setCopilotOpen(true); setCommandOpen(false); } },
  ];

  const filteredCommands = searchQuery
    ? commandItems.filter(item =>
        item.label.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : commandItems;

  return (
    <div className="h-full bg-[#080808] flex flex-col text-slate-100 overflow-hidden select-none">
      {/* Top Bar */}
      <div className="h-12 bg-[#0c0c0c]/95 border-b border-white/5 flex items-center justify-between px-5 shrink-0 backdrop-blur-md z-30">
        {/* Left: Brand + Quick nav */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-lg font-serif text-[#c5a059] tracking-wider font-bold">DUO</span>
            <span className="text-[8px] font-mono text-slate-600 uppercase tracking-[0.15em] hidden sm:inline">Desktop</span>
          </div>

          {/* Quick nav pills */}
          <div className="hidden md:flex items-center gap-1 ml-4">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === tab.id
                    ? 'bg-[#c5a059]/15 text-[#c5a059] border border-[#c5a059]/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03] border border-transparent'
                }`}
              >
                <tab.icon className="w-3 h-3" />
                <span>{tab.label}</span>
                <span className="text-[7px] font-mono text-slate-600 ml-1">{tab.shortcut}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Command palette trigger */}
          <button
            onClick={() => setCommandOpen(true)}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/5 hover:bg-white/[0.06] text-slate-400 hover:text-slate-200 text-[10px] transition-all cursor-pointer"
          >
            <Command className="w-3 h-3" />
            <span className="font-mono">K</span>
          </button>

          {/* Quick actions */}
          <button
            onClick={() => onStartCall?.('voice')}
            className="p-1.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 text-slate-400 hover:text-emerald-400 transition-all cursor-pointer"
            title="Gọi thoại"
          >
            <Phone className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onStartCall?.('video')}
            className="p-1.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 text-slate-400 hover:text-sky-400 transition-all cursor-pointer"
            title="Gọi video"
          >
            <Video className="w-3.5 h-3.5" />
          </button>

          {/* Partner indicator */}
          {currentPartner && (
            <div className="flex items-center gap-2 ml-2 px-2.5 py-1 bg-white/[0.02] rounded-lg border border-white/5">
              <img
                src={currentPartner.avatar}
                alt={currentPartner.name}
                className="w-5 h-5 rounded-full object-cover"
              />
              <span className="text-[10px] font-medium text-slate-300 hidden sm:inline">{currentPartner.name}</span>
              <div className={`w-1.5 h-1.5 rounded-full ${activePartner === 'A' ? 'bg-emerald-400' : 'bg-emerald-400'}`} />
            </div>
          )}

          {/* Music Toggle */}
          {onToggleMusic && (
            <button
              onClick={onToggleMusic}
              className={`p-1.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 transition-all cursor-pointer ${
                musicPlaying ? 'text-[#c5a059]' : 'text-slate-400 hover:text-slate-200'
              }`}
              title={musicPlaying ? 'Tắt nhạc nền' : 'Bật nhạc nền'}
            >
              {musicPlaying ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            </button>
          )}

          {/* Lock */}
          {hasPasscode && (
            <button onClick={onLock} className="p-1.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 text-slate-400 hover:text-[#c5a059] transition-all cursor-pointer" title="Khóa">
              <Lock className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Sign out */}
          <button onClick={onSignOut} className="p-1.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 text-slate-400 hover:text-red-400 transition-all cursor-pointer" title="Đăng xuất">
            <LogOut className="w-3.5 h-3.5" />
          </button>

          {/* Sidebar toggle */}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-1.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 text-slate-400 hover:text-slate-200 transition-all cursor-pointer lg:hidden"
          >
            {sidebarCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Main Content Area with Sidebar */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Sidebar */}
        <div className={`bg-[#0a0a0a] border-r border-white/5 flex flex-col items-center py-3 gap-1 transition-all duration-200 shrink-0 ${
          sidebarCollapsed ? 'w-12' : 'w-16'
        }`}>
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`relative flex flex-col items-center gap-0.5 p-2 rounded-xl transition-all cursor-pointer w-12 ${
                  isActive
                    ? 'bg-[#c5a059]/12 text-[#c5a059]'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.03]'
                }`}
                title={tab.label}
              >
                <Icon className="w-4.5 h-4.5" />
                {!sidebarCollapsed && (
                  <span className="text-[7px] font-mono font-medium">{tab.label.slice(0, 3)}</span>
                )}
                {isActive && (
                  <motion.div
                    layoutId="desktopTabIndicator"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-[#c5a059] rounded-full"
                  />
                )}
              </button>
            );
          })}

          {/* Sidebar spacer + extra tools */}
          <div className="flex-1" />

          {/* Quick tools at bottom of sidebar */}
          <button
            onClick={() => setCopilotOpen(true)}
            className="p-2 rounded-xl text-slate-500 hover:text-[#c5a059] hover:bg-[#c5a059]/10 transition-all cursor-pointer"
            title="Duo Copilot AI"
          >
            <Sparkles className="w-4 h-4" />
          </button>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-hidden relative">
          {children}
        </div>

        {/* Copilot Panel (slide-in) */}
        <AnimatePresence>
          {copilotOpen && (
            <motion.div
              initial={{ x: 320 }}
              animate={{ x: 0 }}
              exit={{ x: 320 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute right-0 top-0 bottom-0 w-80 bg-[#0c0c0c] border-l border-white/5 flex flex-col z-20 shadow-2xl"
            >
              <div className="flex items-center justify-between p-4 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#c5a059]" />
                  <h3 className="text-xs font-semibold">Duo Copilot</h3>
                </div>
                <button onClick={() => setCopilotOpen(false)} className="p-1 rounded-lg hover:bg-white/5 text-slate-400 cursor-pointer">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {copilotMessages.length === 0 ? (
                  <div className="text-center py-10 text-slate-500">
                    <Sparkles className="w-8 h-8 mx-auto mb-3 text-[#c5a059]/40" />
                    <p className="text-[10px] font-mono">Tôi có thể giúp gì cho hai bạn?</p>
                    <div className="mt-4 space-y-1.5">
                      {['Gợi ý ý tưởng hẹn hò', 'Tạo nhắc nhở ngày kỷ niệm', 'Viết tin nhắn ngọt ngào'].map(hint => (
                        <button
                          key={hint}
                          onClick={() => {
                            setCopilotMessages(prev => [...prev, { role: 'user', text: hint }]);
                            setTimeout(() => {
                              setCopilotMessages(prev => [...prev, { role: 'assistant', text: `Tuyệt vời! Dưới đây là một số gợi ý dành riêng cho ${otherPartner?.name || 'bạn ấy'}... (tính năng đang phát triển)` }]);
                            }, 1000);
                          }}
                          className="w-full text-left px-3 py-2 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 text-[10px] text-slate-400 hover:text-slate-200 transition-all cursor-pointer"
                        >
                          {hint}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  copilotMessages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-[11px] leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-[#c5a059]/15 text-[#ebd4b3] rounded-br-none'
                          : 'bg-white/[0.03] text-slate-300 rounded-bl-none border border-white/5'
                      }`}>
                        {msg.text}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="p-3 border-t border-white/5">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={copilotText}
                    onChange={e => setCopilotText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && copilotText.trim()) {
                        setCopilotMessages(prev => [...prev, { role: 'user', text: copilotText.trim() }]);
                        setCopilotText('');
                        setTimeout(() => {
                          setCopilotMessages(prev => [...prev, { role: 'assistant', text: 'Cảm ơn bạn! Tính năng AI response đang được hoàn thiện.' }]);
                        }, 800);
                      }
                    }}
                    placeholder="Nhập câu hỏi..."
                    className="flex-1 bg-white/[0.02] border border-white/5 rounded-xl px-3 py-2 text-[10px] text-slate-100 placeholder-slate-500 focus:outline-none focus:border-[#c5a059]/40"
                  />
                  <button
                    onClick={() => {
                      if (copilotText.trim()) {
                        setCopilotMessages(prev => [...prev, { role: 'user', text: copilotText.trim() }]);
                        setCopilotText('');
                      }
                    }}
                    className="p-2 rounded-xl bg-[#c5a059] text-black cursor-pointer"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Status Bar */}
      <div className="h-7 bg-[#0a0a0a] border-t border-white/5 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-[8px] font-mono text-slate-600">
            {activePartner === 'A' ? partnerA?.name || 'Partner A' : partnerB?.name || 'Partner B'}
          </span>
          <span className="text-[8px] text-slate-700">|</span>
          <span className="text-[8px] font-mono text-slate-600 flex items-center gap-1">
            <Wifi className="w-2.5 h-2.5 text-emerald-500" />
            E2EE Active
          </span>
        </div>
        <div className="flex items-center gap-2">
          {TABS.map(tab => (
            <span key={tab.id} className="text-[7px] font-mono text-slate-700 hidden md:inline">
              ⌘{tab.shortcut} {tab.label}
            </span>
          ))}
          <span className="text-[7px] font-mono text-slate-700">⌘K Command</span>
        </div>
      </div>

      {/* Command Palette Modal */}
      <AnimatePresence>
        {commandOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-start justify-center pt-[15vh]"
            onClick={() => setCommandOpen(false)}
          >
            <motion.div
              initial={{ y: -20, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -20, opacity: 0, scale: 0.98 }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="w-full max-w-lg bg-[#111] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Search bar */}
              <div className="flex items-center gap-3 p-4 border-b border-white/5">
                <Search className="w-4 h-4 text-slate-400 shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Tìm kiếm hành động..."
                  className="flex-1 bg-transparent text-xs text-slate-100 placeholder-slate-500 focus:outline-none font-sans"
                />
                <span className="text-[8px] font-mono text-slate-600 bg-white/5 px-1.5 py-0.5 rounded">ESC</span>
              </div>

              {/* Results */}
              <div className="max-h-72 overflow-y-auto p-2 space-y-0.5">
                {filteredCommands.length === 0 ? (
                  <div className="py-8 text-center text-[10px] text-slate-500 font-mono">
                    Không tìm thấy kết quả
                  </div>
                ) : (
                  filteredCommands.map((item, idx) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        onClick={item.action}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.04] text-slate-300 hover:text-slate-100 transition-all text-left cursor-pointer group"
                      >
                        <div className={`w-7 h-7 rounded-lg bg-white/[0.03] border border-white/5 flex items-center justify-center shrink-0 group-hover:border-[#c5a059]/30 transition-colors ${
                          idx === 0 ? 'text-[#c5a059]' : ''
                        }`}>
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <span className="flex-1 text-[11px] font-medium">{item.label}</span>
                        {item.shortcut && (
                          <span className="text-[8px] font-mono text-slate-600 bg-white/[0.03] px-1.5 py-0.5 rounded">{item.shortcut}</span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div className="px-4 py-2.5 border-t border-white/5 flex items-center gap-3 text-[8px] text-slate-600 font-mono">
                <span>↑↓ Điều hướng</span>
                <span>↵ Chọn</span>
                <span>⌘K Mở</span>
                <span>ESC Đóng</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
