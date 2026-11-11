import { describe, expect, it } from 'vitest';
import { buildApiUrl } from './api';

describe('buildApiUrl', () => {
  it('uses the same-origin API route by default', () => {
    expect(buildApiUrl('generate-ontology', undefined)).toBe(
      '/api/generate-ontology',
    );
  });

  it('uses a separately deployed API base', () => {
    expect(buildApiUrl(
      '/generate-ontology',
      'https://example.azurewebsites.net/api/',
    )).toBe(
      'https://example.azurewebsites.net/api/generate-ontology',
    );
  });
});
