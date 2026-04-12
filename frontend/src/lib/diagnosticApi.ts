import type { LlmConfigurationStatusResponse, LlmCredentialInputs, LlmMode } from '../types/llm';
import { getAlignmentApiBaseUrl } from './alignmentApiConfig';

export interface LlmDiagnosticChatResponse {
  provider: string;
  model: string;
  response_text: string;
}

export async function sendDiagnosticChat(payload: {
  prompt: string;
  llm_provider_override?: LlmMode;
  llm_credentials?: Partial<LlmCredentialInputs> | null;
}): Promise<LlmDiagnosticChatResponse> {
  const alignmentApiBaseUrl = getAlignmentApiBaseUrl();
  if (!alignmentApiBaseUrl) {
    throw new Error('Alignment API base URL is not configured.');
  }

  const response = await fetch(`${alignmentApiBaseUrl}/api/query/diagnostic-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const error = (await response.json()) as { message?: string };
      if (error.message) message = error.message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return response.json() as Promise<LlmDiagnosticChatResponse>;
}

export async function fetchLlmConfigurationStatus(): Promise<LlmConfigurationStatusResponse | null> {
  const alignmentApiBaseUrl = getAlignmentApiBaseUrl();
  if (!alignmentApiBaseUrl) {
    return null;
  }

  const response = await fetch(`${alignmentApiBaseUrl}/api/query/llm-config-status`);
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.json() as Promise<LlmConfigurationStatusResponse>;
}
