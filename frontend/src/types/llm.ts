export type LlmMode = 'auto' | 'openai' | 'azure_openai';

export interface LlmCredentialInputs {
  openai_api_key: string;
  openai_model: string;
  azure_openai_api_key: string;
  azure_openai_endpoint: string;
  azure_openai_deployment: string;
}

export interface LlmProviderConfigurationStatus {
  configured: boolean;
  missing_fields: string[];
  model: string | null;
}

export interface LlmConfigurationStatusResponse {
  auto_resolves_to: 'openai' | 'azure_openai';
  openai: LlmProviderConfigurationStatus;
  azure_openai: LlmProviderConfigurationStatus;
}
