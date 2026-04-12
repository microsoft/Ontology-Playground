import { describe, it, expect } from 'vitest';
import { encodeSharePayload, decodeSharePayload } from './shareCodec';
import type { Ontology, DataBinding } from '../data/ontology';

/** Helper: compress arbitrary JSON into the same format decodeSharePayload expects. */
async function compressPayload(obj: unknown): Promise<string> {
  const json = JSON.stringify(obj);
  const input = new TextEncoder().encode(json);
  const cs = new CompressionStream('deflate');
  const writer = cs.writable.getWriter();
  writer.write(input);
  writer.close();
  const chunks: Uint8Array[] = [];
  const reader = cs.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const compressed = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { compressed.set(c, offset); offset += c.length; }
  let binary = '';
  for (const b of compressed) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const sampleOntology: Ontology = {
  name: 'Test',
  description: 'A test ontology',
  entityTypes: [
    {
      id: 'e1',
      name: 'Person',
      icon: 'P',
      color: '#4A90D9',
      description: 'A person',
      properties: [
        { name: 'name', type: 'string', isIdentifier: true },
        { name: 'age', type: 'integer' },
      ],
    },
  ],
  relationships: [],
};

const sampleBindings: DataBinding[] = [];

describe('shareCodec', () => {
  it('roundtrips a small ontology', async () => {
    const encoded = await encodeSharePayload(sampleOntology, sampleBindings);
    expect(encoded).toBeDefined();
    expect(typeof encoded).toBe('string');

    const { ontology, bindings } = await decodeSharePayload(encoded!);
    expect(ontology.name).toBe('Test');
    expect(ontology.entityTypes).toHaveLength(1);
    expect(ontology.entityTypes[0].name).toBe('Person');
    expect(bindings).toEqual([]);
  });

  it('produces URL-safe characters only', async () => {
    const encoded = await encodeSharePayload(sampleOntology, sampleBindings);
    expect(encoded).toBeDefined();
    // Should only contain base64url characters
    expect(encoded).toMatch(/^[A-Za-z0-9\-_=+/]+$/);
  });

  it('throws on corrupted data', async () => {
    await expect(decodeSharePayload('not-valid-compressed-data!!!')).rejects.toThrow();
  });

  it('throws on empty payload', async () => {
    const encoded = await compressPayload({ foo: 'bar' });
    await expect(decodeSharePayload(encoded)).rejects.toThrow('Invalid share payload');
  });

  it('returns undefined for very large ontologies', async () => {
    // Generate random-ish names that don't compress well
    const rand = (i: number) => `E${i}_${Math.random().toString(36).slice(2)}`;
    const large: Ontology = {
      ...sampleOntology,
      entityTypes: Array.from({ length: 2000 }, (_, i) => ({
        id: `e${i}`,
        name: rand(i),
        icon: 'E',
        color: '#000000',
        description: rand(i) + rand(i) + rand(i),
        properties: Array.from({ length: 10 }, (_, j) => ({
          name: `p${j}_${rand(j)}`,
          type: 'string' as const,
        })),
      })),
    };
    const result = await encodeSharePayload(large, []);
    expect(result).toBeUndefined();
  });
});

// ── Security tests ───────────────────────────────────────

describe('shareCodec – security', () => {
  // --- Shape & type validation ---

  it('rejects payload where ontology is a string instead of an object', async () => {
    const encoded = await compressPayload({ ontology: 'not-an-object', bindings: [] });
    await expect(decodeSharePayload(encoded)).rejects.toThrow('Invalid share payload');
  });

  it('rejects payload where ontology is null', async () => {
    const encoded = await compressPayload({ ontology: null, bindings: [] });
    await expect(decodeSharePayload(encoded)).rejects.toThrow('Invalid share payload');
  });

  it('rejects payload where entityTypes is not an array', async () => {
    const encoded = await compressPayload({
      ontology: { name: 'X', entityTypes: 'not-array', relationships: [] },
      bindings: [],
    });
    await expect(decodeSharePayload(encoded)).rejects.toThrow('Invalid share payload');
  });

  it('rejects payload where relationships is missing', async () => {
    const encoded = await compressPayload({
      ontology: { name: 'X', entityTypes: [] },
      bindings: [],
    });
    await expect(decodeSharePayload(encoded)).rejects.toThrow('Invalid share payload');
  });

  it('rejects a JSON array instead of an object', async () => {
    const encoded = await compressPayload([1, 2, 3]);
    await expect(decodeSharePayload(encoded)).rejects.toThrow('Invalid share payload');
  });

  it('rejects a JSON number', async () => {
    const encoded = await compressPayload(42);
    await expect(decodeSharePayload(encoded)).rejects.toThrow('Invalid share payload');
  });

  // --- XSS via entity/property names ---

  it('XSS in entity name is treated as plain data, not executed', async () => {
    const xssOntology: Ontology = {
      name: '<script>alert("xss")</script>',
      description: '<img src=x onerror=alert(1)>',
      entityTypes: [{
        id: 'e1',
        name: '<script>alert("xss")</script>',
        description: '"><img src=x onerror=alert(1)>',
        icon: '<svg onload=alert(1)>',
        color: '#000',
        properties: [{ name: '<script>steal()</script>', type: 'string' }],
      }],
      relationships: [{
        id: 'r1',
        name: 'javascript:alert(1)',
        from: 'e1',
        to: 'e1',
        cardinality: 'one-to-one',
        description: '<iframe src="evil.com">',
      }],
    };
    const encoded = await encodeSharePayload(xssOntology, []);
    expect(encoded).toBeDefined();
    const { ontology } = await decodeSharePayload(encoded!);
    // Values come through as-is — they are strings, not executed
    expect(ontology.name).toBe('<script>alert("xss")</script>');
    expect(ontology.entityTypes[0].name).toBe('<script>alert("xss")</script>');
    expect(ontology.entityTypes[0].properties[0].name).toBe('<script>steal()</script>');
    expect(ontology.relationships[0].name).toBe('javascript:alert(1)');
  });

  // --- Prototype pollution ---

  it('rejects __proto__ pollution in ontology field', async () => {
    const encoded = await compressPayload({
      ontology: {
        name: 'Evil',
        entityTypes: [],
        relationships: [],
        '__proto__': { isAdmin: true },
      },
      bindings: [],
    });
    const { ontology } = await decodeSharePayload(encoded);
    // __proto__ should NOT pollute Object.prototype
    expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();
    // The field exists as a regular property but has no prototype effect
    expect(ontology.name).toBe('Evil');
  });

  it('rejects constructor pollution attempt', async () => {
    const encoded = await compressPayload({
      ontology: {
        name: 'Evil',
        entityTypes: [],
        relationships: [],
        constructor: { prototype: { isAdmin: true } },
      },
      bindings: [],
    });
    const { ontology } = await decodeSharePayload(encoded);
    expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();
    expect(ontology.name).toBe('Evil');
  });

  it('nested __proto__ in entity properties does not pollute prototype', async () => {
    const encoded = await compressPayload({
      ontology: {
        name: 'Evil',
        entityTypes: [{
          id: 'e1',
          name: 'E',
          description: '',
          icon: 'X',
          color: '#000',
          properties: [{ name: '__proto__', type: 'string', '__proto__': { polluted: true } }],
        }],
        relationships: [],
      },
      bindings: [],
    });
    const { ontology } = await decodeSharePayload(encoded);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(ontology.entityTypes[0].properties[0].name).toBe('__proto__');
  });

  // --- Non-JSON / invalid encoding ---

  it('throws on non-JSON compressed content (binary garbage)', async () => {
    // Compress raw bytes that aren't valid JSON
    const garbage = new Uint8Array([0x00, 0xff, 0xfe, 0x80, 0x01]);
    const cs = new CompressionStream('deflate');
    const writer = cs.writable.getWriter();
    writer.write(garbage);
    writer.close();
    const chunks: Uint8Array[] = [];
    const reader = cs.readable.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const total = chunks.reduce((s, c) => s + c.length, 0);
    const compressed = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) { compressed.set(c, offset); offset += c.length; }
    let binary = '';
    for (const b of compressed) binary += String.fromCharCode(b);
    const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    await expect(decodeSharePayload(encoded)).rejects.toThrow();
  });

  it('throws on empty string', async () => {
    await expect(decodeSharePayload('')).rejects.toThrow();
  });

  // --- SQL-injection-like strings pass through safely ---

  it('SQL injection strings are stored as plain data', async () => {
    const sqlOntology: Ontology = {
      name: "'; DROP TABLE ontologies; --",
      description: "1' OR '1'='1",
      entityTypes: [{
        id: 'e1',
        name: "Robert'); DROP TABLE Students;--",
        description: "' UNION SELECT * FROM users --",
        icon: 'X',
        color: '#000',
        properties: [{ name: "id' OR '1'='1", type: 'string' }],
      }],
      relationships: [],
    };
    const encoded = await encodeSharePayload(sqlOntology, []);
    expect(encoded).toBeDefined();
    const { ontology } = await decodeSharePayload(encoded!);
    expect(ontology.name).toBe("'; DROP TABLE ontologies; --");
    expect(ontology.entityTypes[0].name).toBe("Robert'); DROP TABLE Students;--");
  });

  // --- Deeply nested objects (resource exhaustion) ---

  it('handles deeply nested entity descriptions without crashing', async () => {
    // Build a deeply nested JSON string as a description value
    let nested = '"leaf"';
    for (let i = 0; i < 100; i++) nested = `{"a":${nested}}`;

    const o: Ontology = {
      name: 'Deep',
      description: nested,
      entityTypes: [{ id: 'e1', name: 'E', description: nested, icon: 'X', color: '#000', properties: [] }],
      relationships: [],
    };
    const encoded = await encodeSharePayload(o, []);
    expect(encoded).toBeDefined();
    const { ontology } = await decodeSharePayload(encoded!);
    // The nested JSON is just a string value, not parsed further
    expect(ontology.entityTypes[0].description).toBe(nested);
  });

  // --- Extra unexpected fields are ignored gracefully ---

  it('extra unexpected fields do not cause errors', async () => {
    const encoded = await compressPayload({
      ontology: {
        name: 'OK',
        description: 'fine',
        entityTypes: [],
        relationships: [],
        evil: '<script>alert(1)</script>',
        nested: { deep: { __proto__: { bad: true } } },
      },
      bindings: [],
      extraField: 'ignored',
    });
    const { ontology } = await decodeSharePayload(encoded);
    expect(ontology.name).toBe('OK');
    expect(({} as Record<string, unknown>).bad).toBeUndefined();
  });

  // --- Payload with bindings containing injection attempts ---

  it('bindings with injection strings pass through as data', async () => {
    const encoded = await compressPayload({
      ontology: {
        name: 'T',
        description: '',
        entityTypes: [{ id: 'e1', name: 'E', description: '', icon: 'X', color: '#000', properties: [] }],
        relationships: [],
      },
      bindings: [
        { entityTypeId: '<script>alert(1)</script>', source: "'; DROP TABLE; --" },
      ],
    });
    const { bindings } = await decodeSharePayload(encoded);
    expect(bindings[0].entityTypeId).toBe('<script>alert(1)</script>');
    expect(bindings[0].source).toBe("'; DROP TABLE; --");
  });
});
