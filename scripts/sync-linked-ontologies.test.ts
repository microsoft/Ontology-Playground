import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { syncLinkedOntologies } from './sync-linked-ontologies';

const VALID_RDF = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF
  xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
  xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
  xmlns:owl="http://www.w3.org/2002/07/owl#"
  xmlns:opmeta="https://microsoft.github.io/Ontology-Playground/ns/metadata#">
  <owl:Ontology rdf:about="https://example.com/local"/>
  <owl:Class rdf:about="https://example.com/local/Thing">
    <rdfs:label>Thing</rdfs:label>
  </owl:Class>
  <owl:DatatypeProperty rdf:about="https://example.com/local/Thing_id">
    <rdfs:label>id</rdfs:label>
    <rdfs:domain rdf:resource="https://example.com/local/Thing"/>
    <opmeta:isIdentifier>true</opmeta:isIdentifier>
    <opmeta:propertyType>enum</opmeta:propertyType>
  </owl:DatatypeProperty>
</rdf:RDF>
`;

function createFixture(): {
  configPath: string;
  projectRoot: string;
  sourcePath: string;
} {
  const projectRoot = mkdtempSync(join(tmpdir(), 'ontology-links-'));
  mkdirSync(join(projectRoot, 'catalogue', 'official'), { recursive: true });
  const sourcePath = join(projectRoot, 'source.rdf');
  const configPath = join(projectRoot, '.ontology-links.local.json');
  writeFileSync(sourcePath, VALID_RDF, 'utf-8');
  writeFileSync(configPath, JSON.stringify({
    version: 1,
    links: [{
      id: 'example',
      source: sourcePath,
      metadata: {
        name: 'Local example',
        description: 'A linked local ontology.',
        category: 'technology',
      },
      replacements: [{
        description: 'Use a string identifier',
        from: '<opmeta:propertyType>enum</opmeta:propertyType>',
        to: '<opmeta:propertyType>string</opmeta:propertyType>',
        expectedMatches: 1,
      }],
    }],
  }), 'utf-8');
  return { configPath, projectRoot, sourcePath };
}

interface FixtureConfig {
  version: 1;
  links: Array<{
    id: string;
    source: string;
    metadata: {
      name: string;
      description: string;
      category: string;
    };
    replacements: Array<{
      description: string;
      from: string;
      to: string;
      expectedMatches: number;
    }>;
  }>;
}

function readFixtureConfig(configPath: string): FixtureConfig {
  return JSON.parse(readFileSync(configPath, 'utf-8')) as FixtureConfig;
}

describe('syncLinkedOntologies', () => {
  it('is a no-op when the local config is absent', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'ontology-links-'));

    expect(syncLinkedOntologies({ projectRoot, silent: true })).toEqual({
      configPath: join(projectRoot, '.ontology-links.local.json'),
      configFound: false,
      links: [],
      removedCatalogueIds: [],
      sourcePaths: [],
    });
  });

  it('copies, transforms, and then leaves an unchanged linked source alone', () => {
    const fixture = createFixture();
    const first = syncLinkedOntologies({ ...fixture, silent: true });
    const second = syncLinkedOntologies({ ...fixture, silent: true });
    const output = readFileSync(first.links[0].outputPath, 'utf-8');

    expect(first.links[0]).toMatchObject({
      catalogueId: 'official/local-example',
      transformed: true,
      updated: true,
    });
    expect(output).toContain('<opmeta:propertyType>string</opmeta:propertyType>');
    expect(second.links[0].updated).toBe(false);
  });

  it('fails closed when a configured replacement no longer matches', () => {
    const fixture = createFixture();
    const config = readFixtureConfig(fixture.configPath);
    config.links[0].replacements[0].expectedMatches = 2;
    writeFileSync(fixture.configPath, JSON.stringify(config), 'utf-8');

    expect(() => syncLinkedOntologies({ ...fixture, silent: true }))
      .toThrow('expected 2 match(es), found 1');
  });

  it('refuses to overwrite an existing non-generated catalogue entry', () => {
    const fixture = createFixture();
    const outputDirectory = join(
      fixture.projectRoot,
      'catalogue',
      'official',
      'local-example',
    );
    mkdirSync(outputDirectory, { recursive: true });
    writeFileSync(join(outputDirectory, 'metadata.json'), '{}', 'utf-8');

    expect(() => syncLinkedOntologies({ ...fixture, silent: true }))
      .toThrow('refusing');
  });

  it('does not remove an empty unowned catalogue directory', () => {
    const fixture = createFixture();
    const outputDirectory = join(
      fixture.projectRoot,
      'catalogue',
      'official',
      'local-example',
    );
    mkdirSync(outputDirectory);

    expect(() => syncLinkedOntologies({ ...fixture, silent: true }))
      .toThrow('empty unowned catalogue entry');
    expect(existsSync(outputDirectory)).toBe(true);
  });

  it('removes marker-owned output after its config is removed', () => {
    const fixture = createFixture();
    const first = syncLinkedOntologies({ ...fixture, silent: true });
    const outputDirectory = join(
      fixture.projectRoot,
      'catalogue',
      'official',
      'local-example',
    );
    expect(existsSync(outputDirectory)).toBe(true);

    unlinkSync(fixture.configPath);
    const removed = syncLinkedOntologies({ ...fixture, silent: true });

    expect(removed).toMatchObject({
      configFound: false,
      links: [],
      removedCatalogueIds: ['official/local-example'],
    });
    expect(first.links).toHaveLength(1);
    expect(existsSync(outputDirectory)).toBe(false);
  });

  it('keeps the last generated entry when a configured source is missing', () => {
    const fixture = createFixture();
    const first = syncLinkedOntologies({ ...fixture, silent: true });
    const outputDirectory = dirname(first.links[0].outputPath);
    const generatedBefore = readFileSync(first.links[0].outputPath, 'utf-8');

    unlinkSync(fixture.sourcePath);

    expect(() => syncLinkedOntologies({ ...fixture, silent: true })).toThrow();
    expect(existsSync(outputDirectory)).toBe(true);
    expect(readFileSync(first.links[0].outputPath, 'utf-8'))
      .toBe(generatedBefore);

    writeFileSync(fixture.sourcePath, VALID_RDF, 'utf-8');
    expect(syncLinkedOntologies({ ...fixture, silent: true }).links[0].updated)
      .toBe(false);
  });

  it('reconciles renamed ids and permits a marker-owned source retarget', () => {
    const fixture = createFixture();
    syncLinkedOntologies({ ...fixture, silent: true });
    const nextSourcePath = join(fixture.projectRoot, 'next-source.rdf');
    writeFileSync(
      nextSourcePath,
      VALID_RDF.replaceAll('Thing', 'RetargetedThing'),
      'utf-8',
    );
    const config = readFixtureConfig(fixture.configPath);
    config.links[0].id = 'renamed';
    config.links[0].source = nextSourcePath;
    writeFileSync(fixture.configPath, JSON.stringify(config), 'utf-8');

    const result = syncLinkedOntologies({ ...fixture, silent: true });
    const oldDirectory = join(
      fixture.projectRoot,
      'catalogue',
      'official',
      'local-example',
    );

    expect(result.removedCatalogueIds).toEqual(['official/local-example']);
    expect(result.links[0]).toMatchObject({
      catalogueId: 'official/local-renamed',
      sourcePath: nextSourcePath,
      updated: true,
    });
    expect(existsSync(oldDirectory)).toBe(false);
    expect(readFileSync(result.links[0].outputPath, 'utf-8'))
      .toContain('RetargetedThing');

    config.links[0].source = fixture.sourcePath;
    writeFileSync(fixture.configPath, JSON.stringify(config), 'utf-8');
    expect(() => syncLinkedOntologies({ ...fixture, silent: true }))
      .not.toThrow();
  });

  it('rejects a symlinked catalogue ancestor before writing outside the project', () => {
    const fixture = createFixture();
    const outsideDirectory = mkdtempSync(join(tmpdir(), 'ontology-links-outside-'));
    const alternateRoot = mkdtempSync(join(tmpdir(), 'ontology-links-root-'));
    symlinkSync(outsideDirectory, join(alternateRoot, 'catalogue'));
    writeFileSync(
      join(alternateRoot, '.ontology-links.local.json'),
      readFileSync(fixture.configPath),
    );

    expect(() => syncLinkedOntologies({ projectRoot: alternateRoot, silent: true }))
      .toThrow('expected a regular directory, not a symlink');
    expect(existsSync(join(outsideDirectory, 'official'))).toBe(false);
  });

  it('rejects symlinked generated files without modifying their targets', () => {
    const fixture = createFixture();
    const result = syncLinkedOntologies({ ...fixture, silent: true });
    const metadataPath = join(
      dirname(result.links[0].outputPath),
      'metadata.json',
    );
    const outsidePath = join(fixture.projectRoot, 'outside.json');
    writeFileSync(outsidePath, 'do not change', 'utf-8');
    unlinkSync(metadataPath);
    symlinkSync(outsidePath, metadataPath);

    expect(() => syncLinkedOntologies({ ...fixture, silent: true }))
      .toThrow('generated entry files must be regular files');
    expect(readFileSync(outsidePath, 'utf-8')).toBe('do not change');
  });

  it('prepares every link before materialising any output', () => {
    const fixture = createFixture();
    const config = readFixtureConfig(fixture.configPath);
    config.links[0].id = 'first';
    config.links.push({
      ...config.links[0],
      id: 'second',
      replacements: [{
        ...config.links[0].replacements[0],
        expectedMatches: 2,
      }],
    });
    writeFileSync(fixture.configPath, JSON.stringify(config), 'utf-8');

    expect(() => syncLinkedOntologies({ ...fixture, silent: true }))
      .toThrow('expected 2 match(es), found 1');
    expect(existsSync(join(
      fixture.projectRoot,
      'catalogue',
      'official',
      'local-first',
    ))).toBe(false);
  });

  it('recovers exact markerless partial output from an interrupted older sync', () => {
    const fixture = createFixture();
    const first = syncLinkedOntologies({ ...fixture, silent: true });
    const outputDirectory = dirname(first.links[0].outputPath);
    unlinkSync(join(outputDirectory, '.ontology-link.json'));

    const recovered = syncLinkedOntologies({ ...fixture, silent: true });

    expect(recovered.links[0].updated).toBe(true);
    expect(existsSync(join(outputDirectory, '.ontology-link.json'))).toBe(true);
  });

  it('cleans owned orphan temp files and interrupted staging directories', () => {
    const fixture = createFixture();
    const first = syncLinkedOntologies({ ...fixture, silent: true });
    const outputDirectory = dirname(first.links[0].outputPath);
    const orphanTemp = join(
      outputDirectory,
      'ontology.rdf.tmp-123-12345678-1234-1234-1234-123456789abc',
    );
    writeFileSync(orphanTemp, 'partial', 'utf-8');

    const stagingRoot = join(fixture.projectRoot, '.ontology-links-tmp');
    const stagingEntry = join(
      stagingRoot,
      'local-example-12345678-1234-1234-1234-123456789abc',
    );
    mkdirSync(stagingEntry, { recursive: true });
    writeFileSync(join(stagingEntry, 'ontology.rdf'), 'partial', 'utf-8');

    const recovered = syncLinkedOntologies({ ...fixture, silent: true });

    expect(recovered.links[0].updated).toBe(false);
    expect(existsSync(orphanTemp)).toBe(false);
    expect(existsSync(stagingRoot)).toBe(false);
  });

  it('does not mutate an unowned markerless directory when recovery fails', () => {
    const fixture = createFixture();
    const outputDirectory = join(
      fixture.projectRoot,
      'catalogue',
      'official',
      'local-example',
    );
    mkdirSync(outputDirectory);
    const orphanTemp = join(
      outputDirectory,
      'ontology.rdf.tmp-123-12345678-1234-1234-1234-123456789abc',
    );
    const differentMetadata = join(outputDirectory, 'metadata.json');
    writeFileSync(orphanTemp, 'user-owned temp', 'utf-8');
    writeFileSync(differentMetadata, '{"different":true}', 'utf-8');

    expect(() => syncLinkedOntologies({ ...fixture, silent: true }))
      .toThrow('different content');
    expect(readFileSync(orphanTemp, 'utf-8')).toBe('user-owned temp');
    expect(readFileSync(differentMetadata, 'utf-8'))
      .toBe('{"different":true}');
  });
});
