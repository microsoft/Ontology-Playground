import { createHash } from 'node:crypto';
import { readBoundedText } from './http';
import {
  ConnectorError,
  MAX_DESCRIPTION_LENGTH,
  MAX_RESPONSE_BYTES,
  type ConnectorFactory,
} from './types';

const SYSTEM_PROMPT = `Generate an ontology from the supplied business description.
Return only JSON: {name, description, entityTypes, relationships}.
Each entity has a unique id, name, description, icon, hex color and properties.
Each property has name, type and optional isIdentifier, description, unit, values.
Property types: string, integer, decimal, double, date, datetime, boolean, enum.
Every entity must have a string or integer identifier property.
Entity and property names must be 1-26 alphanumeric, hyphen or underscore characters,
starting and ending with an alphanumeric character.
Each relationship has unique id, name, from, to, cardinality and optional description.
from/to must refer to existing entity ids; ids are unique across nodes and edges.
Cardinalities: one-to-one, one-to-many, many-to-one, many-to-many.
Use at most 100 entities, 50 properties per entity and 500 relationships.
Do not include instance records, credentials, personal data or RDF source metadata.`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const createAzureOpenAIConnector: ConnectorFactory = ({
  environment,
  fetch,
}) => {
  const endpoint = environment.AZURE_OPENAI_ENDPOINT;
  const apiKey = environment.AZURE_OPENAI_API_KEY;
  const deployment = environment.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o-mini';
  if (!endpoint || !apiKey || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(deployment)) {
    throw new ConnectorError('configuration');
  }
  let base: URL;
  try {
    base = new URL(endpoint);
  } catch {
    throw new ConnectorError('configuration');
  }
  if (
    base.protocol !== 'https:'
    || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.openai\.azure\.com$/.test(base.hostname)
    || base.username || base.password || base.port
    || base.pathname !== '/' || base.search || base.hash
  ) {
    throw new ConnectorError('configuration');
  }
  const url = new URL(
    `openai/deployments/${encodeURIComponent(deployment)}/chat/completions`,
    base,
  );
  url.searchParams.set('api-version', '2024-02-15-preview');
  const revision = createHash('sha256')
    .update(JSON.stringify({ id: 'azure-openai', version: 1, url: url.href }))
    .digest('hex');

  return {
    descriptor: {
      id: 'azure-openai',
      name: 'Azure OpenAI',
      destination: base.origin,
      revision,
      maxDescriptionLength: MAX_DESCRIPTION_LENGTH,
    },
    async generate({ description, signal }): Promise<unknown> {
      const response = await fetch(url, {
        method: 'POST',
        redirect: 'error',
        signal,
        headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: description },
          ],
          temperature: 0.3,
          max_tokens: 4000,
          response_format: { type: 'json_object' },
        }),
      });
      if (!response.ok) throw new ConnectorError('upstream');
      const text = await readBoundedText(response.body, MAX_RESPONSE_BYTES, signal);
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        throw new ConnectorError('invalid_output');
      }
      if (!isRecord(data) || !Array.isArray(data.choices)) {
        throw new ConnectorError('invalid_output');
      }
      const choice: unknown = data.choices[0];
      if (!isRecord(choice) || !isRecord(choice.message)
        || typeof choice.message.content !== 'string') {
        throw new ConnectorError('invalid_output');
      }
      try {
        return JSON.parse(choice.message.content);
      } catch {
        throw new ConnectorError('invalid_output');
      }
    },
  };
};
