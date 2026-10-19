import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runCatalogueCompiler } from './compile-catalogue';
import { runValidationCli, validateRdfFile } from './validate-rdf';

const temporaryDirectories: string[] = [];
const ROOT = join(import.meta.dirname, '..');

const EXTERNAL_RDF = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
         xmlns:owl="http://www.w3.org/2002/07/owl#">
  <owl:Class rdf:about="https://example.org/ExternalClass">
    <rdfs:label>External Class With A Long Display Label</rdfs:label>
  </owl:Class>
</rdf:RDF>`;

const AUTHORED_RDF = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
         xmlns:owl="http://www.w3.org/2002/07/owl#"
         xmlns:xsd="http://www.w3.org/2001/XMLSchema#"
         xmlns:ont="https://example.org/ontology/">
  <owl:Class rdf:about="https://example.org/ontology/Example">
    <rdfs:label>Example</rdfs:label>
  </owl:Class>
  <owl:DatatypeProperty rdf:about="https://example.org/ontology/exampleId">
    <rdfs:label>exampleId</rdfs:label>
    <rdfs:domain rdf:resource="https://example.org/ontology/Example"/>
    <rdfs:range rdf:resource="http://www.w3.org/2001/XMLSchema#string"/>
    <ont:isIdentifier rdf:datatype="http://www.w3.org/2001/XMLSchema#boolean">true</ont:isIdentifier>
    <ont:propertyType>string</ont:propertyType>
  </owl:DatatypeProperty>
</rdf:RDF>`;

const COLLIDING_RDF = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:owl="http://www.w3.org/2002/07/owl#">
  <owl:Class rdf:about="https://one.example/Thing"/>
  <owl:Class rdf:about="https://two.example/Thing"/>
</rdf:RDF>`;

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

function createTemporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'validate-rdf-'));
  temporaryDirectories.push(root);
  for (const tier of ['official', 'community', 'external']) {
    mkdirSync(join(root, 'catalogue', tier), { recursive: true });
  }
  return root;
}

function writeEntry(
  root: string,
  relativeDirectory: string,
  rdf: string,
  metadata: Record<string, unknown>,
): string {
  const directory = join(root, 'catalogue', relativeDirectory);
  mkdirSync(directory, { recursive: true });
  const filePath = join(directory, 'ontology.rdf');
  writeFileSync(filePath, rdf);
  writeFileSync(
    join(directory, 'metadata.json'),
    JSON.stringify(metadata),
  );
  return filePath;
}

function externalMetadata() {
  return {
    name: 'External Standard',
    description: 'A standalone external standard.',
    category: 'general',
    license: 'BSD-3-Clause',
    sourceUrl: 'https://example.org/standard.rdf',
  };
}

function silenceConsole(): void {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
}

describe('RDF validation profiles', () => {
  it('accepts external labels and missing Designer identifiers as warnings', () => {
    const root = createTemporaryRoot();
    const filePath = writeEntry(
      root,
      'external/example/standard',
      EXTERNAL_RDF,
      externalMetadata(),
    );

    const result = validateRdfFile(filePath, 'external');

    expect(result.errors).toHaveLength(0);
    expect(result.warnings.map((candidate) => candidate.code)).toEqual([
      'designer-identifiers',
      'designer-entity-names',
    ]);
  });

  it('rejects the same model under the authored profile', () => {
    const root = createTemporaryRoot();
    const filePath = writeEntry(
      root,
      'external/example/standard',
      EXTERNAL_RDF,
      externalMetadata(),
    );

    const result = validateRdfFile(filePath, 'official');

    expect(result.errors.some((candidate) =>
      candidate.message.includes('has no identifier property'))).toBe(true);
    expect(result.errors.some((candidate) =>
      candidate.message.includes('exceeds 26 characters'))).toBe(true);
  });

  it('rejects malformed RDF under every profile', () => {
    const root = createTemporaryRoot();
    const filePath = writeEntry(
      root,
      'external/example/standard',
      '<rdf:RDF>',
      externalMetadata(),
    );

    expect(validateRdfFile(
      filePath,
      'external',
    ).errors).not.toHaveLength(0);
    expect(validateRdfFile(
      filePath,
      'official',
    ).errors).not.toHaveLength(0);
  });

  it('rejects source identifier collisions before parser normalization', () => {
    const root = createTemporaryRoot();
    const filePath = writeEntry(
      root,
      'external/example/standard',
      COLLIDING_RDF,
      externalMetadata(),
    );

    expect(validateRdfFile(
      filePath,
      'external',
    ).errors).toContainEqual(expect.objectContaining({
      code: 'source-graph-id-collision',
    }));
  });

  it('validates the real Brick graph under the external profile', () => {
    const filePath = join(
      ROOT,
      'catalogue',
      'external',
      'brick-schema',
      'brick',
      'ontology.rdf',
    );

    const result = validateRdfFile(filePath, 'external');

    expect(result.errors).toHaveLength(0);
    expect(result.ontology?.entityTypes).toHaveLength(1_518);
    expect(result.ontology?.relationships).toHaveLength(1_736);
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      'source-only-semantics',
      'designer-identifiers',
      'designer-entity-names',
    ]);
  }, 120_000);

  it('requires companion provenance for standalone external CLI validation', () => {
    const root = createTemporaryRoot();
    const directory = join(root, 'standalone');
    mkdirSync(directory);
    const filePath = join(directory, 'external.rdf');
    writeFileSync(filePath, EXTERNAL_RDF);
    silenceConsole();

    expect(runValidationCli([
      '--profile',
      'external',
      filePath,
    ], root)).toBe(1);

    writeFileSync(
      join(directory, 'metadata.json'),
      JSON.stringify(externalMetadata()),
    );
    expect(runValidationCli([
      '--profile',
      'external',
      filePath,
    ], root)).toBe(0);
  });
});

describe('catalogue profile discovery', () => {
  it('discovers and validates official, community, and external tiers', () => {
    const root = createTemporaryRoot();
    writeEntry(
      root,
      'official/official-entry',
      AUTHORED_RDF,
      {
        name: 'Official',
        description: 'Official authored example.',
        category: 'general',
      },
    );
    writeEntry(
      root,
      'community/alice/community-entry',
      AUTHORED_RDF,
      {
        name: 'Community',
        description: 'Community authored example.',
        category: 'general',
      },
    );
    writeEntry(
      root,
      'external/example/external-entry',
      EXTERNAL_RDF,
      externalMetadata(),
    );
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((message?: unknown) => {
      output.push(String(message));
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(runValidationCli([], root)).toBe(0);
    expect(output.some((line) =>
      line.includes('catalogue/official/official-entry/'))).toBe(true);
    expect(output.some((line) =>
      line.includes('catalogue/community/alice/community-entry/'))).toBe(true);
    expect(output.some((line) =>
      line.includes('catalogue/external/example/external-entry/'))).toBe(true);
  });

  it('keeps compiler and CLI profile decisions in agreement', () => {
    const root = createTemporaryRoot();
    const filePath = writeEntry(
      root,
      'external/example/standard',
      EXTERNAL_RDF,
      externalMetadata(),
    );
    const outputPath = join(root, 'public', 'catalogue.json');
    silenceConsole();

    expect(runValidationCli([], root)).toBe(0);
    expect(() => runCatalogueCompiler(
      join(root, 'catalogue'),
      outputPath,
    )).not.toThrow();

    writeFileSync(join(dirname(filePath), 'metadata.json'), JSON.stringify({
      ...externalMetadata(),
      sourceUrl: 'javascript:alert(1)',
    }));

    expect(runValidationCli([], root)).toBe(1);
    expect(() => runCatalogueCompiler(
      join(root, 'catalogue'),
      outputPath,
    )).toThrow('Catalogue compilation failed');

    writeFileSync(
      join(dirname(filePath), 'metadata.json'),
      JSON.stringify(externalMetadata()),
    );
    writeFileSync(filePath, COLLIDING_RDF);

    expect(runValidationCli([], root)).toBe(1);
    expect(() => runCatalogueCompiler(
      join(root, 'catalogue'),
      outputPath,
    )).toThrow('Catalogue compilation failed');
  });

  it('infers the external profile for explicit catalogue paths', () => {
    const root = createTemporaryRoot();
    const filePath = writeEntry(
      root,
      'external/example/standard',
      EXTERNAL_RDF,
      externalMetadata(),
    );
    silenceConsole();

    expect(runValidationCli([
      filePath,
    ], root)).toBe(0);
  });

  it('rejects profile overrides for catalogue paths', () => {
    const root = createTemporaryRoot();
    const filePath = writeEntry(
      root,
      'external/example/standard',
      EXTERNAL_RDF,
      externalMetadata(),
    );
    silenceConsole();

    expect(runValidationCli([
      '--profile',
      'external',
      filePath,
    ], root)).toBe(1);
  });

  it.skipIf(process.platform === 'win32')(
    'binds filesystem aliases to the discovered catalogue tier',
    () => {
      const root = createTemporaryRoot();
      writeEntry(
        root,
        'external/example/standard',
        EXTERNAL_RDF,
        externalMetadata(),
      );
      const alias = join(root, 'catalogue-alias');
      symlinkSync(join(root, 'catalogue'), alias, 'dir');
      const aliasedFile = join(
        alias,
        'external',
        'example',
        'standard',
        'ontology.rdf',
      );
      silenceConsole();

      expect(runValidationCli([
        '--profile',
        'external',
        aliasedFile,
      ], root)).toBe(1);
      expect(runValidationCli([
        aliasedFile,
      ], root)).toBe(0);
    },
  );

  it('binds hard-link aliases to the discovered catalogue tier', () => {
    const root = createTemporaryRoot();
    const filePath = writeEntry(
      root,
      'external/example/standard',
      EXTERNAL_RDF,
      externalMetadata(),
    );
    const hardLinkPath = join(root, 'hard-linked-ontology.rdf');
    linkSync(filePath, hardLinkPath);
    writeFileSync(
      join(root, 'metadata.json'),
      JSON.stringify(externalMetadata()),
    );
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((message?: unknown) => {
      output.push(String(message));
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(runValidationCli([
      '--profile',
      'external',
      hardLinkPath,
    ], root)).toBe(1);
    expect(output.some((line) =>
      line.includes('catalogue-profile-override'))).toBe(true);

    expect(runValidationCli([
      hardLinkPath,
    ], root)).toBe(0);
  });

  it('requires metadata for explicitly validated catalogue entries', () => {
    const root = createTemporaryRoot();
    const filePath = writeEntry(
      root,
      'official/official-entry',
      AUTHORED_RDF,
      {
        name: 'Official',
        description: 'Official authored example.',
        category: 'general',
      },
    );
    rmSync(join(dirname(filePath), 'metadata.json'));
    silenceConsole();

    expect(runValidationCli([
      filePath,
    ], root)).toBe(1);
  });
});
