import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { serializeToRDF } from '../src/lib/rdf/serializer';
import { parseRDF } from '../src/lib/rdf/parser';

const ROOT = join(import.meta.dirname, '..');
const CATALOGUE_JSON = join(ROOT, 'public', 'catalogue.json');

function readCatalogue() {
  return JSON.parse(readFileSync(CATALOGUE_JSON, 'utf-8'));
}

describe('catalogue compilation (end-to-end)', () => {
  it('npm run catalogue:build succeeds with the real catalogue', () => {
    const result = execSync('npx tsx scripts/compile-catalogue.ts', {
      cwd: ROOT,
      encoding: 'utf-8',
      timeout: 30000,
    });
    expect(result).toContain('official/cosmic-coffee');
    expect(result).toContain('official/ecommerce');

    const output = readCatalogue();
    expect(output.count).toBe(48);
    expect(output.entries).toHaveLength(48);
    expect(output.generatedAt).toBeTruthy();
  });

  it('catalogue.json entries have required fields', () => {
    const output = readCatalogue();
    for (const entry of output.entries) {
      expect(entry.id).toBeTruthy();
      expect(entry.name).toBeTruthy();
      expect(entry.description).toBeTruthy();
      expect(entry.category).toBeTruthy();
      expect(['official', 'community', 'external']).toContain(entry.source);
      expect(entry.ontology).toBeTruthy();
      expect(entry.ontology.entityTypes.length).toBeGreaterThan(0);
      expect(Array.isArray(entry.bindings)).toBe(true);
      expect(Array.isArray(entry.tags)).toBe(true);
    }
  });

  it('cosmic-coffee entry preserves data bindings', () => {
    const coffee = readCatalogue().entries.find((e: { id: string }) => e.id === 'official/cosmic-coffee');
    expect(coffee).toBeTruthy();
    expect(coffee.bindings.length).toBeGreaterThan(0);
    expect(coffee.bindings[0].table).toBeTruthy();
    expect(coffee.bindings[0].columnMappings).toBeTruthy();
  });

  it('all ontologies round-trip through RDF serialization', () => {
    for (const entry of readCatalogue().entries) {
      const rdf = serializeToRDF(entry.ontology, entry.bindings);
      const reparsed = parseRDF(rdf);
      expect(reparsed.ontology.entityTypes.length).toBe(entry.ontology.entityTypes.length);
      expect(reparsed.ontology.relationships.length).toBe(entry.ontology.relationships.length);
    }
  });
});

describe('catalogue metadata validation', () => {
  it('all entries reference valid categories', () => {
    const validCats = ['retail', 'healthcare', 'finance', 'manufacturing', 'education', 'general', 'food', 'media', 'events', 'iq-lab', 'school', 'fibo'];
    for (const entry of readCatalogue().entries) {
      expect(validCats).toContain(entry.category);
    }
  });

  it('all entries have path-based ids', () => {
    for (const entry of readCatalogue().entries) {
      expect(entry.id).toMatch(/^(official|community|external)\//);
    }
  });
});
