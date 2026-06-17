import { describe, expect, it } from 'vitest';
import { catalogueIdFromPath, entriesFromNameStatus } from './list-changed-catalogue-entries';

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