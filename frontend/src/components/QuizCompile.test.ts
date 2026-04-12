import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Integration test: verify that compiled learn.json contains valid quiz blocks.
 * This ensures the build pipeline (compile-learn.ts) produces well-formed
 * data-quiz attributes that can be parsed at runtime.
 */

interface LearnArticle {
  slug: string;
  html: string;
}
interface LearnCourse {
  slug: string;
  articles: LearnArticle[];
}
interface LearnManifest {
  courses: LearnCourse[];
}

const manifestPath = join(__dirname, '../../public/learn.json');

describe('compile-learn quiz integration', () => {
  let manifest: LearnManifest;

  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  } catch {
    // If learn.json doesn't exist, skip these tests gracefully
    manifest = { courses: [] };
  }

  it('learn.json contains quiz-block divs', () => {
    let count = 0;
    for (const course of manifest.courses) {
      for (const article of course.articles) {
        const matches = article.html.match(/class="quiz-block"/g);
        if (matches) count += matches.length;
      }
    }
    expect(count).toBeGreaterThan(0);
  });

  it('all data-quiz attributes contain valid parseable JSON', () => {
    const re = /data-quiz="([^"]*)"/g;
    for (const course of manifest.courses) {
      for (const article of course.articles) {
        let m: RegExpExecArray | null;
        while ((m = re.exec(article.html)) !== null) {
          const encoded = m[1];
          const decoded = encoded
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&amp;/g, '&');
          let quiz: unknown;
          expect(() => {
            quiz = JSON.parse(decoded);
          }).not.toThrow();
          // Verify structure
          const q = quiz as Record<string, unknown>;
          expect(q).toHaveProperty('question');
          expect(q).toHaveProperty('options');
          expect(q).toHaveProperty('explanation');
          expect(Array.isArray(q.options)).toBe(true);
          const opts = q.options as Array<{ text: string; correct: boolean }>;
          expect(opts.length).toBeGreaterThanOrEqual(2);
          expect(opts.some((o) => o.correct)).toBe(true);
        }
      }
    }
  });

  it('quiz-block divs have the data-quiz attribute', () => {
    // Every <div class="quiz-block" must have data-quiz
    const re = /<div class="quiz-block"(?![^>]*data-quiz)/g;
    for (const course of manifest.courses) {
      for (const article of course.articles) {
        const broken = article.html.match(re);
        expect(broken).toBeNull();
      }
    }
  });

  it('compiled learn html strips unsafe script and handler patterns', () => {
    const forbiddenPatterns = [
      /<script\b/i,
      /\son\w+\s*=/i,
      /javascript:/i,
    ];

    for (const course of manifest.courses) {
      for (const article of course.articles) {
        for (const pattern of forbiddenPatterns) {
          expect(pattern.test(article.html)).toBe(false);
        }
      }
    }
  });
});
