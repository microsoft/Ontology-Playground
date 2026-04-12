import { useAppStore } from '../store/appStore';

export function LlmModeSelector() {
  const languageMode = useAppStore((state) => state.languageMode);
  const llmChatMode = useAppStore((state) => state.llmChatMode);
  const setLlmChatMode = useAppStore((state) => state.setLlmChatMode);

  return (
    <label className="llm-mode-selector">
      <span>{languageMode === 'ko' ? 'LLM 모드' : 'LLM Mode'}</span>
      <select
        value={llmChatMode}
        onChange={(event) =>
          setLlmChatMode(event.target.value as 'auto' | 'openai' | 'azure_openai')
        }
      >
        <option value="auto">{languageMode === 'ko' ? '자동' : 'Auto'}</option>
        <option value="openai">OpenAI</option>
        <option value="azure_openai">Azure OpenAI</option>
      </select>
    </label>
  );
}
