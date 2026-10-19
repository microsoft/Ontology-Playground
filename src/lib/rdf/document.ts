import type { CatalogueEntry } from '../../types/catalogue';
import type {
  ParsedRdfDocument,
  RdfDocument,
  RdfDocumentReference,
  RdfExportOptions,
  RdfExportResult,
  RdfNamedNode,
  RdfProjectionLiteral,
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
import {
  parseRdfDatasetOffMainThread,
  serializeRdfDatasetOffMainThread,
} from './workerClient';

export { applyLiteralEdit } from './patch';

export const MAX_RDF_SOURCE_BYTES = 8 * 1024 * 1024;
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const RDFS_SUBCLASS_OF =
  'http://www.w3.org/2000/01/rdf-schema#subClassOf';
const RDFS_LABEL = 'http://www.w3.org/2000/01/rdf-schema#label';
const RDFS_COMMENT = 'http://www.w3.org/2000/01/rdf-schema#comment';
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
  // TextEncoder supplies a buffer from the same realm as Web Crypto. Node 20
  // rejects ArrayBuffers created inside Vitest's VM realm.
  const CompatibleArrayBuffer = new TextEncoder()
    .encode('')
    .buffer
    .constructor as typeof ArrayBuffer;
  const compatibleBytes = new CompatibleArrayBuffer(bytes.byteLength);
  new Uint8Array(compatibleBytes).set(bytes);
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    compatibleBytes,
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
  quadKeys: ReadonlySet<string>,
  subject: RdfNamedNode,
  predicate: string,
  object: RdfNamedNode,
): boolean {
  return quadKeys.has(rdfQuadKey({
    subject,
    predicate: { termType: 'NamedNode', value: predicate },
    object,
    graph: { termType: 'DefaultGraph', value: '' },
  }));
}

function retainAuthoritativeProjectionMappings(
  projection: RdfProjectionMap,
  quadKeys: ReadonlySet<string>,
): RdfProjectionMap {
  const ontology = projection.ontology
    && hasAuthoritativeQuad(
      quadKeys,
      projection.ontology.term,
      RDF_TYPE,
      { termType: 'NamedNode', value: OWL_ONTOLOGY },
    )
    ? projection.ontology
    : undefined;
  const entities = Object.fromEntries(
    Object.entries(projection.entities).filter(([, resource]) =>
      hasAuthoritativeQuad(
        quadKeys,
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
            quadKeys,
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
          quadKeys,
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

function findLiteralMapping(
  literalIndex: ReadonlyMap<string, readonly RdfQuad[]>,
  subject: RdfNamedNode,
  predicate: string,
  value: string,
): RdfProjectionLiteral | undefined {
  const matches = literalIndex.get(
    JSON.stringify([subject.value, predicate, value]),
  );
  if (
    matches?.length !== 1
    || matches[0].object.termType !== 'Literal'
  ) {
    return undefined;
  }
  return {
    object: {
      ...matches[0].object,
      datatype: { ...matches[0].object.datatype },
    },
    graph: { ...matches[0].graph },
  };
}

function withLiteralMappings(
  resource: RdfProjectionResource,
  values: readonly [predicate: string, value: string][],
  literalIndex: ReadonlyMap<string, readonly RdfQuad[]>,
): RdfProjectionResource {
  const literals = Object.fromEntries(
    values.flatMap(([predicate, value]) => {
      const mapping = findLiteralMapping(
        literalIndex,
        resource.term,
        predicate,
        value,
      );
      return mapping ? [[predicate, mapping]] : [];
    }),
  );
  return {
    ...resource,
    ...(Object.keys(literals).length > 0 ? { literals } : {}),
  };
}

function attachProjectionLiteralMappings(
  projection: RdfProjectionMap,
  ontology: ParsedRdfDocument['ontology'],
  literalIndex: ReadonlyMap<string, readonly RdfQuad[]>,
): RdfProjectionMap {
  const entitiesById = new Map(
    ontology.entityTypes.map((entity) => [entity.id, entity]),
  );
  const relationshipsById = new Map(
    ontology.relationships.map((relationship) => [
      relationship.id,
      relationship,
    ]),
  );
  const ontologyResource = projection.ontology
    ? withLiteralMappings(
        projection.ontology,
        [
          [RDFS_LABEL, ontology.name],
          [RDFS_COMMENT, ontology.description],
        ],
        literalIndex,
      )
    : undefined;
  const entities = Object.fromEntries(
    Object.entries(projection.entities).map(([id, resource]) => {
      const entity = entitiesById.get(id);
      return [
        id,
        entity
          ? withLiteralMappings(
              resource,
              [
                [RDFS_LABEL, entity.name],
                [RDFS_COMMENT, entity.description],
              ],
              literalIndex,
            )
          : resource,
      ];
    }),
  );
  const relationships = Object.fromEntries(
    Object.entries(projection.relationships).map(([id, relationship]) => {
      const visualRelationship = relationshipsById.get(id);
      if (!relationship.term || !visualRelationship) {
        return [id, relationship];
      }
      const resource = withLiteralMappings(
        { term: relationship.term },
        [
          [RDFS_LABEL, visualRelationship.name],
          [RDFS_COMMENT, visualRelationship.description ?? ''],
        ],
        literalIndex,
      );
      return [
        id,
        {
          ...relationship,
          ...(resource.literals ? { literals: resource.literals } : {}),
        },
      ];
    }),
  );
  return {
    ...(ontologyResource ? { ontology: ontologyResource } : {}),
    entities,
    relationships,
  };
}

function indexLiteralQuads(
  quads: readonly RdfQuad[],
): ReadonlyMap<string, readonly RdfQuad[]> {
  const index = new Map<string, RdfQuad[]>();
  for (const quad of quads) {
    if (
      quad.subject.termType !== 'NamedNode'
      || quad.object.termType !== 'Literal'
    ) {
      continue;
    }
    const key = JSON.stringify([
      quad.subject.value,
      quad.predicate.value,
      quad.object.value,
    ]);
    const matches = index.get(key) ?? [];
    matches.push(quad);
    index.set(key, matches);
  }
  return index;
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

  const originalQuads = await parseRdfDatasetOffMainThread(
    rdfXml,
    source.baseIri,
  );
  const projectionResult = parseRDF(rdfXml, {
    allowEmptyProjection: true,
    baseIri: source.baseIri,
  });
  const authoritativeQuadKeys = new Set(originalQuads.map(rdfQuadKey));
  const literalIndex = indexLiteralQuads(originalQuads);
  projectionResult.projection = attachProjectionLiteralMappings(
    retainAuthoritativeProjectionMappings(
      projectionResult.projection,
      authoritativeQuadKeys,
    ),
    projectionResult.ontology,
    literalIndex,
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

interface MaterializedRdfState {
  quads: RdfQuad[];
  quadKeys: Set<string>;
  dirty: boolean;
}

const materializedRdfCache =
  new WeakMap<ReadyRdfDocument, MaterializedRdfState>();

function materializedRdfState(
  document: ReadyRdfDocument,
): MaterializedRdfState {
  const cached = materializedRdfCache.get(document);
  if (cached) return cached;
  const quads = materializeRdfPatches(
    document.originalQuads,
    document.patches,
  );
  const originalKeys = document.patches.length === 0
    ? null
    : new Set(document.originalQuads.map(rdfQuadKey));
  const state = {
    quads,
    quadKeys: new Set(quads.map(rdfQuadKey)),
    dirty: originalKeys !== null && (
      originalKeys.size !== quads.length
      || quads.some((quad) => !originalKeys.has(rdfQuadKey(quad)))
    ),
  };
  materializedRdfCache.set(document, state);
  return state;
}

export function materializeRdfDocument(
  document: ReadyRdfDocument,
) {
  return [...materializedRdfState(document).quads];
}

export function rdfDocumentStatementCount(
  document: ReadyRdfDocument,
): number {
  return materializedRdfState(document).quads.length;
}

export function isRdfDocumentDirty(
  document: ReadyRdfDocument,
): boolean {
  return materializedRdfState(document).dirty;
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
        new Set(quads.map(rdfQuadKey)),
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
  const mapping = target.literals?.[predicateIri];
  if (!mapping || mapping.object.value !== value) return false;
  return materializedRdfState(document).quadKeys.has(rdfQuadKey({
    subject: { ...target.term },
    predicate: { termType: 'NamedNode', value: predicateIri },
    object: {
      ...mapping.object,
      datatype: { ...mapping.object.datatype },
    },
    graph: { ...mapping.graph },
  }));
}
