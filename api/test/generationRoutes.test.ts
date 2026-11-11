import { describe, expect, it, vi } from 'vitest';

const { http } = vi.hoisted(() => ({ http: vi.fn() }));
vi.mock('@azure/functions', () => ({ app: { http } }));

describe('AI function access boundaries', () => {
  it('registers only function-key-protected generation and metadata routes', async () => {
    await import('../src/functions/generateOntology');
    await import('../src/functions/generationConnector');
    expect(http).toHaveBeenCalledTimes(2);
    expect(http).toHaveBeenCalledWith('generateOntology', expect.objectContaining({
      methods: ['POST'], authLevel: 'function', route: 'generate-ontology',
    }));
    expect(http).toHaveBeenCalledWith('generationConnector', expect.objectContaining({
      methods: ['GET'], authLevel: 'function', route: 'generation-connector',
    }));
  });
});
