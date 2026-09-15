import { useTranslation } from 'react-i18next';
import { Globe, ChevronDown } from 'lucide-react';
import { SUPPORTED_LANGUAGES } from './index';

// Compact language selector shown persistently in the header at every breakpoint
// (desktop and mobile). The current choice is persisted to localStorage by
// i18next-browser-languagedetector, so it survives reloads.
export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = i18n.resolvedLanguage ?? i18n.language;

  return (
    <div className="lang-switch" title="Language / 语言">
      <Globe size={15} className="lang-switch__globe" aria-hidden="true" />
      <select
        className="lang-select"
        value={current}
        onChange={(e) => void i18n.changeLanguage(e.target.value)}
        aria-label="Language"
      >
        {SUPPORTED_LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
      <ChevronDown size={14} className="lang-switch__caret" aria-hidden="true" />
    </div>
  );
}
