import type { DataBinding, Ontology } from '../data/ontology';

export interface RdfNamedNode {
  termType: 'NamedNode';
  value: string;
}

export interface RdfBlankNode {
  termType: 'BlankNode';
  value: string;
}

export interface RdfLiteral {
  termType: 'Literal';
  value: string;
  language: string;
  direction?: 'ltr' | 'rtl';
  datatype: RdfNamedNode;
}

export interface RdfDefaultGraph {
  termType: 'DefaultGraph';
  value: '';
}

export type RdfSubject = RdfNamedNode | RdfBlankNode;
export type RdfObject = RdfNamedNode | RdfBlankNode | RdfLiteral;
export type RdfGraph = RdfDefaultGraph | RdfNamedNode;

export interface RdfQuad {
  subject: RdfSubject;
  predicate: RdfNamedNode;
  object: RdfObject;
  graph: RdfGraph;
}

export interface RdfProjectionLiteral {
  object: RdfLiteral;
  graph: RdfGraph;
}

export interface RdfProjectionResource {
  term: RdfNamedNode;
  literals?: Record<string, RdfProjectionLiteral>;
}

export interface RdfProjectionRelationship {
  kind: 'association' | 'subclass';
  term?: RdfNamedNode;
  subject?: RdfNamedNode;
  object?: RdfNamedNode;
  literals?: Record<string, RdfProjectionLiteral>;
}

export interface RdfProjectionMap {
  ontology?: RdfProjectionResource;
  entities: Record<string, RdfProjectionResource>;
  relationships: Record<string, RdfProjectionRelationship>;
}

export interface RdfPatch {
  id: string;
  description: string;
  removals: RdfQuad[];
  additions: RdfQuad[];
}

export interface RdfSourceDescriptor {
  origin: 'file' | 'catalogue';
  name: string;
  mediaType: 'application/rdf+xml';
  hash: string;
  byteLength: number;
  baseIri: string;
  catalogueId?: string;
  catalogueBaseUrl?: string;
  sourceArtifactUrl?: string;
}

interface RdfDocumentBase {
  id: string;
  revision: number;
  source: RdfSourceDescriptor;
}

export interface RdfDocumentReference extends RdfDocumentBase {
  state: 'reference';
}

export interface ReadyRdfDocument extends RdfDocumentBase {
  state: 'ready';
  originalBytes: Uint8Array;
  originalQuads: RdfQuad[];
  projection: RdfProjectionMap;
  patches: RdfPatch[];
}

export type RdfDocument = RdfDocumentReference | ReadyRdfDocument;

export interface ParsedRdfDocument {
  ontology: Ontology;
  bindings: DataBinding[];
  document: ReadyRdfDocument;
}

export interface RdfExportResult {
  kind: 'original' | 'modified';
  bytes: Uint8Array;
  mediaType: 'application/rdf+xml';
  sourceHash: string;
  sourceTripleCount: number;
  exportedTripleCount: number;
  patchCount: number;
  derivationMetadataIncluded: boolean;
}

export interface RdfExportOptions {
  includeDerivationMetadata?: boolean;
}
