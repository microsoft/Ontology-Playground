import type {
  LlmConfigurationStatusResponse,
  LlmCredentialInputs,
  LlmMode,
} from '../types/llm';

export function emptyLlmCredentialInputs(): LlmCredentialInputs {
  return {
    openai_api_key: '',
    openai_model: '',
    azure_openai_api_key: '',
    azure_openai_endpoint: '',
    azure_openai_deployment: '',
  };
}

function clean(value: string): string {
  return value.trim();
}

function hasOpenAiCredentials(inputs: LlmCredentialInputs): boolean {
  return Boolean(clean(inputs.openai_api_key) && clean(inputs.openai_model));
}

function hasAzureOpenAiCredentials(inputs: LlmCredentialInputs): boolean {
  return Boolean(
    clean(inputs.azure_openai_api_key) &&
      clean(inputs.azure_openai_endpoint) &&
      clean(inputs.azure_openai_deployment),
  );
}

export function validateLlmCredentials(
  mode: LlmMode,
  status: LlmConfigurationStatusResponse | null,
  inputs: LlmCredentialInputs,
): string | null {
  if (!status) {
    return null;
  }

  if (mode === 'openai' && !status.openai.configured && !hasOpenAiCredentials(inputs)) {
    return 'OpenAI is not configured on the backend. Enter a temporary API key and model in Settings.';
  }

  if (mode === 'azure_openai' && !status.azure_openai.configured && !hasAzureOpenAiCredentials(inputs)) {
    return 'Azure OpenAI is not configured on the backend. Enter a temporary API key, endpoint, and deployment in Settings.';
  }

  if (
    mode === 'auto' &&
    !status.openai.configured &&
    !status.azure_openai.configured &&
    !hasOpenAiCredentials(inputs) &&
    !hasAzureOpenAiCredentials(inputs)
  ) {
    return 'Auto mode has no backend credentials to fall back to. Select OpenAI or Azure OpenAI, or enter one temporary credential set in Settings.';
  }

  return null;
}

export function buildLlmCredentialsPayload(
  mode: LlmMode,
  status: LlmConfigurationStatusResponse | null,
  inputs: LlmCredentialInputs,
): Partial<LlmCredentialInputs> | null {
  const openAiConfigured = status?.openai.configured ?? false;
  const azureConfigured = status?.azure_openai.configured ?? false;

  if (mode === 'openai') {
    if (openAiConfigured || !hasOpenAiCredentials(inputs)) {
      return null;
    }
    return {
      openai_api_key: clean(inputs.openai_api_key),
      openai_model: clean(inputs.openai_model),
    };
  }

  if (mode === 'azure_openai') {
    if (azureConfigured || !hasAzureOpenAiCredentials(inputs)) {
      return null;
    }
    return {
      azure_openai_api_key: clean(inputs.azure_openai_api_key),
      azure_openai_endpoint: clean(inputs.azure_openai_endpoint),
      azure_openai_deployment: clean(inputs.azure_openai_deployment),
    };
  }

  if (!status) {
    return hasAzureOpenAiCredentials(inputs)
      ? {
          azure_openai_api_key: clean(inputs.azure_openai_api_key),
          azure_openai_endpoint: clean(inputs.azure_openai_endpoint),
          azure_openai_deployment: clean(inputs.azure_openai_deployment),
        }
      : hasOpenAiCredentials(inputs)
        ? {
            openai_api_key: clean(inputs.openai_api_key),
            openai_model: clean(inputs.openai_model),
          }
        : null;
  }

  if (azureConfigured || openAiConfigured) {
    return null;
  }

  if (hasAzureOpenAiCredentials(inputs)) {
    return {
      azure_openai_api_key: clean(inputs.azure_openai_api_key),
      azure_openai_endpoint: clean(inputs.azure_openai_endpoint),
      azure_openai_deployment: clean(inputs.azure_openai_deployment),
    };
  }

  if (hasOpenAiCredentials(inputs)) {
    return {
      openai_api_key: clean(inputs.openai_api_key),
      openai_model: clean(inputs.openai_model),
    };
  }

  return null;
}

export function shouldShowCredentialInputs(
  mode: LlmMode,
  status: LlmConfigurationStatusResponse | null,
): boolean {
  if (!status) {
    return mode !== 'auto';
  }

  if (mode === 'openai') {
    return !status.openai.configured;
  }

  if (mode === 'azure_openai') {
    return !status.azure_openai.configured;
  }

  return !status.openai.configured && !status.azure_openai.configured;
}
