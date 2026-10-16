import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import rdfCanonize from 'rdf-canonize';
import {
  decodeRdfBytes,
  parseRdfXmlDataset,
  serializeRdfXmlDataset,
} from './dataset';
import type { RdfQuad } from '../../types/rdfDocument';

const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const XSD = 'http://www.w3.org/2001/XMLSchema#';

const COMPLEX_RDF = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF
  xml:base="https://example.com/building/"
  xmlns:rdf="${RDF}"
  xmlns:rdfs="${RDFS}"
  xmlns:ex="https://example.com/ns#"
  xmlns:xsd="${XSD}">
  <rdf:Description rdf:about="#Room">
    <rdfs:label xml:lang="en">Room</rdfs:label>
    <rdfs:label xml:lang="fr">Pièce</rdfs:label>
    <ex:capacity rdf:datatype="${XSD}integer">0012</ex:capacity>
    <ex:restriction rdf:nodeID="restriction"/>
  </rdf:Description>
  <rdf:Description rdf:nodeID="restriction">
    <rdf:type rdf:resource="http://www.w3.org/2002/07/owl#Restriction"/>
    <ex:note>Keep &amp; preserve</ex:note>
  </rdf:Description>
</rdf:RDF>`;

async function canonicalize(quads: RdfQuad[]): Promise<string> {
  return rdfCanonize.canonize(quads, {
    algorithm: 'RDFC-1.0',
    format: 'application/n-quads',
  });
}

function orderedBlankNodeFingerprint(quads: RdfQuad[]): string[] {
  const blankNodes = new Map<string, string>();
  const term = (value: RdfQuad['subject'] | RdfQuad['object']) => {
    if (value.termType === 'Literal') {
      return JSON.stringify([
        value.termType,
        value.value,
        value.language,
        value.datatype.value,
      ]);
    }
    if (value.termType === 'BlankNode') {
      let normalized = blankNodes.get(value.value);
      if (!normalized) {
        normalized = `b${blankNodes.size}`;
        blankNodes.set(value.value, normalized);
      }
      return JSON.stringify([value.termType, normalized]);
    }
    return JSON.stringify([value.termType, value.value]);
  };
  return quads.map((quad) => JSON.stringify([
    term(quad.subject),
    quad.predicate.value,
    term(quad.object),
  ]));
}

describe('complete RDF/XML dataset adapter', () => {
  it('retains named nodes, blank nodes, languages, datatypes, and lexical forms', async () => {
    const quads = await parseRdfXmlDataset(
      COMPLEX_RDF,
      'https://fallback.example/source.rdf',
    );

    expect(quads).toHaveLength(6);
    expect(quads).toContainEqual(expect.objectContaining({
      subject: {
        termType: 'NamedNode',
        value: 'https://example.com/building/#Room',
      },
      predicate: { termType: 'NamedNode', value: `${RDFS}label` },
      object: expect.objectContaining({
        termType: 'Literal',
        value: 'Pièce',
        language: 'fr',
      }),
    }));
    expect(quads).toContainEqual(expect.objectContaining({
      predicate: {
        termType: 'NamedNode',
        value: 'https://example.com/ns#capacity',
      },
      object: {
        termType: 'Literal',
        value: '0012',
        language: '',
        datatype: { termType: 'NamedNode', value: `${XSD}integer` },
      },
    }));
    expect(quads.some((quad) =>
      quad.subject.termType === 'BlankNode'
      || quad.object.termType === 'BlankNode')).toBe(true);
  });

  it('round-trips an RDF graph isomorphically without network access', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const source = COMPLEX_RDF.replace(
      '</rdf:Description>',
      '<ex:imports rdf:resource="https://example.invalid/not-fetched"/></rdf:Description>',
    );
    const original = await parseRdfXmlDataset(
      source,
      'https://fallback.example/source.rdf',
    );
    const serialized = serializeRdfXmlDataset(original);
    const reparsed = await parseRdfXmlDataset(
      serialized,
      'https://fallback.example/export.rdf',
    );

    expect(await canonicalize(reparsed)).toBe(await canonicalize(original));
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('rejects DOCTYPE declarations before XML entity processing', async () => {
    await expect(parseRdfXmlDataset(
      `<?xml version="1.0"?>
<!DOCTYPE rdf:RDF [
  <!ENTITY payload "expanded">
]>
<rdf:RDF xmlns:rdf="${RDF}"/>`,
      'https://example.com/source.rdf',
    )).rejects.toThrow(/DOCTYPE declarations are not accepted/);
  });

  it('preserves carriage returns in literal lexical values', async () => {
    const source = `<rdf:RDF
  xmlns:rdf="${RDF}"
  xmlns:ex="https://example.com/">
  <rdf:Description rdf:about="https://example.com/subject">
    <ex:value>a&#xD;b</ex:value>
  </rdf:Description>
</rdf:RDF>`;
    const original = await parseRdfXmlDataset(
      source,
      'https://example.com/source.rdf',
    );
    const reparsed = await parseRdfXmlDataset(
      serializeRdfXmlDataset(original),
      'https://example.com/export.rdf',
    );

    expect(original[0].object).toMatchObject({ value: 'a\rb' });
    expect(reparsed[0].object).toMatchObject({ value: 'a\rb' });
  });

  it('rejects named graphs instead of silently flattening them', () => {
    const graphQuad: RdfQuad = {
      subject: { termType: 'NamedNode', value: 'https://example.com/s' },
      predicate: { termType: 'NamedNode', value: 'https://example.com/p' },
      object: { termType: 'NamedNode', value: 'https://example.com/o' },
      graph: { termType: 'NamedNode', value: 'https://example.com/graph' },
    };

    expect(() => serializeRdfXmlDataset([graphQuad]))
      .toThrow(/named graphs/i);
  });

  it('decodes UTF-8 BOM and UTF-16 input without changing the source bytes', () => {
    const utf8 = new Uint8Array([
      0xef,
      0xbb,
      0xbf,
      ...new TextEncoder().encode('<rdf:RDF/>'),
    ]);
    const utf16 = new Uint8Array([
      0xff, 0xfe,
      0x3c, 0x00,
      0x72, 0x00,
      0x64, 0x00,
      0x66, 0x00,
      0x3a, 0x00,
      0x52, 0x00,
      0x44, 0x00,
      0x46, 0x00,
      0x2f, 0x00,
      0x3e, 0x00,
    ]);

    expect(decodeRdfBytes(utf8)).toBe('<rdf:RDF/>');
    expect(decodeRdfBytes(utf16)).toBe('<rdf:RDF/>');
    expect(utf8[0]).toBe(0xef);
    expect(utf16[0]).toBe(0xff);
  });

  it('parses and reserializes the pinned Brick artifact isomorphically', async () => {
    const sourcePath = resolve(
      process.cwd(),
      'catalogue/external/brick-schema/brick/ontology.rdf',
    );
    const source = await readFile(sourcePath, 'utf-8');
    const baseIri = new URL(`file://${sourcePath}`).href;
    const original = await parseRdfXmlDataset(source, baseIri);

    // The source has one duplicate RDF 1.1 statement expressed once as a
    // simple literal and once explicitly as xsd:string.
    expect(original).toHaveLength(53_957);

    const serialized = serializeRdfXmlDataset(original);
    const reparsed = await parseRdfXmlDataset(serialized, baseIri);
    expect(reparsed).toHaveLength(53_957);
    expect(orderedBlankNodeFingerprint(reparsed))
      .toEqual(orderedBlankNodeFingerprint(original));
  }, 30_000);
});
