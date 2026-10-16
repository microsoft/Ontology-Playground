import { RdfXmlParser } from 'rdfxml-streaming-parser';
import type {
  RdfGraph,
  RdfNamedNode,
  RdfObject,
  RdfQuad,
  RdfSubject,
} from '../../types/rdfDocument';

const RDF_NS = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const XSD_STRING = 'http://www.w3.org/2001/XMLSchema#string';
const RDF_LANG_STRING = `${RDF_NS}langString`;
const MAX_RDF_QUADS = 250_000;
const NC_NAME_RE = new RegExp(
  // eslint-disable-next-line no-misleading-character-class -- XML NCNames intentionally allow combining-mark ranges.
  String.raw`^[_\p{L}][-\p{L}\p{N}._\u00B7\u0300-\u036F\u203F-\u2040]*$`,
  'u',
);

interface RdfJsTerm {
  termType: string;
  value: string;
  language?: string;
  datatype?: RdfJsTerm;
}

interface RdfJsQuad {
  subject: RdfJsTerm;
  predicate: RdfJsTerm;
  object: RdfJsTerm;
  graph: RdfJsTerm;
}

export class RdfDatasetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RdfDatasetError';
  }
}

function namedNode(term: RdfJsTerm, position: string): RdfNamedNode {
  if (term.termType !== 'NamedNode') {
    throw new RdfDatasetError(
      `Unsupported ${term.termType} term in RDF ${position}`,
    );
  }
  return { termType: 'NamedNode', value: term.value };
}

function subjectTerm(term: RdfJsTerm): RdfSubject {
  if (term.termType === 'NamedNode') {
    return { termType: 'NamedNode', value: term.value };
  }
  if (term.termType === 'BlankNode') {
    return { termType: 'BlankNode', value: term.value };
  }
  throw new RdfDatasetError(
    `Unsupported ${term.termType} term in RDF subject`,
  );
}

function objectTerm(term: RdfJsTerm): RdfObject {
  if (term.termType === 'NamedNode') {
    return { termType: 'NamedNode', value: term.value };
  }
  if (term.termType === 'BlankNode') {
    return { termType: 'BlankNode', value: term.value };
  }
  if (term.termType === 'Literal' && term.datatype) {
    return {
      termType: 'Literal',
      value: term.value,
      language: term.language ?? '',
      datatype: namedNode(term.datatype, 'literal datatype'),
    };
  }
  throw new RdfDatasetError(
    `Unsupported ${term.termType} term in RDF object`,
  );
}

function graphTerm(term: RdfJsTerm): RdfGraph {
  if (term.termType === 'DefaultGraph') {
    return { termType: 'DefaultGraph', value: '' };
  }
  if (term.termType === 'NamedNode') {
    return { termType: 'NamedNode', value: term.value };
  }
  throw new RdfDatasetError(
    `Unsupported ${term.termType} term in RDF graph`,
  );
}

function plainQuad(quad: RdfJsQuad): RdfQuad {
  return {
    subject: subjectTerm(quad.subject),
    predicate: namedNode(quad.predicate, 'predicate'),
    object: objectTerm(quad.object),
    graph: graphTerm(quad.graph),
  };
}

export function rdfTermKey(
  term: RdfSubject | RdfObject | RdfGraph,
): string {
  if (term.termType === 'Literal') {
    return JSON.stringify([
      term.termType,
      term.value,
      term.language,
      term.datatype.value,
    ]);
  }
  return JSON.stringify([term.termType, term.value]);
}

export function rdfQuadKey(quad: RdfQuad): string {
  return JSON.stringify([
    rdfTermKey(quad.subject),
    quad.predicate.value,
    rdfTermKey(quad.object),
    rdfTermKey(quad.graph),
  ]);
}

export async function parseRdfXmlDataset(
  rdfXml: string,
  baseIri: string,
): Promise<RdfQuad[]> {
  const sniff = rdfXml.trimStart();
  if (!sniff.startsWith('<') && /^(@prefix|@base|PREFIX\s|BASE\s)/m.test(sniff)) {
    throw new RdfDatasetError(
      'This file appears to be Turtle; full preservation currently accepts RDF/XML only.',
    );
  }
  if (/<!DOCTYPE/i.test(rdfXml)) {
    throw new RdfDatasetError(
      'RDF/XML documents with DOCTYPE declarations are not accepted.',
    );
  }

  return new Promise((resolve, reject) => {
    const parser = new RdfXmlParser({
      baseIRI: baseIri,
      trackPosition: true,
      includeXmlNamespacesInLiterals: true,
    });
    const quads = new Map<string, RdfQuad>();
    let settled = false;

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(new RdfDatasetError(
        error instanceof Error ? error.message : String(error),
      ));
    };

    parser.on('data', (value: RdfJsQuad) => {
      try {
        const quad = plainQuad(value);
        quads.set(rdfQuadKey(quad), quad);
        if (quads.size > MAX_RDF_QUADS) {
          parser.destroy(new RdfDatasetError(
            `RDF document exceeds the ${MAX_RDF_QUADS.toLocaleString()} statement limit`,
          ));
        }
      } catch (error) {
        parser.destroy(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    });
    parser.on('error', fail);
    parser.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(Array.from(quads.values()));
    });
    parser.end(rdfXml);
  });
}

function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r/g, '&#xD;');
}

function escapeXmlAttribute(value: string): string {
  return escapeXmlText(value)
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function predicateParts(iri: string): { namespace: string; localName: string } {
  for (let index = 1; index < iri.length; index += 1) {
    const localName = iri.slice(index);
    if (NC_NAME_RE.test(localName)) {
      return { namespace: iri.slice(0, index), localName };
    }
  }
  throw new RdfDatasetError(
    `Predicate <${iri}> cannot be represented as an RDF/XML QName`,
  );
}

function serializeSubject(
  subject: RdfSubject,
  blankNodes: ReadonlyMap<string, string>,
): string {
  if (subject.termType === 'NamedNode') {
    return `rdf:about="${escapeXmlAttribute(subject.value)}"`;
  }
  return `rdf:nodeID="${escapeXmlAttribute(
    blankNodes.get(subject.value) ?? subject.value,
  )}"`;
}

function serializeObject(
  qName: string,
  object: RdfObject,
  blankNodes: ReadonlyMap<string, string>,
): string {
  if (object.termType === 'NamedNode') {
    return `<${qName} rdf:resource="${escapeXmlAttribute(object.value)}"/>`;
  }
  if (object.termType === 'BlankNode') {
    return `<${qName} rdf:nodeID="${escapeXmlAttribute(
      blankNodes.get(object.value) ?? object.value,
    )}"/>`;
  }

  let attributes = '';
  if (object.language) {
    attributes = ` xml:lang="${escapeXmlAttribute(object.language)}"`;
  } else if (
    object.datatype.value !== XSD_STRING
    && object.datatype.value !== RDF_LANG_STRING
  ) {
    attributes = ` rdf:datatype="${escapeXmlAttribute(
      object.datatype.value,
    )}"`;
  }
  return `<${qName}${attributes}>${escapeXmlText(object.value)}</${qName}>`;
}

export function serializeRdfXmlDataset(quads: readonly RdfQuad[]): string {
  for (const quad of quads) {
    if (quad.graph.termType !== 'DefaultGraph') {
      throw new RdfDatasetError(
        'RDF/XML cannot represent named graphs; choose a dataset-capable format instead.',
      );
    }
  }

  const blankNodes = new Map<string, string>();
  const registerBlankNode = (term: RdfSubject | RdfObject) => {
    if (
      term.termType === 'BlankNode'
      && !blankNodes.has(term.value)
    ) {
      blankNodes.set(term.value, `b${blankNodes.size}`);
    }
  };
  for (const quad of quads) {
    registerBlankNode(quad.subject);
    registerBlankNode(quad.object);
  }

  const predicateNames = new Map<string, string>();
  const namespaces = new Map<string, string>([[RDF_NS, 'rdf']]);
  for (const quad of quads) {
    if (predicateNames.has(quad.predicate.value)) continue;
    const { namespace, localName } = predicateParts(quad.predicate.value);
    let prefix = namespaces.get(namespace);
    if (!prefix) {
      prefix = `ns${namespaces.size - 1}`;
      namespaces.set(namespace, prefix);
    }
    predicateNames.set(
      quad.predicate.value,
      `${prefix}:${localName}`,
    );
  }

  const bySubject = new Map<string, {
    subject: RdfSubject;
    quads: RdfQuad[];
  }>();
  for (const quad of quads) {
    const key = rdfTermKey(quad.subject);
    const group = bySubject.get(key);
    if (group) group.quads.push(quad);
    else bySubject.set(key, { subject: quad.subject, quads: [quad] });
  }

  let output = '<?xml version="1.0" encoding="UTF-8"?>\n';
  output += '<rdf:RDF\n';
  for (const [namespace, prefix] of namespaces) {
    output += `  xmlns:${prefix}="${escapeXmlAttribute(namespace)}"\n`;
  }
  output += '>\n';
  for (const { subject, quads: subjectQuads } of bySubject.values()) {
    output += `  <rdf:Description ${serializeSubject(subject, blankNodes)}>\n`;
    for (const quad of subjectQuads) {
      const qName = predicateNames.get(quad.predicate.value);
      if (!qName) {
        throw new RdfDatasetError(
          `No RDF/XML QName was generated for <${quad.predicate.value}>`,
        );
      }
      output += `    ${serializeObject(qName, quad.object, blankNodes)}\n`;
    }
    output += '  </rdf:Description>\n';
  }
  output += '</rdf:RDF>\n';
  return output;
}

export function decodeRdfBytes(bytes: Uint8Array): string {
  if (
    bytes.byteLength >= 2
    && bytes[0] === 0xff
    && bytes[1] === 0xfe
  ) {
    return new TextDecoder('utf-16le', { fatal: true })
      .decode(bytes.subarray(2));
  }
  if (
    bytes.byteLength >= 2
    && bytes[0] === 0xfe
    && bytes[1] === 0xff
  ) {
    return new TextDecoder('utf-16be', { fatal: true })
      .decode(bytes.subarray(2));
  }
  const content = (
    bytes.byteLength >= 3
    && bytes[0] === 0xef
    && bytes[1] === 0xbb
    && bytes[2] === 0xbf
  )
    ? bytes.subarray(3)
    : bytes;
  return new TextDecoder('utf-8', { fatal: true }).decode(content);
}

export function materializeRdfPatches(
  original: readonly RdfQuad[],
  patches: readonly {
    removals: readonly RdfQuad[];
    additions: readonly RdfQuad[];
  }[],
): RdfQuad[] {
  const dataset = new Map(original.map((quad) => [rdfQuadKey(quad), quad]));
  for (const patch of patches) {
    for (const quad of patch.removals) {
      dataset.delete(rdfQuadKey(quad));
    }
    for (const quad of patch.additions) {
      dataset.set(rdfQuadKey(quad), quad);
    }
  }
  return Array.from(dataset.values());
}

export function cloneRdfQuad(quad: RdfQuad): RdfQuad {
  const object: RdfObject = quad.object.termType === 'Literal'
    ? {
        ...quad.object,
        datatype: { ...quad.object.datatype },
      }
    : { ...quad.object };
  return {
    subject: { ...quad.subject },
    predicate: { ...quad.predicate },
    object,
    graph: { ...quad.graph },
  };
}
