import { describe, expect, it } from 'vitest';
import { matchesGenerationConnector, parseGenerationConnector } from './generationConnector';

const connector = {
  id: 'configured-provider',
  name: 'Configured AI',
  destination: 'https://provider.example',
  revision: 'a'.repeat(64),
  maxDescriptionLength: 8000 as const,
};

describe('generation connector contract', () => {
  it('accepts only a bounded server descriptor with an HTTPS origin', () => {
    expect(parseGenerationConnector({ connector })).toEqual(connector);
    expect(parseGenerationConnector({
      connector: { ...connector, id: 'a'.repeat(64), name: 'a'.repeat(120) },
    })).toEqual({ ...connector, id: 'a'.repeat(64), name: 'a'.repeat(120) });
  });

  it.each([
    null, [], {}, { connector: null }, { connector, extra: true },
    ...[
      { id: '' }, { id: 'a'.repeat(65) }, { name: ' ' }, { name: 'a'.repeat(121) },
      { name: 'bad\nname' }, { destination: 'http://localhost:8080' },
      { destination: 'https://user:password@provider.example' },
      { destination: 'https://provider.example/path' },
      { destination: 'https://provider.example/' },
      { destination: 'https://provider.example?key=secret' },
      { destination: 'https://provider.example#fragment' },
      { destination: 'javascript:alert(1)' }, { revision: 'A'.repeat(64) },
      { revision: 'a'.repeat(63) }, { maxDescriptionLength: 8001 },
      { maxDescriptionLength: '8000' }, { extra: 'unexpected' },
    ].map(fields => ({ connector: { ...connector, ...fields } })),
  ])('rejects malformed metadata: %j', value => {
    expect(() => parseGenerationConnector(value)).toThrow(/configuration is invalid/);
  });

  it('requires an exact response connector binding', () => {
    const binding = { id: connector.id, revision: connector.revision };
    expect(matchesGenerationConnector(binding, connector)).toBe(true);
    expect(matchesGenerationConnector({ ...binding, extra: true }, connector)).toBe(false);
    expect(matchesGenerationConnector({ ...binding, revision: 'b'.repeat(64) }, connector)).toBe(false);
    expect(matchesGenerationConnector({ ...binding, id: 'other' }, connector)).toBe(false);
    expect(matchesGenerationConnector(null, connector)).toBe(false);
  });
});
