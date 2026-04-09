/**
 * Lightweight syntax highlighter for the LPG/Cypher format produced by serializeToLPG().
 *
 * Highlights, in priority order:
 *  1. Structured-comment tags  // [TAG]   → accent purple
 *  2. Pipe-separated values in tags       → teal
 *  3. Regular comments         // ...     → green
 *  4. Cypher keywords                     → blue
 *  5. Node labels              :Label     → yellow
 *  6. Relationship types       [:REL]     → orange
 *  7. Everything else                     → default text color
 */
import { createElement, Fragment } from 'react';
import type { ReactNode } from 'react';

export interface LPGHighlightTheme {
  tag:      string;  // [TAG] markers
  pipe:     string;  // pipe-separated values inside tags
  comment:  string;  // regular // comments
  keyword:  string;  // Cypher keywords
  label:    string;  // :NodeLabel
  reltype:  string;  // [:REL_TYPE]
  text:     string;  // default
}

export const LPG_HIGHLIGHT_DARK: LPGHighlightTheme = {
  tag:     '#C586C0',  // purple  — [NODE], [REL], …
  pipe:    '#9CDCFE',  // light blue — values after |
  comment: '#6A9955',  // green
  keyword: '#569CD6',  // blue
  label:   '#DCDCAA',  // yellow
  reltype: '#CE9178',  // orange
  text:    '#D4D4D4',  // gray
};

export const LPG_HIGHLIGHT_LIGHT: LPGHighlightTheme = {
  tag:     '#800080',  // purple
  pipe:    '#0070C1',  // blue
  comment: '#008000',  // green
  keyword: '#0000FF',  // blue
  label:   '#795E26',  // brown-yellow
  reltype: '#A31515',  // dark red
  text:    '#333333',
};

const CYPHER_KEYWORDS = new Set([
  'CREATE', 'CONSTRAINT', 'IF', 'NOT', 'EXISTS', 'FOR', 'REQUIRE',
  'IS', 'UNIQUE', 'NODE', 'KEY', 'INDEX', 'ON', 'CALL', 'RETURN',
  'MATCH', 'WHERE', 'WITH', 'MERGE', 'SET', 'DELETE', 'REMOVE',
]);

function span(key: number, color: string, text: string): ReactNode {
  return createElement('span', { key, style: { color } }, text);
}

/** Tokenise a single line into highlighted React nodes. */
function highlightLine(line: string, theme: LPGHighlightTheme, baseKey: number): ReactNode {
  const parts: ReactNode[] = [];
  let k = baseKey;

  // ── Structured comment line: // [TAG] value | value | …
  const tagMatch = line.match(/^(\/\/\s*)(\[[\w]+\])(.*)/);
  if (tagMatch) {
    const [, prefix, tag, rest] = tagMatch;
    parts.push(span(k++, theme.comment, prefix));
    parts.push(span(k++, theme.tag, tag));

    // Highlight pipe-delimited segments in a different colour
    const segments = rest.split('|');
    segments.forEach((seg, i) => {
      if (i > 0) parts.push(span(k++, theme.text, '|'));
      parts.push(span(k++, theme.pipe, seg));
    });
    return createElement(Fragment, { key: baseKey }, ...parts);
  }

  // ── Plain comment line
  if (/^\/\//.test(line)) {
    return span(k++, theme.comment, line);
  }

  // ── Non-comment line: tokenise for Cypher keywords, labels, rel-types
  // Regex groups: quoted strings | :Label | [:REL] | word | non-word
  const TOKEN = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|\[:([A-Z_][A-Z0-9_]*)\]|:([A-Za-z_][A-Za-z0-9_]*)|([A-Z_][A-Z0-9_]{2,})|([^"':A-Za-z_]+)|(.+?)/g;
  let m: RegExpExecArray | null;
  while ((m = TOKEN.exec(line)) !== null) {
    const [, quoted, relType, label, word, other, fallback] = m;
    if (quoted)  { parts.push(span(k++, theme.reltype, quoted));  continue; }
    if (relType) { parts.push(span(k++, theme.text,    '[:')); parts.push(span(k++, theme.reltype, relType)); parts.push(span(k++, theme.text, ']')); continue; }
    if (label)   { parts.push(span(k++, theme.text,    ':')); parts.push(span(k++, theme.label,   label));   continue; }
    if (word)    { parts.push(span(k++, CYPHER_KEYWORDS.has(word) ? theme.keyword : theme.text, word)); continue; }
    if (other)   { parts.push(span(k++, theme.text,    other));   continue; }
    if (fallback){ parts.push(span(k++, theme.text,    fallback)); }
  }
  return createElement(Fragment, { key: baseKey }, ...parts);
}

/**
 * Highlight an LPG/Cypher string into React nodes.
 * Each line is highlighted independently to avoid multiline-regex edge cases.
 */
export function highlightLPG(lpg: string, theme: LPGHighlightTheme): ReactNode {
  const lines = lpg.split('\n');
  const nodes: ReactNode[] = [];
  lines.forEach((line, i) => {
    nodes.push(highlightLine(line, theme, i * 200));
    if (i < lines.length - 1) nodes.push('\n');
  });
  return createElement(Fragment, null, ...nodes);
}
