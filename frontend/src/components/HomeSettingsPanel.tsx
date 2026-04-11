import { useState } from 'react';
import { Settings2 } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { LanguageModeSelector } from './LanguageModeSelector';
import { LlmModeSelector } from './LlmModeSelector';
import { sendDiagnosticChat, type LlmDiagnosticChatResponse } from '../lib/diagnosticApi';

export function HomeSettingsPanel() {
  const languageMode = useAppStore((state) => state.languageMode);
  const llmChatMode = useAppStore((state) => state.llmChatMode);
  const [diagnosticPrompt, setDiagnosticPrompt] = useState(languageMode === 'ko' ? '짧게 응답해줘. 연결 테스트 중이야.' : 'Reply briefly. This is a connection test.');
  const [diagnosticLoading, setDiagnosticLoading] = useState(false);
  const [diagnosticError, setDiagnosticError] = useState<string | null>(null);
  const [diagnosticResult, setDiagnosticResult] = useState<LlmDiagnosticChatResponse | null>(null);
  const copy =
    languageMode === 'ko'
      ? {
          kicker: '설정',
          title: 'AI Provider 설정',
          description:
            '온톨로지 초안 생성, extraction, 자연어-to-Cypher 번역에 사용될 기본 LLM 백엔드를 선택합니다.',
          languageTitle: '언어',
          languageDescription: '메인 워크스페이스와 정보 패널의 기본 표시 언어를 설정합니다.',
          llmTitle: '전역 LLM 모드',
          llmDescription:
            '이 설정은 전역으로 적용되며 local storage에 저장됩니다. AI 기능은 이 모드를 기본값으로 사용합니다.',
          currentMode: '현재 모드',
          providerTitle: 'Provider 기대값',
          auto: 'auto는 Azure OpenAI가 완전히 설정되어 있으면 Azure를 우선 사용하고, 아니면 OpenAI를 사용합니다.',
          openai: 'openai는 ALIGNMENT_OPENAI_API_KEY 또는 OPENAI_API_KEY를 사용합니다.',
          azure:
            'azure_openai는 AZURE_OPENAI_KEY, AZURE_OPENAI_ENDPOINT(OpenAI 호환 /openai/v1 엔드포인트), AZURE_OPENAI_DEPLOYMENT를 사용합니다.',
          diagnosticTitle: 'LLM 연결 테스트',
          diagnosticSummary: '임시 진단용 채팅창입니다. 현재 선택된 LLM 모드로 바로 요청을 보냅니다.',
          diagnosticPrompt: '테스트 프롬프트',
          diagnosticSend: '전송',
          diagnosticSending: '전송 중…',
          diagnosticPlaceholder: '짧은 테스트 메시지를 입력하세요',
          diagnosticResult: '응답',
          diagnosticMeta: '연결 정보',
        }
      : {
          kicker: 'Settings',
          title: 'AI Provider Settings',
          description:
            'Choose the default LLM backend used across ontology draft generation, extraction, and natural-language-to-Cypher translation.',
          languageTitle: 'Language',
          languageDescription: 'Set the default display language for the main workspace and information panel.',
          llmTitle: 'Global LLM Mode',
          llmDescription:
            'This setting is applied globally and persisted in local storage. All AI workflows use this mode unless the backend is unavailable or the selected provider is not configured.',
          currentMode: 'Current mode',
          providerTitle: 'Provider expectations',
          auto: 'auto prefers Azure OpenAI when fully configured, otherwise OpenAI.',
          openai: 'openai uses ALIGNMENT_OPENAI_API_KEY or OPENAI_API_KEY.',
          azure:
            'azure_openai uses AZURE_OPENAI_KEY, AZURE_OPENAI_ENDPOINT (OpenAI-compatible /openai/v1 endpoint), and AZURE_OPENAI_DEPLOYMENT.',
          diagnosticTitle: 'LLM Connectivity Test',
          diagnosticSummary: 'Temporary diagnostic chat box. Sends a direct request using the currently selected LLM mode.',
          diagnosticPrompt: 'Test prompt',
          diagnosticSend: 'Send',
          diagnosticSending: 'Sending…',
          diagnosticPlaceholder: 'Enter a short test message',
          diagnosticResult: 'Response',
          diagnosticMeta: 'Connection info',
        };

  const handleDiagnosticSend = async () => {
    if (!diagnosticPrompt.trim()) return;
    setDiagnosticLoading(true);
    setDiagnosticError(null);
    try {
      const result = await sendDiagnosticChat({
        prompt: diagnosticPrompt,
        llm_provider_override: llmChatMode,
      });
      setDiagnosticResult(result);
    } catch (error) {
      setDiagnosticError(error instanceof Error ? error.message : 'Diagnostic request failed.');
    } finally {
      setDiagnosticLoading(false);
    }
  };

  return (
    <section className="home-settings-panel">
      <div className="home-settings-header">
        <div>
          <p className="alignment-kicker">{copy.kicker}</p>
          <h2>{copy.title}</h2>
          <p className="home-settings-copy">{copy.description}</p>
        </div>
        <div className="home-settings-icon">
          <Settings2 size={22} />
        </div>
      </div>

      <div className="home-settings-card">
        <h3>{copy.languageTitle}</h3>
        <p>{copy.languageDescription}</p>
        <LanguageModeSelector />
      </div>

      <div className="home-settings-card">
        <h3>{copy.llmTitle}</h3>
        <p>{copy.llmDescription}</p>
        <LlmModeSelector />
        <div className="home-settings-state">
          <span className="alignment-chip">{copy.currentMode}: {llmChatMode}</span>
        </div>
      </div>

      <div className="home-settings-card">
        <h3>{copy.providerTitle}</h3>
        <ul className="home-settings-list">
          <li><code>auto</code> {copy.auto}</li>
          <li><code>openai</code> {copy.openai}</li>
          <li><code>azure_openai</code> {copy.azure}</li>
        </ul>
      </div>

      <details className="home-settings-card">
        <summary className="home-settings-diagnostic-summary">
          <span>{copy.diagnosticTitle}</span>
          <span className="alignment-chip">{llmChatMode}</span>
        </summary>
        <p>{copy.diagnosticSummary}</p>
        <label className="home-settings-diagnostic-field">
          <span>{copy.diagnosticPrompt}</span>
          <textarea
            rows={4}
            value={diagnosticPrompt}
            onChange={(event) => setDiagnosticPrompt(event.target.value)}
            placeholder={copy.diagnosticPlaceholder}
          />
        </label>
        <div className="home-settings-diagnostic-actions">
          <button
            type="button"
            className="designer-action-btn primary"
            disabled={diagnosticLoading || !diagnosticPrompt.trim()}
            onClick={() => {
              void handleDiagnosticSend();
            }}
          >
            {diagnosticLoading ? copy.diagnosticSending : copy.diagnosticSend}
          </button>
        </div>
        {diagnosticError ? <div className="designer-validation-errors">{diagnosticError}</div> : null}
        {diagnosticResult ? (
          <div className="home-settings-diagnostic-result">
            <div className="home-settings-diagnostic-meta">
              <strong>{copy.diagnosticMeta}</strong>
              <span className="alignment-chip">{diagnosticResult.provider}</span>
              <span className="alignment-chip">{diagnosticResult.model}</span>
            </div>
            <div>
              <strong>{copy.diagnosticResult}</strong>
              <pre>{diagnosticResult.response_text}</pre>
            </div>
          </div>
        ) : null}
      </details>
    </section>
  );
}
