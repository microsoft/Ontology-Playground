import { createAzureOpenAIConnector } from './azureOpenAI';
import {
  ConnectorError,
  MAX_DESCRIPTION_LENGTH,
  type ConnectorDependencies,
  type ConnectorFactory,
  type OntologyGenerationConnector,
} from './types';

// Only trusted, reviewed deployment code can register adapters.
export const connectorFactories: ReadonlyMap<string, ConnectorFactory> = new Map([
  ['azure-openai', createAzureOpenAIConnector],
]);

export function resolveConnector(
  dependencies: ConnectorDependencies,
  factories: ReadonlyMap<string, ConnectorFactory> = connectorFactories,
): OntologyGenerationConnector {
  const id = dependencies.environment.AI_CONNECTOR ?? 'azure-openai';
  const factory = factories.get(id);
  if (!factory) throw new ConnectorError('configuration');
  const connector = factory(dependencies);
  const descriptor = connector.descriptor;
  let destination: URL;
  try {
    destination = new URL(descriptor.destination);
  } catch {
    throw new ConnectorError('configuration');
  }
  if (
    descriptor.id !== id || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)
    || typeof descriptor.name !== 'string' || descriptor.name.length === 0
    || descriptor.name.length > 120
    || !/^[a-f0-9]{64}$/.test(descriptor.revision)
    || descriptor.maxDescriptionLength !== MAX_DESCRIPTION_LENGTH
    || destination.protocol !== 'https:'
    || destination.origin !== descriptor.destination
    || destination.username || destination.password
  ) {
    throw new ConnectorError('configuration');
  }
  return {
    descriptor: Object.freeze({
      id: descriptor.id,
      name: descriptor.name,
      destination: descriptor.destination,
      revision: descriptor.revision,
      maxDescriptionLength: descriptor.maxDescriptionLength,
    }),
    generate: (input) => connector.generate(input),
  };
}
