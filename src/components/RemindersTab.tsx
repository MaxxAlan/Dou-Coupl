import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Calendar, CheckCircle2, Circle, Clock, Gift, Heart, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { Reminder } from '../types';

interface RemindersTabProps {
  reminders: Reminder[];
  activePartner: 'A' | 'B';
  onAddReminder: (title: string, category: 'date' | 'gift' | 'daily' | 'special', dueDate: string) => void;
  onToggleReminder: (id: string) => void;
  onDeleteReminder: (id: string) => void;
}

export default function RemindersTab({
  reminders,
  activePartner,
  onAddReminder,
  onToggleReminder,
  onDeleteReminder
}: RemindersTabProps) {
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [title, setTitle] = useState<string>('');
  const [category, setCategory] = useState<'date' | 'gift' | 'daily' | 'special'>('date');
  const [dueDate, setDueDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('pending');

  const filteredReminders = reminders
    .filter(rem => {
      if (filter === 'pending') return !rem.completed;
      if (filter === 'completed') return rem.completed;
      return true;
    })
    .slice()
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !dueDate) return;
    onAddReminder(title.trim(), category, dueDate);
    setTitle('');
    setIsAdding(false);
  };

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'date':
        return <Heart className="w-4 h-4 text-rose-400" />;
      case 'gift':
        return <Gift className="w-4 h-4 text-amber-400" />;
      case 'special':
        return <Sparkles className="w-4 h-4 text-violet-400" />;
      default:
        return <Calendar className="w-4 h-4 text-emerald-400" />;
    }
  };

  const getCategoryLabel = (cat: string) => {
    switch (cat) {
      case 'date': return 'Hẹn hò';
      case 'gift': return 'Quà tặng';
      case 'special': return 'Kỷ niệm đặc biệt';
      default: return 'Việc hằng ngày';
    }
  };

  return (
    <div className="h-full bg-[#080808] font-sans text-slate-100 flex flex-col overflow-hidden relative">
      {/* Filtering Header Bar */}
      <div className="p-3 bg-[#0e0e0e]/95 border-b border-white/5 flex justify-center select-none shrink-0">
        <div className="max-w-3xl w-full flex justify-between items-center px-4">
          <div className="flex gap-1.5">
            {(['pending', 'completed', 'all'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-full text-[10px] md:text-xs font-medium transition-colors cursor-pointer ${
                  filter === f
                    ? 'bg-[#c5a059] text-black font-semibold'
                    : 'bg-white/5 border border-white/10 text-slate-400 hover:text-slate-200'
                }`}
              >
                {f === 'pending' ? 'Chưa làm' : f === 'completed' ? 'Đã xong' : 'Tất cả'}
              </button>
            ))}
          </div>
          {/* Quick add button in header on desktop */}
          <button
            onClick={() => setIsAdding(true)}
            className="hidden md:flex items-center gap-1.5 px-3.5 py-1.5 bg-[#c5a059] hover:bg-[#b08b47] text-black text-xs font-semibold rounded-lg cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Thêm kế hoạch</span>
          </button>
        </div>
      </div>

      {/* Checklist Timeline */}
      <div className="flex-1 overflow-y-auto p-4 pb-20 scrollbar-thin scrollbar-thumb-white/5">
        <div className="max-w-3xl mx-auto w-full space-y-3.5">
          <AnimatePresence initial={false}>
            {filteredReminders.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 py-24"
              >
                <CheckCircle2 className="w-12 h-12 text-slate-600 mb-3" />
                <h4 className="font-medium text-xs md:text-sm text-slate-400">Không có mục nào</h4>
                <p className="text-[11px] md:text-xs mt-1 max-w-[200px] leading-relaxed">
                  {filter === 'pending'
                    ? 'Tuyệt vời! Hai bạn đã hoàn thành hết kế hoạch hẹn hò và công việc chung.'
                    : 'Chưa có kế hoạch nào được hoàn thiện.'}
                </p>
              </motion.div>
            ) : (
              filteredReminders.map(reminder => (
                <motion.div
                  key={reminder.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={`p-4 rounded-2xl border flex items-center justify-between transition-all ${
                    reminder.completed
                      ? 'bg-white/[0.01] border-white/5 opacity-50'
                      : 'bg-white/[0.02] border-white/5 shadow-sm hover:border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-3.5 flex-1 min-w-0 pr-4">
                    {/* Complete toggle checkbox button */}
                    <button
                      onClick={() => onToggleReminder(reminder.id)}
                      className="p-0.5 rounded-full hover:bg-white/5 active:scale-95 transition-all text-slate-500 hover:text-[#c5a059] shrink-0"
                    >
                      {reminder.completed ? (
                        <CheckCircle2 className="w-5.5 h-5.5 text-[#c5a059] fill-[#c5a059]/10" />
                      ) : (
                        <Circle className="w-5.5 h-5.5 text-slate-700 hover:text-slate-500" />
                      )}
                    </button>

                    <div className="min-w-0 flex-1 space-y-1">
                      <h4
                        className={`text-xs md:text-sm font-medium truncate ${
                          reminder.completed ? 'line-through text-slate-500' : 'text-slate-100'
                        }`}
                      >
                        {reminder.title}
                      </h4>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <div className="flex items-center gap-1">
                          {getCategoryIcon(reminder.category)}
                          <span className="text-[9px] md:text-xs text-slate-500">{getCategoryLabel(reminder.category)}</span>
                        </div>
                        <span className="text-[9px] text-slate-600">•</span>
                        <div className="flex items-center gap-1 font-mono text-[9px] md:text-xs text-slate-500">
                          <Clock className="w-3 h-3 text-slate-600" />
                          <span>Hạn: {new Date(reminder.dueDate).toLocaleDateString('vi-VN')}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[8px] md:text-[9.5px] font-mono font-bold uppercase tracking-wider bg-black border border-white/5 text-slate-500 py-0.5 px-2 rounded-full">
                      {reminder.createdBy === 'A' ? 'A' : 'B'} tạo
                    </span>
                    <button
                      onClick={() => onDeleteReminder(reminder.id)}
                      className="p-1 rounded-full text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Floating Add Button */}
      <div className="absolute bottom-4 right-4 z-10 md:hidden">
        <button
          onClick={() => setIsAdding(true)}
          className="w-11 h-11 rounded-full bg-[#c5a059] flex items-center justify-center text-black hover:bg-[#b08b47] shadow-lg active:scale-95 transition-all cursor-pointer"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {/* Add Reminder Modal overlay */}
      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 bg-black/95 backdrop-blur-md flex items-center justify-center p-6 overflow-y-auto"
          >
            <div className="max-w-md w-full bg-[#0c0c0c] border border-white/10 rounded-3xl p-6.5 shadow-2xl flex flex-col space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-[#c5a059]" />
                  <span className="uppercase tracking-wider text-xs font-mono">Thêm Kế Hoạch Chung</span>
                </h3>
                <button
                  onClick={() => setIsAdding(false)}
                  className="p-1.5 rounded-full bg-white/5 border border-white/10 text-slate-400 hover:text-slate-100 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Task Title */}
                <div className="space-y-1.5">
                  <label className="text-[9px] md:text-[10px] font-mono text-slate-500 uppercase tracking-wider">TÊN HOẠT ĐỘNG / KẾ HOẠCH</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="Ví dụ: Kỷ niệm 1 năm yêu nhau..."
                    className="w-full bg-black border border-white/5 rounded-xl py-3 px-4 text-xs md:text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-[#c5a059]/50"
                  />
                </div>

                {/* Category selectors */}
                <div className="space-y-1.5">
                  <label className="text-[9px] md:text-[10px] font-mono text-slate-500 uppercase tracking-wider">PHÂN LOẠI</label>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { value: 'date', label: 'Hẹn hò', icon: <Heart className="w-3.5 h-3.5 text-[#c5a059]" /> },
                      { value: 'gift', label: 'Quà cáp', icon: <Gift className="w-3.5 h-3.5 text-amber-400" /> },
                      { value: 'daily', label: 'Hằng ngày', icon: <Calendar className="w-3.5 h-3.5 text-emerald-400" /> },
                      { value: 'special', label: 'Dịp đặc biệt', icon: <Sparkles className="w-3.5 h-3.5 text-violet-400" /> }
                    ] as const).map(catOpt => (
                      <button
                        key={catOpt.value}
                        type="button"
                        onClick={() => setCategory(catOpt.value)}
                        className={`p-3.5 rounded-xl border text-left flex items-center gap-2.5 transition-all text-xs md:text-sm ${
                          category === catOpt.value
                            ? 'bg-[#c5a059]/10 border-[#c5a059] text-[#ebd4b3] font-medium'
                            : 'bg-white/[0.01] border-white/5 text-slate-400 hover:border-white/10 cursor-pointer'
                        }`}
                      >
                        {catOpt.icon}
                        <span>{catOpt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Due Date picker */}
                <div className="space-y-1.5">
                  <label className="text-[9px] md:text-[10px] font-mono text-slate-500 uppercase tracking-wider">HẠN HOÀN THÀNH</label>
                  <input
                    type="date"
                    required
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    className="w-full bg-black border border-white/5 rounded-xl py-3 px-4 text-xs md:text-sm text-slate-100 focus:outline-none focus:border-[#c5a059]/55"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-[#c5a059] hover:bg-[#b08b47] text-black py-3 rounded-xl font-semibold text-xs md:text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer mt-4"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Thêm vào Danh Sách</span>
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
