/**
 * Minimal i18n for the Ontology Playground.
 *
 * Deliberately dependency-free: the app already ships zustand and is a static
 * site, so a ~60-line translator beats pulling in react-i18next for two
 * languages.
 *
 * Usage in a component:
 *   const t = useT();
 *   <button>{t('designer.validate')}</button>
 *
 * Usage outside React (stores, plain functions):
 *   translate('validation.nameMustStart', { kind, name })
 */
import { useSyncExternalStore } from 'react';
import { en } from './en';
import { ko } from './ko';

export type Locale = 'en' | 'ko';
export type TranslationKey = keyof typeof en;

const DICTIONARIES: Record<Locale, Record<TranslationKey, string>> = { en, ko };

export const LOCALES: { id: Locale; label: string }[] = [
  { id: 'ko', label: '한국어' },
  { id: 'en', label: 'English' },
];

const STORAGE_KEY = 'locale';

function readStoredLocale(): Locale {
  if (typeof window === 'undefined' || !('localStorage' in window)) return 'ko';
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'ko';
  } catch {
    return 'ko';
  }
}

// The locale lives outside React so `translate` works from stores and plain
// modules too; components subscribe through useT below.
let currentLocale: Locale = readStoredLocale();
const listeners = new Set<() => void>();

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale): void {
  if (locale === currentLocale) return;
  currentLocale = locale;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // localStorage unavailable — the choice still applies for this session
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Substitute {placeholders} in a template. */
function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}

/**
 * Translate a key. Falls back to English, then to the key itself, so a missing
 * translation degrades to readable text instead of blanking the UI.
 */
export function translate(
  key: TranslationKey,
  params?: Record<string, string | number>,
  locale: Locale = currentLocale,
): string {
  const template = DICTIONARIES[locale][key] ?? en[key] ?? key;
  return interpolate(template, params);
}

export type TFunction = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

/** Hook form — re-renders the component when the locale changes. */
export function useT(): TFunction {
  useSyncExternalStore(subscribe, getLocale, getLocale);
  return translate;
}

/** Hook for reading/setting the locale (language switcher). */
export function useLocale(): [Locale, (locale: Locale) => void] {
  const locale = useSyncExternalStore(subscribe, getLocale, getLocale);
  return [locale, setLocale];
}
