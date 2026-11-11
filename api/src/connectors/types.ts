import type { Environment, FetchFunction } from '../handlers/http';

export interface ConnectorDescriptor {
  id: string;
  name: string;
  destination: string;
  revision: string;
  maxDescriptionLength: number;
}

export interface GenerationInput {
  description: string;
  signal: AbortSignal;
}

export interface OntologyGenerationConnector {
  readonly descriptor: ConnectorDescriptor;
  generate(input: GenerationInput): Promise<unknown>;
}

export interface ConnectorDependencies {
  environment: Environment;
  fetch: FetchFunction;
}

export type ConnectorFactory = (
  dependencies: ConnectorDependencies,
) => OntologyGenerationConnector;

export class ConnectorError extends Error {
  constructor(
    readonly code: 'configuration' | 'upstream' | 'invalid_output' | 'too_large',
  ) {
    super(code);
    this.name = 'ConnectorError';
  }
}

export const MAX_DESCRIPTION_LENGTH = 8000;
export const MAX_REQUEST_BYTES = 32_768;
export const MAX_RESPONSE_BYTES = 262_144;
export const GENERATION_TIMEOUT_MS = 30_000;
