import React, { useState, useEffect } from 'react';
import { Wifi, Battery, Signal, Home } from 'lucide-react';

interface MockIPhoneFrameProps {
  children: React.ReactNode;
}

function isRealMobile(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth <= 768 || 'ontouchstart' in window;
}

export default function MockIPhoneFrame({ children }: MockIPhoneFrameProps) {
  const [timeStr, setTimeStr] = useState<string>('09:41');
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(isRealMobile());
    const updateTime = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }));
    };
    updateTime();
    const interval = setInterval(updateTime, 30000);
    const handleResize = () => setIsMobile(isRealMobile());
    window.addEventListener('resize', handleResize);
    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  if (isMobile) {
    return (
      <div className="relative w-full h-full flex flex-col overflow-hidden bg-black select-none">
        <div className="flex-1 overflow-hidden relative flex flex-col">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full max-w-[390px] h-[780px] max-h-[90vh] rounded-[48px] border-[10px] border-[#0c0c0c] bg-black shadow-[0_25px_60px_-15px_rgba(0,0,0,0.95)] flex flex-col overflow-hidden ring-1 ring-[#c5a059]/10 select-none mx-auto">
      {/* Top status bar (iOS notch and indicators) */}
      <div className="h-11 bg-slate-950 flex justify-between items-center px-7 shrink-0 text-slate-100 z-30 select-none">
        {/* Left Clock */}
        <span className="text-[12px] font-semibold tracking-wide font-sans">{timeStr}</span>

        {/* Center Dynamic Island Notch */}
        <div className="absolute left-1/2 -translate-x-1/2 top-2.5 w-24 h-5.5 bg-black rounded-full flex items-center justify-center border border-slate-900">
          <div className="w-2.5 h-2.5 rounded-full bg-slate-900/60 ml-auto mr-3 border border-slate-950" />
        </div>

        {/* Right Indicators (Signal, WiFi, Battery) */}
        <div className="flex items-center gap-1.5 text-slate-100">
          <Signal className="w-3.5 h-3.5" />
          <Wifi className="w-3.5 h-3.5" />
          <div className="flex items-center gap-0.5">
            <Battery className="w-4 h-4 fill-slate-100 text-slate-100" />
          </div>
        </div>
      </div>

      {/* Screen view content */}
      <div className="flex-1 overflow-hidden relative flex flex-col bg-slate-950">
        {children}
      </div>

      {/* Bottom Home sweep bar bar indicator */}
      <div className="h-5.5 bg-slate-950 shrink-0 flex items-center justify-center relative select-none">
        <div className="w-32 h-1 bg-slate-800 rounded-full" />
      </div>
    </div>
  );
}
