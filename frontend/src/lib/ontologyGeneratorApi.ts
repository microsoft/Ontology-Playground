import type { Ontology } from '../data/ontology';

const alignmentApiBaseUrl = import.meta.env.VITE_ALIGNMENT_API_BASE_URL?.trim();

export interface ReferenceTextInput {
  reference_name: string;
  text?: string;
  content_base64?: string;
  media_type?: string;
}

export interface OntologyDraftGenerationRequest {
  prompt: string;
  references: ReferenceTextInput[];
  current_ontology?: Ontology;
  system_prompt_override?: string;
  llm_provider_override?: 'auto' | 'openai' | 'azure_openai';
}

export interface OntologyDraftGenerationResponse {
  ontology: Ontology;
  assumptions: string[];
  open_questions: string[];
}

interface ApiErrorPayload {
  message?: string;
  details?: {
    error?: string;
  };
}

export async function generateOntologyDraft(
  request: OntologyDraftGenerationRequest,
): Promise<OntologyDraftGenerationResponse> {
  if (!alignmentApiBaseUrl) {
    throw new Error('Alignment API base URL is not configured. Set VITE_ALIGNMENT_API_BASE_URL before using AI ontology generation.');
  }

  const response = await fetch(`${alignmentApiBaseUrl}/api/ontology/generate-draft`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const error = (await response.json()) as ApiErrorPayload;
      if (error.message) {
        message = error.message;
      }
      if (error.details?.error) {
        message = `${message}: ${error.details.error}`;
      }
    } catch {
      // Ignore JSON parsing failures and use the generic message.
    }
    throw new Error(message);
  }

  return response.json() as Promise<OntologyDraftGenerationResponse>;
}
