/**
 * Build-time learning content compiler.
 *
 * Reads all content/learn/*.md files, parses frontmatter + Markdown,
 * and emits public/learn.json.
 *
 * Usage: npx tsx scripts/compile-learn.ts
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { marked } from 'marked';
import type { LearnArticle, LearnManifest } from '../src/types/learn.js';

const ROOT = join(import.meta.dirname, '..');
const CONTENT_DIR = join(ROOT, 'content', 'learn');
const OUTPUT_PATH = join(ROOT, 'public', 'learn.json');

// ------------------------------------------------------------------
// Frontmatter parser (simple YAML-like key: value)
// ------------------------------------------------------------------

interface Frontmatter {
  title: string;
  slug: string;
  description: string;
  order: number;
  embed?: string;
}

const REQUIRED_FIELDS = ['title', 'slug', 'description', 'order'] as const;

function parseFrontmatter(content: string, filePath: string): { meta: Frontmatter; body: string } {
  if (!content.startsWith('---')) {
    throw new Error(`${filePath}: missing frontmatter (must start with ---)`);
  }
  const endIdx = content.indexOf('---', 3);
  if (endIdx === -1) {
    throw new Error(`${filePath}: unclosed frontmatter block`);
  }
  const raw = content.slice(3, endIdx).trim();
  const body = content.slice(endIdx + 3).trim();

  const meta: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    meta[key] = value;
  }

  for (const field of REQUIRED_FIELDS) {
    if (!meta[field]) {
      throw new Error(`${filePath}: missing required frontmatter field "${field}"`);
    }
  }

  const order = parseInt(meta['order'], 10);
  if (isNaN(order)) {
    throw new Error(`${filePath}: "order" must be a number`);
  }

  return {
    meta: {
      title: meta['title'],
      slug: meta['slug'],
      description: meta['description'],
      order,
      embed: meta['embed'] || undefined,
    },
    body,
  };
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------

function compile(): LearnManifest {
  const articles: LearnArticle[] = [];
  let errors = 0;

  const files = readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort();

  for (const file of files) {
    const filePath = join(CONTENT_DIR, file);
    try {
      const content = readFileSync(filePath, 'utf-8');
      const { meta, body } = parseFrontmatter(content, filePath);
      const html = marked.parse(body, { async: false }) as string;

      articles.push({
        slug: meta.slug,
        title: meta.title,
        description: meta.description,
        order: meta.order,
        embed: meta.embed,
        html,
      });

      console.log(`✔ ${meta.slug}`);
    } catch (e) {
      console.error(`✘ ${file}: ${(e as Error).message}`);
      errors++;
    }
  }

  if (errors > 0) {
    throw new Error(`Learn content compilation failed with ${errors} error(s)`);
  }

  // Sort by order
  articles.sort((a, b) => a.order - b.order);

  return {
    generatedAt: new Date().toISOString(),
    count: articles.length,
    articles,
  };
}

// ------------------------------------------------------------------
// Run
// ------------------------------------------------------------------

try {
  const manifest = compile();
  writeFileSync(OUTPUT_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
  console.log(`\n✔ Wrote ${manifest.count} articles to ${OUTPUT_PATH}`);
} catch (e) {
  console.error(`\n${(e as Error).message}`);
  process.exit(1);
}
