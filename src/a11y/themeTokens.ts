/// <reference types="node" />
// Resolves each theme's design-token values straight from src/styles/app.css so
// the accessibility test guards the real stylesheet (no duplicated color list).
//
// Tokens are CSS custom properties declared on a small set of theme selectors.
// We layer them exactly the way themeClass() in the app store applies classes:
//   dark    -> :root
//   light   -> :root + .light-theme
//   aurora  -> :root + .theme-aurora
//   crimson -> :root + .light-theme + .theme-crimson

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type ThemeId = 'dark' | 'light' | 'aurora' | 'crimson';

export const THEMES: ThemeId[] = ['dark', 'light', 'aurora', 'crimson'];

// Resolved from the project root (Vitest runs from there). Avoids import.meta.url,
// which the jsdom test environment reports with a non-file scheme.
const CSS_PATH = resolve(process.cwd(), 'src/styles/app.css');

const THEME_SELECTORS: Record<ThemeId, string[]> = {
  dark: [':root'],
  light: [':root', '.light-theme'],
  aurora: [':root', '.theme-aurora'],
  crimson: [':root', '.light-theme', '.theme-crimson'],
};

let cssCache: string | null = null;

function readCss(): string {
  cssCache ??= readFileSync(CSS_PATH, 'utf8');
  return cssCache;
}

/**
 * Extract the custom-property declarations from every standalone
 * `<selector> { ... }` rule (ignoring compound/descendant selectors that merely
 * mention the class). Later declarations win, mirroring the cascade.
 */
function extractVars(css: string, selector: string): Record<string, string> {
  const vars: Record<string, string> = {};
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // The selector must open the rule: preceded by start, `}`, or a comment close.
  const blockRe = new RegExp(`(?:[}/]|^)\\s*${escaped}\\s*\\{([^}]*)\\}`, 'g');
  const declRe = /(--[\w-]+)\s*:\s*([^;]+);/g;

  let block: RegExpExecArray | null;
  while ((block = blockRe.exec(css)) !== null) {
    const body = block[1];
    let decl: RegExpExecArray | null;
    while ((decl = declRe.exec(body)) !== null) {
      vars[decl[1].trim()] = decl[2].trim();
    }
  }
  return vars;
}

/** Resolved custom-property map for a theme (token name -> CSS value). */
export function getThemeTokens(theme: ThemeId): Record<string, string> {
  const css = readCss();
  const merged: Record<string, string> = {};
  for (const selector of THEME_SELECTORS[theme]) {
    Object.assign(merged, extractVars(css, selector));
  }
  return merged;
}
