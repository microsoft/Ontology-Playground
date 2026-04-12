import { useState } from 'react';
import { Settings2 } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { buildLlmCredentialsPayload, shouldShowCredentialInputs, validateLlmCredentials } from '../lib/llmConfig';
import { LanguageModeSelector } from './LanguageModeSelector';
import { LlmModeSelector } from './LlmModeSelector';
import { sendDiagnosticChat, type LlmDiagnosticChatResponse } from '../lib/diagnosticApi';

export function HomeSettingsPanel() {
  const languageMode = useAppStore((state) => state.languageMode);
  const llmChatMode = useAppStore((state) => state.llmChatMode);
  const llmConfigurationStatus = useAppStore((state) => state.llmConfigurationStatus);
  const llmCredentialInputs = useAppStore((state) => state.llmCredentialInputs);
  const updateLlmCredentialInput = useAppStore((state) => state.updateLlmCredentialInput);
  const clearLlmCredentialInputs = useAppStore((state) => state.clearLlmCredentialInputs);
  const [diagnosticPrompt, setDiagnosticPrompt] = useState(
    languageMode === 'ko'
      ? '짧게 답해줘. 연결 테스트 중이야.'
      : 'Reply briefly. This is a connection test.',
  );
  const [diagnosticLoading, setDiagnosticLoading] = useState(false);
  const [diagnosticError, setDiagnosticError] = useState<string | null>(null);
  const [diagnosticResult, setDiagnosticResult] = useState<LlmDiagnosticChatResponse | null>(null);
  const copy =
    languageMode === 'ko'
      ? {
          kicker: '설정',
          title: 'AI Provider 설정',
          description:
            '온톨로지 초안 생성, extraction, 자연어-to-Cypher 번역에 사용할 기본 LLM 백엔드를 선택합니다.',
          languageTitle: '언어',
          languageDescription: '메인 워크스페이스와 정보 패널의 기본 표시 언어를 설정합니다.',
          llmTitle: '전역 LLM 모드',
          llmDescription:
            '이 설정은 전역으로 적용되며 local storage에 저장됩니다. AI 기능은 이 모드를 기본값으로 사용합니다.',
          currentMode: '현재 모드',
          providerTitle: '백엔드 설정 상태',
          providerDescription:
            '서버 env에 자격증명이 있으면 그대로 사용하고, 없으면 아래 임시 입력값을 이번 세션에만 사용합니다.',
          auto: 'auto는 Azure OpenAI가 완전히 설정되어 있으면 Azure를 우선 사용하고, 아니면 OpenAI를 사용합니다.',
          openai: 'openai는 ALIGNMENT_OPENAI_API_KEY 또는 OPENAI_API_KEY를 사용합니다.',
          azure:
            'azure_openai는 AZURE_OPENAI_KEY, AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_DEPLOYMENT를 사용합니다.',
          temporaryTitle: '임시 자격증명',
          temporaryDescription:
            '이 입력값은 local storage에 저장되지 않습니다. 새로고침하면 사라지고, 현재 탭 세션 동안만 메모리에 유지됩니다.',
          autoCredentialsHint:
            'auto에 사용할 서버 env가 없으면 OpenAI 또는 Azure OpenAI로 전환해서 임시 자격증명을 입력하세요.',
          openAiKey: 'OpenAI API Key',
          openAiModel: 'OpenAI Model',
          azureKey: 'Azure OpenAI Key',
          azureEndpoint: 'Azure OpenAI Endpoint',
          azureDeployment: 'Azure OpenAI Deployment',
          clearTemporary: '임시 입력값 지우기',
          configured: 'configured',
          missing: 'missing',
          autoResolvesTo: 'auto ->',
          diagnosticTitle: 'LLM 연결 테스트',
          diagnosticSummary: '현재 선택된 LLM 모드로 바로 요청을 보내는 임시 진단용 채팅창입니다.',
          diagnosticPrompt: '테스트 프롬프트',
          diagnosticSend: '전송',
          diagnosticSending: '전송 중...',
          diagnosticPlaceholder: '짧은 테스트 메시지를 입력하세요',
          diagnosticResult: '응답',
          diagnosticMeta: '연결 정보',
          diagnosticFailed: 'Diagnostic request failed.',
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
            'This setting is applied globally and persisted in local storage. All AI workflows use this mode by default.',
          currentMode: 'Current mode',
          providerTitle: 'Backend configuration status',
          providerDescription:
            'When backend env credentials exist, the app uses them. Otherwise it uses the temporary inputs below for the current session only.',
          auto: 'auto prefers Azure OpenAI when fully configured, otherwise OpenAI.',
          openai: 'openai uses ALIGNMENT_OPENAI_API_KEY or OPENAI_API_KEY.',
          azure:
            'azure_openai uses AZURE_OPENAI_KEY, AZURE_OPENAI_ENDPOINT, and AZURE_OPENAI_DEPLOYMENT.',
          temporaryTitle: 'Temporary credentials',
          temporaryDescription:
            'These values are never written to local storage. They live only in memory for the current tab session and disappear on refresh.',
          autoCredentialsHint:
            'If auto has no backend env credentials available, switch to OpenAI or Azure OpenAI and enter a temporary credential set.',
          openAiKey: 'OpenAI API Key',
          openAiModel: 'OpenAI Model',
          azureKey: 'Azure OpenAI Key',
          azureEndpoint: 'Azure OpenAI Endpoint',
          azureDeployment: 'Azure OpenAI Deployment',
          clearTemporary: 'Clear temporary inputs',
          configured: 'configured',
          missing: 'missing',
          autoResolvesTo: 'auto ->',
          diagnosticTitle: 'LLM Connectivity Test',
          diagnosticSummary: 'Temporary diagnostic chat box. Sends a direct request using the currently selected LLM mode.',
          diagnosticPrompt: 'Test prompt',
          diagnosticSend: 'Send',
          diagnosticSending: 'Sending...',
          diagnosticPlaceholder: 'Enter a short test message',
          diagnosticResult: 'Response',
          diagnosticMeta: 'Connection info',
          diagnosticFailed: 'Diagnostic request failed.',
        };

  const validationError = validateLlmCredentials(
    llmChatMode,
    llmConfigurationStatus,
    llmCredentialInputs,
  );
  const llmCredentials = buildLlmCredentialsPayload(
    llmChatMode,
    llmConfigurationStatus,
    llmCredentialInputs,
  );
  const showTemporaryInputs = shouldShowCredentialInputs(
    llmChatMode,
    llmConfigurationStatus,
  );

  const handleDiagnosticSend = async () => {
    if (!diagnosticPrompt.trim()) return;
    if (validationError) {
      setDiagnosticError(validationError);
      return;
    }

    setDiagnosticLoading(true);
    setDiagnosticError(null);
    try {
      const result = await sendDiagnosticChat({
        prompt: diagnosticPrompt,
        llm_provider_override: llmChatMode,
        llm_credentials: llmCredentials,
      });
      setDiagnosticResult(result);
    } catch (error) {
      setDiagnosticError(error instanceof Error ? error.message : copy.diagnosticFailed);
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
          <span className="alignment-chip">
            {copy.currentMode}: {llmChatMode}
          </span>
          {llmConfigurationStatus ? (
            <span className="alignment-chip">
              {copy.autoResolvesTo} {llmConfigurationStatus.auto_resolves_to}
            </span>
          ) : null}
        </div>
      </div>

      <div className="home-settings-card">
        <h3>{copy.providerTitle}</h3>
        <p>{copy.providerDescription}</p>
        <ul className="home-settings-list">
          <li>
            <code>auto</code> {copy.auto}
          </li>
          <li>
            <code>openai</code> {copy.openai}
          </li>
          <li>
            <code>azure_openai</code> {copy.azure}
          </li>
        </ul>
        {llmConfigurationStatus ? (
          <div className="home-settings-state">
            <span className="alignment-chip">
              openai: {llmConfigurationStatus.openai.configured ? copy.configured : copy.missing}
            </span>
            <span className="alignment-chip">
              azure_openai:{' '}
              {llmConfigurationStatus.azure_openai.configured ? copy.configured : copy.missing}
            </span>
          </div>
        ) : null}
      </div>

      <div className="home-settings-card">
        <div className="home-settings-card-header">
          <div>
            <h3>{copy.temporaryTitle}</h3>
            <p>{copy.temporaryDescription}</p>
          </div>
          <button
            type="button"
            className="designer-toolbar-btn"
            onClick={clearLlmCredentialInputs}
          >
            {copy.clearTemporary}
          </button>
        </div>

        {llmChatMode === 'auto' ? (
          <p>{copy.autoCredentialsHint}</p>
        ) : null}

        {showTemporaryInputs && llmChatMode === 'openai' ? (
          <div className="home-settings-credentials-grid">
            <label className="home-settings-diagnostic-field">
              <span>{copy.openAiKey}</span>
              <input
                type="password"
                value={llmCredentialInputs.openai_api_key}
                onChange={(event) => updateLlmCredentialInput('openai_api_key', event.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <label className="home-settings-diagnostic-field">
              <span>{copy.openAiModel}</span>
              <input
                type="text"
                value={llmCredentialInputs.openai_model}
                onChange={(event) => updateLlmCredentialInput('openai_model', event.target.value)}
                placeholder={llmConfigurationStatus?.openai.model ?? 'gpt-5'}
                spellCheck={false}
              />
            </label>
          </div>
        ) : null}

        {showTemporaryInputs && llmChatMode === 'azure_openai' ? (
          <div className="home-settings-credentials-grid">
            <label className="home-settings-diagnostic-field">
              <span>{copy.azureKey}</span>
              <input
                type="password"
                value={llmCredentialInputs.azure_openai_api_key}
                onChange={(event) =>
                  updateLlmCredentialInput('azure_openai_api_key', event.target.value)
                }
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <label className="home-settings-diagnostic-field">
              <span>{copy.azureEndpoint}</span>
              <input
                type="text"
                value={llmCredentialInputs.azure_openai_endpoint}
                onChange={(event) =>
                  updateLlmCredentialInput('azure_openai_endpoint', event.target.value)
                }
                placeholder="https://resource.openai.azure.com/openai/v1"
                spellCheck={false}
              />
            </label>
            <label className="home-settings-diagnostic-field">
              <span>{copy.azureDeployment}</span>
              <input
                type="text"
                value={llmCredentialInputs.azure_openai_deployment}
                onChange={(event) =>
                  updateLlmCredentialInput('azure_openai_deployment', event.target.value)
                }
                placeholder={llmConfigurationStatus?.azure_openai.model ?? 'gpt-4o-mini'}
                spellCheck={false}
              />
            </label>
          </div>
        ) : null}

        {validationError ? (
          <div className="designer-validation-errors">{validationError}</div>
        ) : null}
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
