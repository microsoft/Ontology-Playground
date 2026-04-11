const alignmentApiBaseUrl = import.meta.env.VITE_ALIGNMENT_API_BASE_URL?.trim();

export interface LlmDiagnosticChatResponse {
  provider: string;
  model: string;
  response_text: string;
}

export async function sendDiagnosticChat(payload: {
  prompt: string;
  llm_provider_override?: 'auto' | 'openai' | 'azure_openai';
}): Promise<LlmDiagnosticChatResponse> {
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
