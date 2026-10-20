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

export const createMiniMaxConnector: ConnectorFactory = ({ environment, fetch }) => {
  const apiKey = environment.MINIMAX_API_KEY;
  const model = environment.MINIMAX_MODEL || 'MiniMax-M3.1-Flash';
  if (!apiKey || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(model)) {
    throw new ConnectorError('configuration');
  }
  let base: URL;
  try {
    base = new URL(environment.MINIMAX_BASE_URL || 'https://api.minimax.io/v1');
  } catch {
    throw new ConnectorError('configuration');
  }
  if (
    base.protocol !== 'https:'
    || !['api.minimax.io', 'api.minimax.cn', 'api.minimaxi.com'].includes(base.hostname)
    || base.username || base.password || base.port
    || !/^\/v1\/*$/.test(base.pathname) || base.search || base.hash
  ) {
    throw new ConnectorError('configuration');
  }
  const url = new URL('/v1/chat/completions', base);
  const revision = createHash('sha256')
    .update(JSON.stringify({ id: 'minimax', version: 1, url: url.href, model }))
    .digest('hex');

  return {
    descriptor: {
      id: 'minimax',
      name: 'MiniMax',
      destination: base.origin,
      revision,
      maxDescriptionLength: MAX_DESCRIPTION_LENGTH,
    },
    async generate({ description, signal }): Promise<unknown> {
      const response = await fetch(url, {
        method: 'POST',
        redirect: 'error',
        signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: description },
          ],
          max_completion_tokens: 16384,
          reasoning_split: true,
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
      if (!isRecord(choice) || choice.finish_reason !== 'stop'
        || !isRecord(choice.message) || typeof choice.message.content !== 'string') {
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
