import type { Ontology, DataBinding } from '../data/ontology';

export interface CatalogueEntry {
  id: string;
  name: string;
  description: string;
  icon?: string;
  category: string;
  tags: string[];
  author: string;
  source: 'official' | 'community' | 'external';
  entityCount: number;
  relationshipCount: number;
  payloadUrl: string;
  payloadHash: string;
  sourceArtifactUrl?: string;
  sourceArtifactHash?: string;
  sourceArtifactByteLength?: number;
  sourceArtifactMediaType?: 'application/rdf+xml';
  license?: string;
  sourceUrl?: string;
  version?: string;
}

export interface CatalogueEntryPayload {
  schemaVersion: 1;
  id: string;
  ontology: Ontology;
  bindings: DataBinding[];
}

export interface CataloguePayloadManifestEntry {
  payloadUrl: string;
  payloadHash: string;
}

export interface CatalogueSourceManifestEntry {
  sourceArtifactUrl: string;
  sourceArtifactHash: string;
}

export interface CataloguePayloadManifest {
  schemaVersion: 1;
  payloads: CataloguePayloadManifestEntry[];
  sources: CatalogueSourceManifestEntry[];
}

export interface LoadedCatalogueEntry extends CatalogueEntry {
  ontology: Ontology;
  bindings: DataBinding[];
}

export interface LoadedCatalogueSource {
  id: string;
  bytes: Uint8Array;
  text: string;
  mediaType: 'application/rdf+xml';
  hash: string;
  sourceArtifactUrl: string;
  documentUrl: string;
}

export interface Catalogue {
  schemaVersion: 2;
  generatedAt: string;
  count: number;
  entries: CatalogueEntry[];
}

export const CATEGORY_LABELS: Record<string, string> = {
  retail: 'Retail',
  healthcare: 'Healthcare',
  finance: 'Finance',
  manufacturing: 'Manufacturing',
  education: 'Education',
  food: 'Food & Beverage',
  media: 'Media & Publishing',
  events: 'Events & Entertainment',
  technology: 'Technology',
  general: 'General',
  school: 'Ontology School: Get Started',
  fibo: 'FIBO (EDM Council)',
};

export const CATEGORY_COLORS: Record<string, string> = {
  retail: '#0078D4',
  healthcare: '#D13438',
  finance: '#107C10',
  manufacturing: '#FFB900',
  education: '#8764B8',
  food: '#E74C3C',
  media: '#9B59B6',
  events: '#00A9E0',
  technology: '#008272',
  general: '#6B7280',
  school: '#E67E22',
  fibo: '#1A5276',
};
