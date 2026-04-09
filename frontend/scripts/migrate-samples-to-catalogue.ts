/**
 * One-time migration script: convert sample ontologies from TypeScript to RDF files
 * with metadata.json for the catalogue.
 *
 * Usage: npx tsx scripts/migrate-samples-to-catalogue.ts
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serializeToRDF } from '../src/lib/rdf/serializer.js';
import { cosmicCoffeeOntology, sampleBindings } from '../src/data/ontology.js';
import { sampleOntologies } from '../src/data/sampleOntologies.js';

const catalogueDir = join(import.meta.dirname, '..', 'catalogue', 'official');

interface Metadata {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  tags?: string[];
  author: string;
}

// Cosmic Coffee — the default/hero ontology (has bindings)
const entries: { slug: string; rdf: string; metadata: Metadata }[] = [
  {
    slug: 'cosmic-coffee',
    rdf: serializeToRDF(cosmicCoffeeOntology, sampleBindings),
    metadata: {
      id: 'cosmic-coffee',
      name: cosmicCoffeeOntology.name,
      description: cosmicCoffeeOntology.description,
      icon: '☕',
      category: 'retail',
      tags: ['coffee', 'supply-chain', 'fabric-iq', 'demo'],
      author: 'ontology-quest',
    },
  },
];

// Sample ontologies from the gallery
for (const sample of sampleOntologies) {
  entries.push({
    slug: sample.id,
    rdf: serializeToRDF(sample.ontology, sample.bindings),
    metadata: {
      id: sample.id,
      name: sample.name,
      description: sample.description,
      icon: sample.icon,
      category: sample.category,
      author: 'ontology-quest',
    },
  });
}

for (const entry of entries) {
  const dir = join(catalogueDir, entry.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${entry.slug}.rdf`), entry.rdf, 'utf-8');
  writeFileSync(
    join(dir, 'metadata.json'),
    JSON.stringify(entry.metadata, null, 2) + '\n',
    'utf-8',
  );
  console.log(`✔ ${entry.slug}`);
}

console.log(`\nMigrated ${entries.length} ontologies to ${catalogueDir}`);
