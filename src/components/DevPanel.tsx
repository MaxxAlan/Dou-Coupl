import { Info, Sparkles, RefreshCw, Smartphone, RotateCcw } from 'lucide-react';

interface DevPanelProps {
  isSplitScreen: boolean;
  onToggleSplitScreen: () => void;
  activePartner: 'A' | 'B';
  onSwitchPartner: (p: 'A' | 'B') => void;
  pairingCode: string;
  onResetDatabase: (clean: boolean) => void;
}

export default function DevPanel({
  isSplitScreen,
  onToggleSplitScreen,
  activePartner,
  onSwitchPartner,
  pairingCode,
  onResetDatabase
}: DevPanelProps) {
  return (
    <div className="bg-[#0c0c0c] border-b border-white/5 p-4 font-sans text-slate-200 shrink-0">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* Left Side: Title */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#c5a059]/10 flex items-center justify-center text-[#c5a059] shrink-0">
            <Sparkles className="w-5 h-5 fill-[#c5a059]/10" />
          </div>
          <div>
            <h1 className="text-sm font-medium font-serif tracking-wide text-slate-100 flex items-center gap-2">
              <span>Bàn Làm Việc Giả Lập Duo (Couple E2EE)</span>
            </h1>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Thử nghiệm mã hóa đầu cuối E2EE ngay trong iframe. Mã kết nối chung: <strong className="text-[#c5a059] font-mono">{pairingCode}</strong>
            </p>
          </div>
        </div>

        {/* Right Side: Quick controls */}
        <div className="flex flex-wrap items-center gap-3">
          
          {/* View Toggle Mode */}
          <div className="flex bg-[#050505] p-1 rounded-xl border border-white/5">
            <button
              onClick={() => {
                if (isSplitScreen) onToggleSplitScreen();
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                !isSplitScreen ? 'bg-white/10 text-[#c5a059]' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>1 Thiết bị</span>
            </button>
            <button
              onClick={() => {
                if (!isSplitScreen) onToggleSplitScreen();
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                isSplitScreen ? 'bg-white/10 text-[#c5a059]' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="flex gap-0.5 shrink-0">
                <Smartphone className="w-3 h-3" />
                <Smartphone className="w-3 h-3 -ml-1.5" />
              </div>
              <span>2 Thiết bị (Split Screen)</span>
            </button>
          </div>

          {/* Quick Switching Partner if Single Mode */}
          {!isSplitScreen && (
            <div className="flex bg-[#050505] p-1 rounded-xl border border-white/5 items-center">
              <span className="text-[9px] text-slate-500 font-mono px-2 uppercase">Thiết bị của:</span>
              <button
                onClick={() => onSwitchPartner('A')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  activePartner === 'A' ? 'bg-[#c5a059]/15 text-[#ebd4b3]' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Partner A (Nam)
              </button>
              <button
                onClick={() => onSwitchPartner('B')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  activePartner === 'B' ? 'bg-[#c5a059]/15 text-[#ebd4b3]' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Partner B (Nữ)
              </button>
            </div>
          )}

          {/* Reset button - Demo */}
          <button
            onClick={() => onResetDatabase(false)}
            className="p-2 rounded-xl bg-[#050505] hover:bg-white/5 border border-white/5 text-slate-400 hover:text-[#c5a059] transition-colors flex items-center gap-1.5 text-xs cursor-pointer"
            title="Khôi phục trạng thái dữ liệu mẫu"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#c5a059]" />
            <span className="hidden sm:inline">Dữ liệu mẫu (Demo)</span>
          </button>

          {/* Reset button - Clean */}
          <button
            onClick={() => onResetDatabase(true)}
            className="p-2 rounded-xl bg-[#050505] hover:bg-white/5 border border-white/5 text-slate-400 hover:text-red-400 transition-colors flex items-center gap-1.5 text-xs cursor-pointer"
            title="Xoá sạch dữ liệu và bắt đầu từ đầu"
          >
            <RefreshCw className="w-3.5 h-3.5 text-red-500" />
            <span className="hidden sm:inline">Dữ liệu Sạch (Trống)</span>
          </button>

        </div>

      </div>
    </div>
  );
}
