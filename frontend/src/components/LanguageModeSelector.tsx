import { useAppStore } from '../store/appStore';

export function LanguageModeSelector() {
  const languageMode = useAppStore((state) => state.languageMode);
  const setLanguageMode = useAppStore((state) => state.setLanguageMode);

  return (
    <label className="llm-mode-selector">
      <span>{languageMode === 'ko' ? '언어' : 'Language'}</span>
      <select
        value={languageMode}
        onChange={(event) =>
          setLanguageMode(event.target.value as 'ko' | 'en')
        }
      >
        <option value="en">English</option>
        <option value="ko">한국어</option>
      </select>
    </label>
  );
}
