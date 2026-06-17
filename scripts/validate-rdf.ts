/**
 * validate-rdf.ts — Validate RDF ontology files
 *
 * Usage:
 *   npx tsx scripts/validate-rdf.ts                     # validate all catalogue + built-in ontologies
 *   npx tsx scripts/validate-rdf.ts file1.rdf file2.rdf # validate specific RDF files
 *
 * Exit code 0 = all valid, 1 = one or more failures.
 * Suitable for CI (e.g., GitHub Actions) to gate community PRs.
 */

import { JSDOM } from 'jsdom';
// Polyfill DOMParser for Node.js
const dom = new JSDOM();
(globalThis as Record<string, unknown>).DOMParser = dom.window.DOMParser;

import { parseRDF } from '../src/lib/rdf/parser';
import { validateOntology } from '../src/store/designerStore';
import { validateOntologyStyle } from './style-validator';
import { cosmicCoffeeOntology } from '../src/data/ontology';
import { sampleOntologies } from '../src/data/sampleOntologies';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, basename } from 'path';

let failures = 0;

function report(label: string, errors: { message: string }[]) {
  if (errors.length) {
    failures++;
    console.log(`FAIL  ${label}`);
    for (const e of errors) console.log(`        ${e.message}`);
  } else {
    console.log(`  OK  ${label}`);
  }
}

function reportStyle(label: string, errors: { message: string; severity: string }[]) {
  if (errors.length) {
    const hasErrors = errors.some(e => e.severity === 'error');
    if (hasErrors) {
      failures++;
      console.log(`FAIL  ${label} (style)`);      
    } else {
      console.log(`WARN  ${label} (style)`);
    }
    for (const e of errors) {
      const prefix = e.severity === 'error' ? '  ✘' : '  ⚠';
      console.log(`${prefix} ${e.message}`);
    }
  }
}

function validateRdfFile(filePath: string, checkStyle = true) {
  const rdf = readFileSync(filePath, 'utf-8');
  const { ontology } = parseRDF(rdf);
  const errors = validateOntology(ontology);
  report(basename(filePath), errors);
  
  if (checkStyle) {
    const styleErrors = validateOntologyStyle(ontology);
    if (styleErrors.length > 0) {
      reportStyle(basename(filePath), styleErrors);
    }
  }
}

// --- Mode: validate specific files passed as CLI args ---
const args = process.argv.slice(2);
if (args.length > 0) {
  for (const file of args) {
    if (!existsSync(file)) {
      console.error(`File not found: ${file}`);
      failures++;
      continue;
    }
    validateRdfFile(file);
  }
} else {
  // --- Mode: validate all built-in + catalogue ontologies ---

  // 1. Built-in TS ontology objects
  report('Fourth Coffee (built-in)', validateOntology(cosmicCoffeeOntology));
  for (const s of sampleOntologies) {
    report(`${s.name} (built-in)`, validateOntology(s.ontology));
  }

  // 2. Catalogue RDF files
  const catalogueDir = join(process.cwd(), 'catalogue/official');
  if (existsSync(catalogueDir)) {
    for (const dir of readdirSync(catalogueDir)) {
      const dirPath = join(catalogueDir, dir);
      if (!statSync(dirPath).isDirectory()) continue;
      for (const f of readdirSync(dirPath).filter(f => f.endsWith('.rdf'))) {
        validateRdfFile(join(dirPath, f));
      }
    }
  }

  const communityDir = join(process.cwd(), 'catalogue/community');
  if (existsSync(communityDir)) {
    for (const user of readdirSync(communityDir)) {
      const userDir = join(communityDir, user);
      if (!statSync(userDir).isDirectory()) continue;
      for (const slug of readdirSync(userDir)) {
        const slugDir = join(userDir, slug);
        if (!statSync(slugDir).isDirectory()) continue;
        for (const f of readdirSync(slugDir).filter(f => f.endsWith('.rdf') || f.endsWith('.owl'))) {
          validateRdfFile(join(slugDir, f));
        }
      }
    }
  }
}

if (failures > 0) {
  console.log(`\n✘ ${failures} file(s) failed validation`);
  process.exit(1);
} else {
  console.log(`\n✔ All files valid`);
}
