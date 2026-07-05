import React, { useState } from 'react';
import { useLocale } from '../lib/i18n';
import { Globe } from 'lucide-react';

export default function LanguageSwitcher() {
  const { locale, setLocale, locales } = useLocale();
  const [open, setOpen] = useState(false);

  const current = locales.find(l => l.code === locale);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] rounded-xl px-3 py-2 text-xs text-slate-300 transition-all cursor-pointer w-full"
      >
        <Globe className="w-4 h-4 text-[#c5a059] shrink-0" />
        <span className="flex-1 text-left">
          {current ? `${current.flag} ${current.name}` : locale}
        </span>
        <span className="text-[9px] text-slate-500">{locale.toUpperCase()}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full mb-2 left-0 right-0 z-50 bg-[#111] border border-white/10 rounded-2xl shadow-2xl p-2 max-h-64 overflow-y-auto">
            {locales.map(l => (
              <button
                key={l.code}
                onClick={() => { setLocale(l.code); setOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs transition-all text-left cursor-pointer ${
                  locale === l.code
                    ? 'bg-[#c5a059]/15 text-[#c5a059] font-semibold'
                    : 'text-slate-300 hover:bg-white/[0.03]'
                }`}
              >
                <span className="text-base">{l.flag}</span>
                <span className="flex-1">{l.name}</span>
                {locale === l.code && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#c5a059]" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
