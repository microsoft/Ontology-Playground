import type { CatalogueEntry } from '../../types/catalogue';
import type {
  ParsedRdfDocument,
  RdfDocument,
  RdfDocumentReference,
  RdfExportOptions,
  RdfExportResult,
  RdfNamedNode,
  RdfProjectionResource,
  RdfProjectionMap,
  RdfQuad,
  ReadyRdfDocument,
} from '../../types/rdfDocument';
import { loadCatalogueSource } from '../catalogue';
import {
  assertSupportedRdfXmlSource,
  decodeRdfBytes,
  materializeRdfPatches,
  rdfQuadKey,
} from './dataset';
import { parseRDF } from './parser';
import { applyLiteralEdit } from './patch';
import {
  parseRdfDatasetOffMainThread,
  serializeRdfDatasetOffMainThread,
} from './workerClient';

export { applyLiteralEdit } from './patch';

export const MAX_RDF_SOURCE_BYTES = 8 * 1024 * 1024;
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const RDFS_SUBCLASS_OF =
  'http://www.w3.org/2000/01/rdf-schema#subClassOf';
const OWL_CLASS = 'http://www.w3.org/2002/07/owl#Class';
const OWL_OBJECT_PROPERTY =
  'http://www.w3.org/2002/07/owl#ObjectProperty';
const OWL_ONTOLOGY = 'http://www.w3.org/2002/07/owl#Ontology';

export function isSameRdfDocumentRevision(
  left: RdfDocument | null | undefined,
  right: RdfDocument | null | undefined,
): boolean {
  if (!left || !right) return left === right;
  return left.id === right.id && left.revision === right.revision;
}

export class RdfDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RdfDocumentError';
  }
}

async function hashBytes(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new RdfDocumentError(
      'This environment cannot verify RDF source integrity.',
    );
  }
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    bytes.slice().buffer,
  );
  const hex = Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
  return `sha256:${hex}`;
}

function fallbackOntologyName(name: string): string {
  return name
    .replace(/\.(rdf|owl|xml|iq)$/i, '')
    .trim() || 'Imported Ontology';
}

function hasAuthoritativeQuad(
  quads: readonly RdfQuad[],
  subject: RdfNamedNode,
  predicate: string,
  object: RdfNamedNode,
): boolean {
  return quads.some((quad) =>
    quad.graph.termType === 'DefaultGraph'
    && quad.subject.termType === 'NamedNode'
    && quad.subject.value === subject.value
    && quad.predicate.value === predicate
    && quad.object.termType === 'NamedNode'
    && quad.object.value === object.value
  );
}

function retainAuthoritativeProjectionMappings(
  projection: RdfProjectionMap,
  quads: readonly RdfQuad[],
): RdfProjectionMap {
  const ontology = projection.ontology
    && hasAuthoritativeQuad(
      quads,
      projection.ontology.term,
      RDF_TYPE,
      { termType: 'NamedNode', value: OWL_ONTOLOGY },
    )
    ? projection.ontology
    : undefined;
  const entities = Object.fromEntries(
    Object.entries(projection.entities).filter(([, resource]) =>
      hasAuthoritativeQuad(
        quads,
        resource.term,
        RDF_TYPE,
        { termType: 'NamedNode', value: OWL_CLASS },
      )
    ),
  );
  const relationships = Object.fromEntries(
    Object.entries(projection.relationships).filter(([, relationship]) => {
      if (relationship.kind === 'association') {
        return Boolean(
          relationship.term
          && hasAuthoritativeQuad(
            quads,
            relationship.term,
            RDF_TYPE,
            { termType: 'NamedNode', value: OWL_OBJECT_PROPERTY },
          ),
        );
      }
      return Boolean(
        relationship.subject
        && relationship.object
        && hasAuthoritativeQuad(
          quads,
          relationship.subject,
          RDFS_SUBCLASS_OF,
          relationship.object,
        ),
      );
    }),
  );
  return {
    ...(ontology ? { ontology } : {}),
    entities,
    relationships,
  };
}

async function createReadyRdfDocument(
  bytes: Uint8Array,
  source: {
    origin: 'file' | 'catalogue';
    name: string;
    mediaType: 'application/rdf+xml';
    baseIri: string;
    expectedHash?: string;
    catalogueId?: string;
    catalogueBaseUrl?: string;
    sourceArtifactUrl?: string;
  },
): Promise<ParsedRdfDocument> {
  if (
    bytes.byteLength === 0
    || bytes.byteLength > MAX_RDF_SOURCE_BYTES
  ) {
    throw new RdfDocumentError(
      `RDF source must be between 1 byte and ${MAX_RDF_SOURCE_BYTES.toLocaleString()} bytes.`,
    );
  }

  let rdfXml: string;
  try {
    rdfXml = decodeRdfBytes(bytes);
  } catch (error) {
    throw new RdfDocumentError(
      `RDF source encoding is unsupported: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  assertSupportedRdfXmlSource(rdfXml);

  const hash = await hashBytes(bytes);
  if (source.expectedHash && hash !== source.expectedHash) {
    throw new RdfDocumentError('RDF source integrity check failed.');
  }

  const [originalQuads, projectionResult] = await Promise.all([
    parseRdfDatasetOffMainThread(rdfXml, source.baseIri),
    Promise.resolve().then(() => parseRDF(rdfXml, {
      allowEmptyProjection: true,
      baseIri: source.baseIri,
    })),
  ]);
  projectionResult.projection = retainAuthoritativeProjectionMappings(
    projectionResult.projection,
    originalQuads,
  );
  if (
    projectionResult.ontology.name === 'Imported Ontology'
    && projectionResult.ontology.entityTypes.length === 0
  ) {
    projectionResult.ontology.name = fallbackOntologyName(source.name);
  }

  const document: ReadyRdfDocument = {
    id: `${source.origin}:${source.catalogueId ?? source.name}:${hash}`,
    state: 'ready',
    revision: 0,
    source: {
      origin: source.origin,
      name: source.name,
      mediaType: source.mediaType,
      hash,
      byteLength: bytes.byteLength,
      baseIri: source.baseIri,
      catalogueId: source.catalogueId,
      catalogueBaseUrl: source.catalogueBaseUrl,
      sourceArtifactUrl: source.sourceArtifactUrl,
    },
    originalBytes: bytes.slice(),
    originalQuads,
    projection: projectionResult.projection,
    patches: [],
  };

  return {
    ontology: projectionResult.ontology,
    bindings: projectionResult.bindings,
    document,
  };
}

export function importedDocumentBaseIri(
  name: string,
): string {
  return `https://ontology-playground.invalid/import/${
    encodeURIComponent(name || 'ontology.rdf')
  }`;
}

export function createImportedRdfDocument(
  bytes: Uint8Array,
  options: {
    name: string;
    baseIri?: string;
  },
): Promise<ParsedRdfDocument> {
  return createReadyRdfDocument(bytes, {
    origin: 'file',
    name: options.name,
    mediaType: 'application/rdf+xml',
    baseIri: options.baseIri ?? importedDocumentBaseIri(options.name),
  });
}

export function createCatalogueRdfDocumentReference(
  entry: CatalogueEntry,
  catalogueBaseUrl?: string,
): RdfDocumentReference | null {
  if (
    !entry.sourceArtifactHash
    || !entry.sourceArtifactUrl
    || !entry.sourceArtifactByteLength
    || entry.sourceArtifactMediaType !== 'application/rdf+xml'
  ) {
    return null;
  }
  return {
    id: `catalogue:${entry.id}:${entry.sourceArtifactHash}`,
    state: 'reference',
    revision: 0,
    source: {
      origin: 'catalogue',
      name: `${entry.id}.rdf`,
      mediaType: entry.sourceArtifactMediaType,
      hash: entry.sourceArtifactHash,
      byteLength: entry.sourceArtifactByteLength,
      baseIri: '',
      catalogueId: entry.id,
      catalogueBaseUrl,
      sourceArtifactUrl: entry.sourceArtifactUrl,
    },
  };
}

export async function ensureRdfDocumentReady(
  document: RdfDocument,
): Promise<ReadyRdfDocument> {
  if (document.state === 'ready') return document;
  if (!document.source.catalogueId) {
    throw new RdfDocumentError(
      'RDF source reference has no catalogue identity.',
    );
  }
  const source = await loadCatalogueSource(
    document.source.catalogueId,
    document.source.catalogueBaseUrl,
  );
  const loaded = await createReadyRdfDocument(source.bytes, {
    origin: 'catalogue',
    name: document.source.name,
    mediaType: source.mediaType,
    baseIri: source.documentUrl,
    expectedHash: document.source.hash,
    catalogueId: document.source.catalogueId,
    catalogueBaseUrl: document.source.catalogueBaseUrl,
    sourceArtifactUrl: source.sourceArtifactUrl,
  });
  return loaded.document;
}

export function materializeRdfDocument(
  document: ReadyRdfDocument,
) {
  return materializeRdfPatches(
    document.originalQuads,
    document.patches,
  );
}

export function isRdfDocumentDirty(
  document: ReadyRdfDocument,
): boolean {
  if (document.patches.length === 0) return false;
  const original = new Set(
    document.originalQuads.map(rdfQuadKey),
  );
  const materialized = materializeRdfDocument(document);
  if (original.size !== materialized.length) return true;
  return materialized.some((quad) => !original.has(rdfQuadKey(quad)));
}

export async function exportRdfDocument(
  input: RdfDocument,
  options: RdfExportOptions = {},
): Promise<RdfExportResult> {
  const document = await ensureRdfDocumentReady(input);
  const includeDerivationMetadata =
    options.includeDerivationMetadata === true;
  if (!isRdfDocumentDirty(document) && !includeDerivationMetadata) {
    return {
      kind: 'original',
      bytes: document.originalBytes.slice(),
      mediaType: document.source.mediaType,
      sourceHash: document.source.hash,
      sourceTripleCount: document.originalQuads.length,
      exportedTripleCount: document.originalQuads.length,
      patchCount: document.patches.length,
      derivationMetadataIncluded: false,
    };
  }

  const quads = materializeRdfDocument(document);
  if (includeDerivationMetadata) {
    const ontology = document.projection.ontology?.term;
    if (
      !ontology
      || !hasAuthoritativeQuad(
        quads,
        ontology,
        RDF_TYPE,
        { termType: 'NamedNode', value: OWL_ONTOLOGY },
      )
    ) {
      throw new RdfDocumentError(
        'Derivation metadata requires an exactly mapped ontology resource.',
      );
    }
    const provenanceQuad = {
      subject: { ...ontology },
      predicate: {
        termType: 'NamedNode' as const,
        value: 'http://www.w3.org/ns/prov#wasDerivedFrom',
      },
      object: {
        termType: 'NamedNode' as const,
        value: `urn:${document.source.hash}`,
      },
      graph: { termType: 'DefaultGraph' as const, value: '' as const },
    };
    if (!quads.some((quad) =>
      rdfQuadKey(quad) === rdfQuadKey(provenanceQuad)
    )) {
      quads.push(provenanceQuad);
    }
  }
  const rdfXml = await serializeRdfDatasetOffMainThread(quads);
  return {
    kind: 'modified',
    bytes: new TextEncoder().encode(rdfXml),
    mediaType: 'application/rdf+xml',
    sourceHash: document.source.hash,
    sourceTripleCount: document.originalQuads.length,
    exportedTripleCount: quads.length,
    patchCount: document.patches.length,
    derivationMetadataIncluded: includeDerivationMetadata,
  };
}

export function canEditLiteral(
  document: ReadyRdfDocument,
  target: RdfProjectionResource | undefined,
  predicateIri: string,
  value: string,
): boolean {
  if (!target) return false;
  try {
    applyLiteralEdit(
      document,
      target,
      predicateIri,
      value,
      `${value}\u{1F9EA}`,
      'Probe RDF mapping',
    );
    return true;
  } catch {
    return false;
  }
}
