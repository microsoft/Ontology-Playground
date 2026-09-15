import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en';
import zhCN from './locales/zh-CN';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'zh-CN', label: '简体中文' },
] as const;

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      'zh-CN': { translation: zhCN },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'zh-CN'],
    interpolation: { escapeValue: false },
    detection: {
      // localStorage wins so a user's manual choice persists; otherwise follow the OS/browser locale.
      order: ['localStorage', 'navigator', 'htmlTag'],
      lookupLocalStorage: 'op-lang',
      caches: ['localStorage'],
    },
  });

// Keep <html lang> in sync with the active language for correct a11y/SEO.
function syncHtmlLang() {
  document.documentElement.lang = i18n.resolvedLanguage ?? i18n.language;
}
syncHtmlLang();
i18n.on('languageChanged', syncHtmlLang);

export default i18n;
