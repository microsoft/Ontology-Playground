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
  ontology: Ontology;
  bindings: DataBinding[];
}

export interface Catalogue {
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
  general: '#6B7280',
  school: '#E67E22',
  fibo: '#1A5276',
};
