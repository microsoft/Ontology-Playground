export const MAX_DESCRIPTION_LENGTH = 8000;
export const GENERATION_TIMEOUT_MS = 45_000;

export interface GenerationConnector {
  id: string;
  name: string;
  destination: string;
  revision: string;
  maxDescriptionLength: typeof MAX_DESCRIPTION_LENGTH;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length
    && keys.every(key => Object.hasOwn(value, key));
}

function boundedText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max
    && value.trim() === value && !/\p{Cc}/u.test(value);
}

export function parseGenerationConnector(value: unknown): GenerationConnector {
  const invalid = () => new Error('Generation connector configuration is invalid. Contact your administrator.');
  if (!isRecord(value) || !hasKeys(value, ['connector']) || !isRecord(value.connector)) {
    throw invalid();
  }
  const connector = value.connector;
  if (!hasKeys(connector, ['id', 'name', 'destination', 'revision', 'maxDescriptionLength'])
    || !boundedText(connector.id, 64)
    || !boundedText(connector.name, 120)
    || !boundedText(connector.destination, 2048)
    || typeof connector.revision !== 'string'
    || !/^[a-f0-9]{64}$/.test(connector.revision)
    || connector.maxDescriptionLength !== MAX_DESCRIPTION_LENGTH) {
    throw invalid();
  }
  try {
    const destination = new URL(connector.destination);
    if (destination.protocol !== 'https:' || destination.origin !== connector.destination) {
      throw invalid();
    }
  } catch {
    throw invalid();
  }
  return {
    id: connector.id,
    name: connector.name,
    destination: connector.destination,
    revision: connector.revision,
    maxDescriptionLength: connector.maxDescriptionLength,
  };
}

export function matchesGenerationConnector(
  value: unknown,
  connector: GenerationConnector,
): boolean {
  return isRecord(value) && hasKeys(value, ['id', 'revision'])
    && value.id === connector.id && value.revision === connector.revision;
}

export function generationRequestError(status: number): string {
  if (status === 401 || status === 403) {
    return 'Generation authorization failed. Sign in through the protected gateway and reload the connector.';
  }
  if (status === 404 || status === 503) {
    return 'Generation connector is unavailable or not configured. Contact your administrator.';
  }
  return 'Generation service is unavailable. Please try again later.';
}
