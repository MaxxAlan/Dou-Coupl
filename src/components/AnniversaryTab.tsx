import React, { useState, useEffect } from 'react';
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
  ChevronRight
} from 'lucide-react';
import { Partner, SpecialAnniversary } from '../types';

interface AnniversaryTabProps {
  anniversaryDate: string;
  partnerA: Partner;
  partnerB: Partner;
  specialAnniversaries?: SpecialAnniversary[];
  activePartner: 'A' | 'B';
  onUpdateAnniversary: (date: string) => void;
  onAddSpecialAnniversary: (createdBy: 'A' | 'B', title: string, date: string, notes?: string, photo?: string, id?: string) => void;
  onDeleteSpecialAnniversary: (id: string) => void;
}

export default function AnniversaryTab({
  anniversaryDate,
  partnerA,
  partnerB,
  specialAnniversaries = [],
  activePartner,
  onUpdateAnniversary,
  onAddSpecialAnniversary,
  onDeleteSpecialAnniversary
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

  // Fetch romantic advice from Gemini AI
  const fetchAiSuggestions = async (forceRefresh = false) => {
    const todayStr = (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();

    // Implement caching logic: "nếu trong ngày đã tự động gợi ý thì ko gợi ý lại, chỉ gợi ý lại khi user ấn đổi gợi ý."
    if (!forceRefresh) {
      try {
        const cached = localStorage.getItem('couple_app_ai_ideas_cache');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (
            parsed &&
            parsed.date === todayStr &&
            parsed.daysTogether === daysTogether &&
            Array.isArray(parsed.ideas) &&
            parsed.ideas.length > 0
          ) {
            setAiIdeas(parsed.ideas);
            return;
          }
        }
      } catch (e) {
        console.error('Error reading AI suggestion cache:', e);
      }
    }

    setIsLoadingAi(true);
    setAiError(null);

    try {
      const customApiKey = localStorage.getItem('custom_gemini_api_key') || '';
      const response = await fetch('/api/ai-ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daysTogether, anniversaryDate, customApiKey })
      });

      if (!response.ok) {
        throw new Error('Không thể tải gợi ý tình yêu từ AI.');
      }

      const data = await response.json();
      if (data && data.ideas) {
        setAiIdeas(data.ideas);
        // Save to cache
        try {
          localStorage.setItem(
            'couple_app_ai_ideas_cache',
            JSON.stringify({
              date: todayStr,
              daysTogether,
              ideas: data.ideas
            })
          );
        } catch (e) {
          console.error('Error saving AI suggestion cache:', e);
        }
      } else {
        throw new Error('Định dạng dữ liệu AI không đúng.');
      }
    } catch (err: any) {
      console.error(err);
      setAiError('Không tải được ý tưởng AI. Vui lòng kiểm tra API Key trong thiết lập hoặc thử lại.');
      // Fallback dating ideas
      const fallbackIdeas = [
        '🍳 Cùng nhau chuẩn bị bữa tối ấm áp: Chọn một công thức mới cả hai chưa từng làm, bật nhạc Lofi và nấu cùng nhau.',
        '🏕️ Cắm trại mini tại gia: Dựng lều nhỏ ở ban công hoặc phòng khách, trang trí đèn đom đóm, uống trà nóng và ôn lại kỉ niệm ngày đầu gặp gỡ.',
        '✉️ Viết thư tay gửi tương lai: Mỗi người viết một lá thư tay gửi cho đối phương phiên bản 1 năm sau, cất trong chiếc hộp bí mật.',
        '☕ Bản đồ cà phê cuối tuần: Đi thử một quán cà phê mới lạ chưa từng ghé ở một góc phố yên bình, trò chuyện không dùng điện thoại.'
      ];
      setAiIdeas(fallbackIdeas);

      // Also cache fallback to prevent continuous loader or repeated requests for today
      try {
        localStorage.setItem(
          'couple_app_ai_ideas_cache',
          JSON.stringify({
            date: todayStr,
            daysTogether,
            ideas: fallbackIdeas
          })
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

        {/* ACTIVE REMINDERS WIDGET (Sends/Shows reminders for special dates) */}
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

        {/* SPECIAL ANNIVERSARIES TIMELINE (The add/track feature) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-mono text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
              <Calendar className="w-4 h-4 text-[#c5a059]" />
              <span>DÒNG THỜI GIAN KỶ NIỆM ĐẶC BIỆT</span>
            </h3>
            
            <button
              onClick={() => setIsAddingAnniv(!isAddingAnniv)}
              className="text-xs text-[#c5a059] hover:text-[#ebd4b3] flex items-center gap-1 font-medium transition-colors cursor-pointer bg-[#c5a059]/10 border border-[#c5a059]/25 py-1 px-2.5 rounded-lg"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Thêm kỉ niệm</span>
            </button>
          </div>

          {/* Form to Add Special Anniversary */}
          <AnimatePresence>
            {isAddingAnniv && (
              <motion.form
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                onSubmit={handleAddSpecialAnnivSubmit}
                className="bg-[#0c0c0c] border border-white/5 p-4 rounded-2xl space-y-3.5 overflow-hidden shadow-xl"
              >
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <span className="text-xs font-semibold text-slate-200">Ghi lại một kỷ niệm mới</span>
                  <button 
                    type="button" 
                    onClick={() => setIsAddingAnniv(false)}
                    className="p-1 hover:text-red-400 text-slate-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-2.5">
                  <div>
                    <label className="block text-[10px] text-slate-500 uppercase tracking-wider font-mono mb-1">Tên ngày kỷ niệm *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ví dụ: Chuyến phượt Đà Lạt, Lần đầu nắm tay..."
                      value={newTitle}
                      onChange={e => setNewTitle(e.target.value)}
                      className="w-full bg-black border border-white/5 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-[#c5a059]/50 transition-colors placeholder:text-slate-600"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    <div>
                      <label className="block text-[10px] text-slate-500 uppercase tracking-wider font-mono mb-1">Chọn ngày *</label>
                      <input
                        type="date"
                        required
                        value={newDate}
                        onChange={e => setNewDate(e.target.value)}
                        className="w-full bg-black border border-white/5 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-[#c5a059]/50 transition-colors font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-500 uppercase tracking-wider font-mono mb-1">Lời nhắn / Ghi chú</label>
                    <textarea
                      placeholder="Lưu lại cảm xúc ngọt ngào hôm đó của hai bạn..."
                      value={newNotes}
                      onChange={e => setNewNotes(e.target.value)}
                      rows={2}
                      className="w-full bg-black border border-white/5 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-[#c5a059]/50 transition-colors placeholder:text-slate-600 resize-none"
                    />
                  </div>

                  {/* Photo upload associated with anniversary */}
                  <div>
                    <label className="block text-[10px] text-slate-500 uppercase tracking-wider font-mono mb-1">Ảnh kỷ niệm đính kèm</label>
                    <div className="flex items-center gap-3">
                      <label className="flex-1 flex flex-col items-center justify-center border border-dashed border-white/10 hover:border-[#c5a059]/40 bg-black/50 hover:bg-black p-3 rounded-xl cursor-pointer transition-all">
                        <div className="flex flex-col items-center justify-center text-center space-y-1">
                          <Upload className="w-4 h-4 text-slate-500" />
                          <span className="text-[10px] text-slate-400">Tải ảnh lên (.png, .jpg)</span>
                        </div>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handlePhotoUploadChange}
                          className="hidden"
                        />
                      </label>
                      
                      {selectedPhotoPreview && (
                        <div className="relative w-14 h-14 rounded-xl overflow-hidden border border-white/10 shrink-0">
                          <img src={selectedPhotoPreview} alt="Preview" className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => {
                              setNewPhoto('');
                              setSelectedPhotoPreview('');
                            }}
                            className="absolute top-0.5 right-0.5 bg-black/70 p-0.5 rounded-full text-slate-300 hover:text-red-400"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => setIsAddingAnniv(false)}
                    className="text-[11px] font-medium bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] text-slate-400 py-1.5 px-3.5 rounded-lg transition-all cursor-pointer"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="text-[11px] font-semibold bg-[#c5a059] hover:bg-[#b08b47] text-black py-1.5 px-4 rounded-lg transition-all flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Đang lưu...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3 h-3" />
                        <span>Lưu kỷ niệm</span>
                      </>
                    )}
                  </button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>

          {/* List of Special Anniversaries */}
          <div className="space-y-3">
            {allAnniversariesSorted.length === 0 ? (
              <div className="text-center py-8 bg-white/[0.02] border border-white/5 rounded-2xl text-slate-500 flex flex-col items-center">
                <Calendar className="w-8 h-8 text-slate-600 mb-2 stroke-1" />
                <p className="text-xs">Chưa có kỷ niệm đặc biệt nào được ghi lại</p>
                <p className="text-[10px] text-slate-600 mt-1">Hãy nhấn nút Thêm kỉ niệm để lưu lại khoảnh khắc chung!</p>
              </div>
            ) : (
              allAnniversariesSorted.map(anniv => (
                <motion.div
                  key={anniv.id}
                  whileHover={{ scale: 1.005 }}
                  className={`p-4 bg-white/[0.02] border rounded-2xl relative space-y-3 transition-colors ${
                    anniv.countdown.isToday 
                      ? 'border-[#c5a059]/40 bg-[#c5a059]/[0.02]' 
                      : 'border-white/5 hover:border-white/10'
                  }`}
                >
                  {/* Delete button */}
                  <button
                    onClick={() => {
                      if (confirm(`Bạn chắc chắn muốn xóa kỷ niệm "${anniv.title}"?`)) {
                        onDeleteSpecialAnniversary(anniv.id);
                      }
                    }}
                    className="absolute top-3.5 right-3.5 p-1 text-slate-600 hover:text-red-400 transition-colors rounded-lg hover:bg-white/[0.02] cursor-pointer"
                    title="Xóa kỷ niệm"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>

                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#c5a059]/10 border border-[#c5a059]/20 text-[#c5a059] flex items-center justify-center shrink-0 mt-0.5">
                      <Heart className="w-4 h-4 fill-[#c5a059]/10" />
                    </div>

                    <div className="flex-1 min-w-0 pr-6">
                      <h4 className="text-xs font-semibold text-slate-100 flex items-center gap-1.5 flex-wrap">
                        <span>{anniv.title}</span>
                        {anniv.countdown.isToday && (
                          <span className="text-[9px] font-bold uppercase tracking-wide bg-rose-500/10 text-rose-400 border border-rose-500/20 px-1.5 py-0.5 rounded-full animate-pulse">
                            Hôm nay 🎉
                          </span>
                        )}
                      </h4>

                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-slate-500 font-mono">
                          {new Date(anniv.date).toLocaleDateString('vi-VN')}
                        </span>
                        <span className="w-1 h-1 rounded-full bg-slate-700" />
                        <span className="text-[10px] text-slate-400 font-mono">
                          {anniv.countdown.yearsPassed > 0 
                            ? `Kỷ niệm ${anniv.countdown.yearsPassed} năm` 
                            : 'Trong năm đầu yêu'}
                        </span>
                      </div>

                      {/* Notes text */}
                      {anniv.notes && (
                        <div className="mt-2.5 bg-black/40 border-l-2 border-[#c5a059]/40 py-1.5 pl-2.5 pr-1.5 rounded-r-xl text-[11px] text-slate-300 italic leading-relaxed">
                          {anniv.notes}
                        </div>
                      )}

                      {/* Attached Photo */}
                      {anniv.photo && (
                        <div 
                          onClick={() => setLightboxPhoto({ src: anniv.photo!, title: anniv.title })}
                          className="mt-3 relative aspect-video rounded-xl overflow-hidden border border-white/5 cursor-zoom-in max-w-[240px] hover:border-white/20 transition-all group"
                        >
                          <img src={anniv.photo} alt={anniv.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <span className="text-[9px] bg-black/80 font-semibold py-1 px-2 rounded-full border border-white/10 text-slate-200">Xem ảnh lớn</span>
                          </div>
                        </div>
                      )}

                      {/* Creator badge metadata */}
                      <div className="mt-2.5 flex items-center gap-1.5 text-[9px] text-slate-500">
                        <span className="font-mono">Tạo bởi:</span>
                        <span className="bg-white/[0.04] px-1.5 py-0.5 rounded text-slate-400 font-medium">
                          {anniv.createdBy === 'A' ? partnerA.name : partnerB.name}
                        </span>
                        <span className="font-mono ml-auto">
                          {new Date(anniv.timestamp).toLocaleDateString('vi-VN')}
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </div>

        {/* Gemini AI Coach Dating suggestions */}
        <div className="space-y-3.5 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-mono text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
              <Sparkles className="w-4 h-4 text-[#c5a059]" />
              <span>Ý TƯỞNG HẸN HÒ AI (GEMINI COACH)</span>
            </h3>
            <button
              onClick={() => fetchAiSuggestions(true)}
              disabled={isLoadingAi}
              className="text-xs text-[#c5a059] hover:text-[#f5e0a0] flex items-center gap-1 disabled:opacity-50 transition-colors font-medium cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAi ? 'animate-spin' : ''}`} />
              <span>Đổi gợi ý</span>
            </button>
          </div>

          <AnimatePresence mode="wait">
            {isLoadingAi ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="bg-white/[0.02] border border-white/5 p-8 rounded-2xl flex flex-col items-center justify-center text-center text-slate-400"
              >
                <Loader2 className="w-7 h-7 text-[#c5a059] animate-spin mb-3" />
                <p className="text-xs font-medium">Gemini Love Coach đang phân tích...</p>
                <p className="text-[10px] text-slate-500 mt-1">Tìm kiếm những hoạt động lãng mạn dựa trên {daysTogether} ngày yêu của bạn</p>
              </motion.div>
            ) : aiError ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="bg-white/[0.02] border border-white/5 p-5 rounded-2xl flex flex-col items-center justify-center text-center text-slate-400"
              >
                <AlertCircle className="w-6 h-6 text-[#c5a059] mb-2" />
                <p className="text-xs">{aiError}</p>
                <button
                  onClick={() => fetchAiSuggestions(true)}
                  className="mt-3 text-xs bg-[#c5a059] hover:bg-[#b08b47] text-black py-1.5 px-4 rounded-full font-medium"
                >
                  Thử lại
                </button>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-3"
              >
                {aiIdeas.map((idea, index) => (
                  <motion.div
                    key={index}
                    whileHover={{ scale: 1.01 }}
                    className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl flex items-start gap-3 hover:border-white/10 transition-colors"
                  >
                    <div className="text-xs text-slate-200 leading-relaxed font-sans">{idea}</div>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>

      {/* Lightbox photo fullscreen viewer */}
      <AnimatePresence>
        {lightboxPhoto && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightboxPhoto(null)}
            className="absolute inset-0 bg-black/95 z-50 flex flex-col justify-center p-4"
          >
            <div className="absolute top-4 right-4 flex items-center gap-3">
              <span className="text-xs text-slate-400 font-sans">{lightboxPhoto.title}</span>
              <button
                onClick={() => setLightboxPhoto(null)}
                className="p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="max-w-full max-h-[80vh] flex items-center justify-center overflow-hidden">
              <motion.img 
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.95 }}
                src={lightboxPhoto.src} 
                alt={lightboxPhoto.title} 
                className="max-w-full max-h-full object-contain rounded-xl border border-white/10" 
              />
            </div>
            
            <p className="text-[10px] text-slate-500 font-mono text-center mt-4">Chạm vào bất kỳ vị trí nào để đóng</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
