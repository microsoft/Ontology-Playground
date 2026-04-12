/**
 * Build-time learning content compiler.
 *
 * Scans content/learn/<course-dir>/ subdirectories, reads _meta.md for
 * course metadata and *.md files for articles, and emits public/learn.json.
 *
 * Directory layout:
 *   content/learn/
 *     ontology-fundamentals/
 *       _meta.md            ← course metadata (title, slug, type, icon)
 *       01-what-is-an-ontology.md
 *       02-understanding-rdf.md
 *     iq-lab-retail-supply-chain/
 *       _meta.md
 *       01-scenario-overview.md
 *       ...
 *
 * Usage: npx tsx scripts/compile-learn.ts
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { marked, type Tokens } from 'marked';
import type { LearnArticle, LearnCourse, LearnManifest } from '../src/types/learn.js';
import { sanitizeLearnHtml } from '../src/lib/learn/sanitizeHtml.js';

// ------------------------------------------------------------------
// Quiz block renderer — converts ```quiz fenced blocks to data divs
// ------------------------------------------------------------------

/** Parse a ```quiz code block into a JSON-serialisable quiz object.
 *
 * Syntax:
 *   Q: Question text here
 *   - Option A
 *   - Option B [correct]
 *   - Option C
 *   > Explanation shown after answering.
 */
interface QuizOption {
  text: string;
  correct: boolean;
}
interface QuizData {
  question: string;
  options: QuizOption[];
  explanation: string;
}

function parseQuizBlock(raw: string): QuizData {
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  let question = '';
  const options: QuizOption[] = [];
  const explanationLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('Q:')) {
      question = line.slice(2).trim();
    } else if (line.startsWith('- ')) {
      const isCorrect = line.endsWith('[correct]');
      const text = isCorrect ? line.slice(2, -9).trim() : line.slice(2).trim();
      options.push({ text, correct: isCorrect });
    } else if (line.startsWith('>')) {
      explanationLines.push(line.slice(1).trim());
    }
  }

  if (!question) throw new Error('Quiz block missing "Q:" question line');
  if (options.length < 2) throw new Error('Quiz block needs at least 2 options');
  if (!options.some((o) => o.correct)) throw new Error('Quiz block needs at least one [correct] option');

  return { question, options, explanation: explanationLines.join(' ') };
}

/** Custom marked renderer that converts ```quiz blocks into data divs */
const quizRenderer = {
  code(token: Tokens.Code): string | false {
    if (token.lang !== 'quiz') return false;
    const quiz = parseQuizBlock(token.text);
    // Encode as HTML-safe JSON in a data attribute
    const json = JSON.stringify(quiz).replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/"/g, '&quot;');
    // Include visible fallback text so quiz is visible even before JS hydration
    const escapedQ = quiz.question.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    return `<div class="quiz-block" data-quiz="${json}"><p class="quiz-fallback">&#x2753; ${escapedQ}</p></div>\n`;
  },
};

marked.use({ renderer: quizRenderer });

const ROOT = join(import.meta.dirname, '..');
const CONTENT_DIR = join(ROOT, 'content', 'learn');
const OUTPUT_PATH = join(ROOT, 'public', 'learn.json');

// ------------------------------------------------------------------
// Frontmatter parser (simple YAML-like key: value)
// ------------------------------------------------------------------

interface CourseFrontmatter {
  title: string;
  slug: string;
  description: string;
  type: 'path' | 'lab';
  icon: string;
}

function parseFrontmatter<T extends Record<string, string>>(
  content: string,
  filePath: string,
  requiredFields: readonly string[],
): { meta: T; body: string } {
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
    let value = line.slice(colonIdx + 1).trim();
    // Strip surrounding quotes (YAML allows "..." or '...')
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    meta[key] = value;
  }

  for (const field of requiredFields) {
    if (!meta[field]) {
      throw new Error(`${filePath}: missing required frontmatter field "${field}"`);
    }
  }

  return { meta: meta as T, body };
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------

const COURSE_REQUIRED = ['title', 'slug', 'description', 'type', 'icon'] as const;
const ARTICLE_REQUIRED = ['title', 'slug', 'description', 'order'] as const;

function compile(): LearnManifest {
  const courses: LearnCourse[] = [];
  let errors = 0;

  // Discover course directories
  const dirs = readdirSync(CONTENT_DIR)
    .filter((d) => {
      const full = join(CONTENT_DIR, d);
      return statSync(full).isDirectory();
    })
    .sort();

  for (const dirName of dirs) {
    const courseDir = join(CONTENT_DIR, dirName);
    const metaPath = join(courseDir, '_meta.md');

    if (!existsSync(metaPath)) {
      console.error(`✘ ${dirName}/: missing _meta.md`);
      errors++;
      continue;
    }

    // Parse course metadata
    let courseMeta: CourseFrontmatter;
    try {
      const metaContent = readFileSync(metaPath, 'utf-8');
      const parsed = parseFrontmatter<Record<string, string>>(metaContent, metaPath, COURSE_REQUIRED);
      courseMeta = {
        title: parsed.meta['title'],
        slug: parsed.meta['slug'],
        description: parsed.meta['description'],
        type: parsed.meta['type'] as 'path' | 'lab',
        icon: parsed.meta['icon'],
      };
      if (courseMeta.type !== 'path' && courseMeta.type !== 'lab') {
        throw new Error(`${metaPath}: "type" must be "path" or "lab"`);
      }
    } catch (e) {
      console.error(`✘ ${metaPath}: ${(e as Error).message}`);
      errors++;
      continue;
    }

    // Parse articles in this course
    const articles: LearnArticle[] = [];
    const files = readdirSync(courseDir)
      .filter((f) => f.endsWith('.md') && f !== '_meta.md')
      .sort();

    for (const file of files) {
      const filePath = join(courseDir, file);
      try {
        const content = readFileSync(filePath, 'utf-8');
        const { meta, body } = parseFrontmatter<Record<string, string>>(
          content,
          filePath,
          ARTICLE_REQUIRED,
        );
        const order = parseInt(meta['order'], 10);
        if (isNaN(order)) {
          throw new Error(`${filePath}: "order" must be a number`);
        }
        const rawHtml = marked.parse(body, { async: false }) as string;
        const html = sanitizeLearnHtml(rawHtml);

        articles.push({
          slug: meta['slug'],
          title: meta['title'],
          description: meta['description'],
          order,
          embed: meta['embed'] || undefined,
          reviewStatus: meta['reviewStatus'] || undefined,
          html,
        });

        console.log(`  ✔ ${courseMeta.slug}/${meta['slug']}`);
      } catch (e) {
        console.error(`  ✘ ${file}: ${(e as Error).message}`);
        errors++;
      }
    }

    articles.sort((a, b) => a.order - b.order);

    courses.push({
      slug: courseMeta.slug,
      title: courseMeta.title,
      description: courseMeta.description,
      type: courseMeta.type,
      icon: courseMeta.icon,
      articles,
    });

    console.log(`✔ ${courseMeta.slug} (${articles.length} articles)`);
  }

  if (errors > 0) {
    throw new Error(`Learn content compilation failed with ${errors} error(s)`);
  }

  return {
    generatedAt: new Date().toISOString(),
    courses,
  };
}

// ------------------------------------------------------------------
// Run
// ------------------------------------------------------------------

try {
  const manifest = compile();
  const totalArticles = manifest.courses.reduce((sum, c) => sum + c.articles.length, 0);
  writeFileSync(OUTPUT_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
  console.log(`\n✔ Wrote ${manifest.courses.length} courses (${totalArticles} articles) to ${OUTPUT_PATH}`);
} catch (e) {
  console.error(`\n${(e as Error).message}`);
  process.exit(1);
}
