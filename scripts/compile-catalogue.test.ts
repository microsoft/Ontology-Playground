import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { serializeToRDF } from '../src/lib/rdf/serializer';
import { parseRDF } from '../src/lib/rdf/parser';

const ROOT = join(import.meta.dirname, '..');
const CATALOGUE_JSON = join(ROOT, 'public', 'catalogue.json');
const COMMUNITY_DIR = join(ROOT, 'catalogue', 'community');

interface CatalogueTestEntry {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  author: string;
  source: 'official' | 'community' | 'external';
  ontology: {
    entityTypes: { name: string; properties: { isIdentifier?: boolean }[] }[];
    relationships: unknown[];
  };
  bindings: unknown[];
}

interface CatalogueTestOutput {
  count: number;
  generatedAt: string;
  entries: CatalogueTestEntry[];
}

function readCatalogue(): CatalogueTestOutput {
  return JSON.parse(readFileSync(CATALOGUE_JSON, 'utf-8')) as CatalogueTestOutput;
}

function findEntry(id: string): CatalogueTestEntry {
  const entry = readCatalogue().entries.find((candidate) => candidate.id === id);
  expect(entry).toBeTruthy();
  return entry as CatalogueTestEntry;
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
    expect(output.count).toBe(output.entries.length);
    expect(output.entries.length).toBeGreaterThan(0);
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
      expect(entry.id).not.toContain('\\');
    }
  });

  it('community entries use username and slug path ids', () => {
    for (const entry of readCatalogue().entries.filter((candidate) => candidate.source === 'community')) {
      const parts = entry.id.split('/');
      expect(parts).toHaveLength(3);
      expect(parts[1]).toBeTruthy();
      expect(parts[2]).toBeTruthy();
    }
  });

  it('community source folders contain only username/slug ontology entries', () => {
    for (const username of readdirSync(COMMUNITY_DIR)) {
      const userDir = join(COMMUNITY_DIR, username);
      if (!statSync(userDir).isDirectory()) {
        expect(username).toBe('README.md');
        continue;
      }

      for (const slug of readdirSync(userDir)) {
        const slugDir = join(userDir, slug);
        if (!statSync(slugDir).isDirectory()) {
          expect(slug).toBe('README.md');
          continue;
        }
        expect(existsSync(join(slugDir, 'metadata.json'))).toBe(true);

        const rdfFiles = readdirSync(slugDir).filter((file) => file.endsWith('.rdf') || file.endsWith('.owl'));
        expect(rdfFiles.length).toBeGreaterThan(0);
      }
    }
  });

  it('includes the supply chain disruption community ontology', () => {
    const entry = findEntry('community/ravi-chandu/supply-chain-disruption-risk-propagation');
    const entityNames = entry.ontology.entityTypes.map((entity) => entity.name);
    const identifierCount = entry.ontology.entityTypes.filter((entity) =>
      entity.properties.some((property) => property.isIdentifier),
    ).length;

    expect(entry.name).toBe('Supply Chain Disruption & Risk Propagation');
    expect(entry.category).toBe('manufacturing');
    expect(entry.author).toBe('Ravi Chandu Edru');
    expect(entry.tags).toEqual(expect.arrayContaining(['supply-chain', 'risk', 'operations', 'mitigation']));
    expect(entityNames).toEqual(expect.arrayContaining([
      'Supplier',
      'Component',
      'ProductLine',
      'DisruptionEvent',
      'RiskAssessment',
      'MitigationAction',
      'AlternativeSupplier',
    ]));
    expect(entry.ontology.entityTypes.length).toBeGreaterThanOrEqual(7);
    expect(entry.ontology.relationships.length).toBeGreaterThanOrEqual(7);
    expect(identifierCount).toBe(entry.ontology.entityTypes.length);
  });
});
