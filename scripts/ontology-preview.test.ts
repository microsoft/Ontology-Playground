import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  catalogueIdFromPath,
  entriesFromNameStatus,
  type OntologyPreviewManifest,
} from './list-changed-catalogue-entries';
import {
  preparePreviewAssets,
  validateManifest,
  type RenderedManifest,
  type TrustedPreviewRun,
} from './prepare-ontology-preview-assets';
import { writeRenderedManifest } from './render-ontology-previews';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
  temporaryDirectories.length = 0;
});

describe('ontology preview changed-entry detection', () => {
  it('maps catalogue paths to compiler-compatible ids', () => {
    expect(catalogueIdFromPath('catalogue/official/cosmic-coffee/metadata.json')).toBe('official/cosmic-coffee');
    expect(catalogueIdFromPath('catalogue/community/alice/supply-chain/ontology.rdf')).toBe('community/alice/supply-chain');
    expect(catalogueIdFromPath('catalogue/external/schema/pizza/pizza.owl')).toBe('external/schema/pizza');
    expect(catalogueIdFromPath('catalogue/community/alice/metadata.json')).toBeUndefined();
    expect(catalogueIdFromPath('src/components/OntologyGraph.tsx')).toBeUndefined();
  });

  it('deduplicates modified metadata and RDF files while ignoring deletes', () => {
    const entries = entriesFromNameStatus([
      'M\tcatalogue/community/alice/supply-chain/metadata.json',
      'M\tcatalogue/community/alice/supply-chain/ontology.rdf',
      'D\tcatalogue/community/bob/old-entry/ontology.rdf',
      'R100\tcatalogue/community/eve/old/ontology.rdf\tcatalogue/community/eve/new/ontology.rdf',
      'M\tREADME.md',
    ].join('\n'));

    expect(entries).toEqual([
      {
        id: 'community/alice/supply-chain',
        safeName: 'community-alice-supply-chain',
        changedFiles: [
          'catalogue/community/alice/supply-chain/metadata.json',
          'catalogue/community/alice/supply-chain/ontology.rdf',
        ],
      },
      {
        id: 'community/eve/new',
        safeName: 'community-eve-new',
        changedFiles: ['catalogue/community/eve/new/ontology.rdf'],
      },
    ]);
  });

  it('does not map catalogue files outside a valid ontology directory', () => {
    const entries = entriesFromNameStatus([
      'A\tcatalogue/community/Aala_Ali/understanding-telecom-customers-through-ontology.rdf',
      'A\tcatalogue/community/metadata.json',
      'A\tcatalogue/community/alice/valid-entry/ontology.rdf',
    ].join('\n'));

    expect(entries).toEqual([
      {
        id: 'community/alice/valid-entry',
        safeName: 'community-alice-valid-entry',
        changedFiles: ['catalogue/community/alice/valid-entry/ontology.rdf'],
      },
    ]);
  });
});

describe('ontology preview artifact authentication', () => {
  const trustedRun: TrustedPreviewRun = {
    prNumber: 42,
    headSha: '0123456789abcdef0123456789abcdef01234567',
    repository: 'microsoft/Ontology-Playground',
  };

  const manifest: RenderedManifest = {
    ...trustedRun,
    previews: [
      {
        id: 'community/alice/supply-chain',
        file: 'community-alice-supply-chain.png',
        bytes: 2048,
      },
    ],
  };

  it('accepts a manifest bound to trusted workflow-run metadata', () => {
    expect(() => validateManifest(manifest, trustedRun)).not.toThrow();
  });

  it('rejects manifest identity fields that do not match the workflow run', () => {
    expect(() => validateManifest(
      { ...manifest, prNumber: 7 },
      trustedRun,
    )).toThrow(/PR number does not match/);
    expect(() => validateManifest(
      { ...manifest, headSha: 'abcdef0123456789abcdef0123456789abcdef01' },
      trustedRun,
    )).toThrow(/head SHA does not match/);
    expect(() => validateManifest(
      { ...manifest, repository: 'attacker/fork' },
      trustedRun,
    )).toThrow(/repository does not match/);
  });

  it('rejects catalogue IDs that could inject preview comment markdown', () => {
    expect(() => validateManifest({
      ...manifest,
      previews: [
        {
          id: 'official/safe\n\n[click](https://attacker.example)',
          file: 'official-safe.png',
          bytes: 2048,
        },
      ],
    }, trustedRun)).toThrow(/invalid catalogue ID/);
  });

  it('requires preview filenames to be derived from their catalogue IDs', () => {
    expect(() => validateManifest({
      ...manifest,
      previews: [
        {
          id: 'official/cosmic-coffee',
          file: 'different.png',
          bytes: 2048,
        },
      ],
    }, trustedRun)).toThrow(/filename does not match catalogue ID/);
  });

  it('creates a publishable sanitized package when there are no previews', () => {
    const root = mkdtempSync(join(tmpdir(), 'ontology-preview-'));
    temporaryDirectories.push(root);
    const artifactDir = join(root, 'artifact');
    const publishDir = join(root, 'publish');
    const commentPath = join(root, 'comment.md');
    const sourceManifest: OntologyPreviewManifest = {
      ...trustedRun,
      baseSha: 'abcdef0123456789abcdef0123456789abcdef01',
      entries: [],
    };
    writeRenderedManifest(artifactDir, sourceManifest, []);

    preparePreviewAssets({
      manifest: join(artifactDir, 'manifest.json'),
      artifactDir,
      publishDir,
      comment: commentPath,
      branch: 'ontology-preview-assets',
      expectedRun: trustedRun,
    });

    const sanitizedManifest = join(
      publishDir,
      `pr-${trustedRun.prNumber}`,
      trustedRun.headSha,
      'manifest.json',
    );
    const zeroPreviewManifest: RenderedManifest = {
      ...trustedRun,
      previews: [],
    };
    expect(existsSync(sanitizedManifest)).toBe(true);
    expect(JSON.parse(readFileSync(sanitizedManifest, 'utf-8'))).toEqual(zeroPreviewManifest);
    expect(readFileSync(commentPath, 'utf-8')).toContain(
      'No changed catalogue ontology entries were detected in this PR.',
    );
  });
});