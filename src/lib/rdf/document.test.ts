import { describe, expect, it } from 'vitest';
import {
  applyLiteralEdit,
  createImportedRdfDocument,
  exportRdfDocument,
  isRdfDocumentDirty,
  materializeRdfDocument,
} from './document';
import { decodeRdfBytes, parseRdfXmlDataset } from './dataset';

const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const OWL = 'http://www.w3.org/2002/07/owl#';

const SOURCE = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF
  xmlns:rdf="${RDF}"
  xmlns:rdfs="${RDFS}"
  xmlns:owl="${OWL}"
  xmlns:ex="https://example.com/ns#">
  <owl:Ontology rdf:about="https://example.com/ontology">
    <rdfs:label xml:lang="en">Building ontology</rdfs:label>
  </owl:Ontology>
  <owl:Class rdf:about="https://example.com/ns#Room">
    <rdfs:label xml:lang="en">Room</rdfs:label>
    <rdfs:label xml:lang="fr">Pièce</rdfs:label>
    <rdfs:comment xml:lang="en">An enclosed space</rdfs:comment>
    <ex:unmapped rdf:nodeID="rule"/>
  </owl:Class>
  <rdf:Description rdf:nodeID="rule">
    <ex:payload>preserve me</ex:payload>
  </rdf:Description>
</rdf:RDF>`;

describe('RDF document preservation', () => {
  it('returns exact original bytes for an untouched imported document', async () => {
    const bytes = new TextEncoder().encode(SOURCE);
    const loaded = await createImportedRdfDocument(bytes, {
      name: 'building.rdf',
      baseIri: 'https://example.com/building.rdf',
    });
    const exported = await exportRdfDocument(loaded.document);

    expect(exported.kind).toBe('original');
    expect(Array.from(exported.bytes)).toEqual(Array.from(bytes));
    expect(isRdfDocumentDirty(loaded.document)).toBe(false);
    expect(loaded.ontology.name).toBe('Building ontology');
    expect(loaded.ontology.entityTypes[0].name).toBe('Room');
  });

  it('returns exact original UTF-16 bytes when untouched', async () => {
    const bytes = new Uint8Array(2 + SOURCE.length * 2);
    bytes[0] = 0xff;
    bytes[1] = 0xfe;
    for (let index = 0; index < SOURCE.length; index += 1) {
      const codeUnit = SOURCE.charCodeAt(index);
      bytes[2 + index * 2] = codeUnit & 0xff;
      bytes[3 + index * 2] = codeUnit >> 8;
    }
    const loaded = await createImportedRdfDocument(bytes, {
      name: 'building.rdf',
      baseIri: 'https://example.com/building.rdf',
    });

    const exported = await exportRdfDocument(loaded.document);

    expect(exported.kind).toBe('original');
    expect(Array.from(exported.bytes)).toEqual(Array.from(bytes));
  });

  it('preserves valid RDF with no visual classes', async () => {
    const source = `<?xml version="1.0"?>
<rdf:RDF
  xmlns:rdf="${RDF}"
  xmlns:ex="https://example.com/ns#">
  <rdf:Description rdf:about="https://example.com/resource">
    <ex:value>preserve me</ex:value>
  </rdf:Description>
</rdf:RDF>`;
    const bytes = new TextEncoder().encode(source);
    const loaded = await createImportedRdfDocument(bytes, {
      name: 'statements-only.rdf',
    });

    expect(loaded.ontology.entityTypes).toEqual([]);
    expect(loaded.document.originalQuads).toHaveLength(1);
    expect(Array.from((await exportRdfDocument(loaded.document)).bytes))
      .toEqual(Array.from(bytes));
  });

  it('patches one exact language-tagged label and preserves unrelated statements', async () => {
    const loaded = await createImportedRdfDocument(
      new TextEncoder().encode(SOURCE),
      {
        name: 'building.rdf',
        baseIri: 'https://example.com/building.rdf',
      },
    );
    const edited = applyLiteralEdit(
      loaded.document,
      loaded.document.projection.entities.room,
      `${RDFS}label`,
      'Room',
      'Space',
      'Rename Room',
    );
    const quads = materializeRdfDocument(edited);

    expect(isRdfDocumentDirty(edited)).toBe(true);
    expect(quads).toContainEqual(expect.objectContaining({
      object: expect.objectContaining({
        termType: 'Literal',
        value: 'Space',
        language: 'en',
      }),
    }));
    expect(quads).toContainEqual(expect.objectContaining({
      object: expect.objectContaining({
        termType: 'Literal',
        value: 'Pièce',
        language: 'fr',
      }),
    }));
    expect(quads).toContainEqual(expect.objectContaining({
      object: expect.objectContaining({
        termType: 'Literal',
        value: 'preserve me',
      }),
    }));

    const exported = await exportRdfDocument(edited);
    const reparsed = await parseRdfXmlDataset(
      decodeRdfBytes(exported.bytes),
      'https://example.com/export.rdf',
    );
    expect(exported).toMatchObject({
      kind: 'modified',
      sourceTripleCount: loaded.document.originalQuads.length,
      exportedTripleCount: loaded.document.originalQuads.length,
      patchCount: 1,
    });
    expect(reparsed).toContainEqual(expect.objectContaining({
      object: expect.objectContaining({
        termType: 'Literal',
        value: 'preserve me',
      }),
    }));
    expect(reparsed).toContainEqual(expect.objectContaining({
      object: expect.objectContaining({
        termType: 'Literal',
        value: 'Space',
        language: 'en',
      }),
    }));
  });

  it('adds derivation metadata only when explicitly requested', async () => {
    const loaded = await createImportedRdfDocument(
      new TextEncoder().encode(SOURCE),
      {
        name: 'building.rdf',
        baseIri: 'https://example.com/building.rdf',
      },
    );

    const exported = await exportRdfDocument(loaded.document, {
      includeDerivationMetadata: true,
    });
    const quads = await parseRdfXmlDataset(
      decodeRdfBytes(exported.bytes),
      'https://example.com/export.rdf',
    );

    expect(exported.kind).toBe('modified');
    expect(exported.derivationMetadataIncluded).toBe(true);
    expect(isRdfDocumentDirty(loaded.document)).toBe(false);
    expect(quads).toContainEqual(expect.objectContaining({
      subject: {
        termType: 'NamedNode',
        value: 'https://example.com/ontology',
      },
      predicate: {
        termType: 'NamedNode',
        value: 'http://www.w3.org/ns/prov#wasDerivedFrom',
      },
      object: {
        termType: 'NamedNode',
        value: `urn:${loaded.document.source.hash}`,
      },
    }));
  });

  it('adds derivation metadata for an empty ontology rdf:about resolved against the base', async () => {
    const source = `<?xml version="1.0"?>
<rdf:RDF
  xml:base="https://example.com/base-ontology"
  xmlns:rdf="${RDF}"
  xmlns:rdfs="${RDFS}"
  xmlns:owl="${OWL}">
  <owl:Ontology rdf:about="">
    <rdfs:label>Base ontology</rdfs:label>
  </owl:Ontology>
</rdf:RDF>`;
    const loaded = await createImportedRdfDocument(
      new TextEncoder().encode(source),
      { name: 'base-ontology.rdf' },
    );

    const exported = await exportRdfDocument(loaded.document, {
      includeDerivationMetadata: true,
    });
    const quads = await parseRdfXmlDataset(
      decodeRdfBytes(exported.bytes),
      'https://example.com/export.rdf',
    );

    expect(quads).toContainEqual(expect.objectContaining({
      subject: {
        termType: 'NamedNode',
        value: 'https://example.com/base-ontology',
      },
      predicate: {
        termType: 'NamedNode',
        value: 'http://www.w3.org/ns/prov#wasDerivedFrom',
      },
    }));
  });

  it('rejects an ambiguous visual label instead of guessing', async () => {
    const ambiguous = SOURCE.replace(
      '<rdfs:label xml:lang="fr">Pièce</rdfs:label>',
      '<rdfs:label xml:lang="fr">Room</rdfs:label>',
    );
    const loaded = await createImportedRdfDocument(
      new TextEncoder().encode(ambiguous),
      {
        name: 'building.rdf',
        baseIri: 'https://example.com/building.rdf',
      },
    );

    expect(() => applyLiteralEdit(
      loaded.document,
      loaded.document.projection.entities.room,
      `${RDFS}label`,
      'Room',
      'Space',
      'Rename Room',
    )).toThrow(/ambiguous/i);
  });
});
