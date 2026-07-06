import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { storageHelper } from './storage';

const LOCALE_KEY = 'app_language';

const FALLBACK_LOCALE = 'vi';

const LOCALE_META: Record<string, { name: string; flag: string }> = {
  vi: { name: 'Tiếng Việt', flag: '🇻🇳' },
  'en-US': { name: 'English (US)', flag: '🇺🇸' },
  en: { name: 'English (UK)', flag: '🇬🇧' },
  zh: { name: '中文', flag: '🇨🇳' },
  de: { name: 'Deutsch', flag: '🇩🇪' },
  fr: { name: 'Français', flag: '🇫🇷' },
  it: { name: 'Italiano', flag: '🇮🇹' },
  ja: { name: '日本語', flag: '🇯🇵' },
  ko: { name: '한국어', flag: '🇰🇷' },
  tr: { name: 'Türkçe', flag: '🇹🇷' },
  km: { name: 'ភាសាខ្មែរ', flag: '🇰🇭' },
  fil: { name: 'Filipino', flag: '🇵🇭' },
  th: { name: 'ไทย', flag: '🇹🇭' },
};

const SUPPORTED_LOCALES = Object.keys(LOCALE_META);

type Dict = Record<string, string>;

interface I18nContextValue {
  locale: string;
  setLocale: (locale: string) => void;
  t: (key: string) => string;
  locales: { code: string; name: string; flag: string }[];
}

const I18nContext = createContext<I18nContextValue>({
  locale: FALLBACK_LOCALE,
  setLocale: () => {},
  t: (key: string) => key,
  locales: [],
});

function detectBrowserLocale(): string {
  try {
    const fullLang = navigator.language?.toLowerCase();
    if (SUPPORTED_LOCALES.includes(fullLang)) return fullLang;
    const lang = fullLang?.slice(0, 2);
    if (SUPPORTED_LOCALES.includes(lang)) return lang;
  } catch {}
  return FALLBACK_LOCALE;
}

function loadDict(locale: string): Dict {
  try {
    const data = (window as any).__LOCALE_DATA__?.[locale];
    if (data) return data;
  } catch {}
  return {};
}

export function I18nProvider({ children, localeData }: { children: React.ReactNode; localeData: Record<string, Dict> }) {
  const [locale, setLocaleState] = useState(() => {
    const saved = storageHelper.getItem<string>(LOCALE_KEY, '');
    if (saved && SUPPORTED_LOCALES.includes(saved)) return saved;
    return detectBrowserLocale();
  });
  const [dict, setDict] = useState<Dict>({});

  useEffect(() => {
    (window as any).__LOCALE_DATA__ = localeData;
    setDict(localeData[locale] || localeData[FALLBACK_LOCALE] || {});
  }, [locale, localeData]);

  const setLocale = useCallback((code: string) => {
    if (!SUPPORTED_LOCALES.includes(code)) return;
    storageHelper.setItem(LOCALE_KEY, code);
    setLocaleState(code);
  }, []);

  const t = useCallback((key: string): string => {
    return dict[key] || key;
  }, [dict]);

  const value: I18nContextValue = {
    locale,
    setLocale,
    t,
    locales: SUPPORTED_LOCALES.map(code => ({
      code,
      name: LOCALE_META[code]?.name || code,
      flag: LOCALE_META[code]?.flag || '',
    })),
  };

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
}

export function useT() {
  return useContext(I18nContext).t;
}

export function useLocale(): I18nContextValue {
  return useContext(I18nContext);
}

export { SUPPORTED_LOCALES, LOCALE_META, FALLBACK_LOCALE };
