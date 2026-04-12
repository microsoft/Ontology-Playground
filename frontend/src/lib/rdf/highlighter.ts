/**
 * Lightweight regex-based XML/RDF syntax highlighter.
 *
 * Returns an array of React elements with inline color spans.
 * No dependencies — just regex + React.createElement.
 */
import { createElement, Fragment } from 'react';
import type { ReactNode } from 'react';

interface HighlightTheme {
  tag: string;       // XML tag names (<owl:Class>)
  attr: string;      // attribute names (rdf:about=)
  string: string;    // quoted values ("...")
  comment: string;   // <!-- ... -->
  namespace: string; // namespace prefixes (rdf:, owl:, xmlns:)
  text: string;      // default text color
}

export const RDF_HIGHLIGHT_DARK: HighlightTheme = {
  tag: '#569CD6',       // blue — tags
  attr: '#9CDCFE',      // light blue — attributes
  string: '#CE9178',    // orange — string values
  comment: '#6A9955',   // green — comments
  namespace: '#C586C0', // purple — namespace prefixes
  text: '#D4D4D4',      // gray — default
};

export const RDF_HIGHLIGHT_LIGHT: HighlightTheme = {
  tag: '#0000FF',       // blue
  attr: '#FF0000',      // red — matches VS Code light XML
  string: '#A31515',    // dark red
  comment: '#008000',   // green
  namespace: '#800080', // purple
  text: '#333333',      // dark gray
};

/**
 * Tokenize an RDF/XML string into highlighted React nodes.
 *
 * The regex picks off, in order:
 *  1. Comments   <!-- ... -->
 *  2. Tags       <...>  (opening, closing, self-closing)
 *  3. Plain text between tags
 */
export function highlightRdf(rdf: string, theme: HighlightTheme): ReactNode {
  const tokens: ReactNode[] = [];
  let key = 0;

  // Master pattern: comments | tags | text-between-tags
  const MASTER = /(<!--[\s\S]*?-->)|(<\/?[^>]+\/?>)|([^<]+)/g;
  let match: RegExpExecArray | null;

  while ((match = MASTER.exec(rdf)) !== null) {
    const [full, comment, tag, text] = match;

    if (comment) {
      tokens.push(span(key++, theme.comment, comment));
    } else if (tag) {
      tokens.push(highlightTag(tag, theme, key));
      key += 100; // leave room for sub-keys
    } else if (text) {
      tokens.push(span(key++, theme.text, text));
    } else if (full) {
      tokens.push(span(key++, theme.text, full));
    }
  }

  return createElement(Fragment, null, ...tokens);
}

/**
 * Highlight the interior of an XML tag: tag name, namespace prefix,
 * attributes, and quoted values.
 */
function highlightTag(tag: string, theme: HighlightTheme, baseKey: number): ReactNode {
  const parts: ReactNode[] = [];
  let k = baseKey;

  // Pattern for inside a tag:
  //   1. Quoted strings (single or double)
  //   2. Namespace prefix + colon (e.g. rdf:, owl:, xmlns:)
  //   3. Tag name at start (after < or </)
  //   4. Attribute name before =
  //   5. Everything else (punctuation: < > / = etc.)
  const TAG_INNER = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|([\w.-]+)(:)([\w.-]+)|([</?!]+)|([\w.-]+(?==))|([=>/\s]+)/g;

  let innerMatch: RegExpExecArray | null;
  let lastIndex = 0;

  while ((innerMatch = TAG_INNER.exec(tag)) !== null) {
    // Any skipped characters
    if (innerMatch.index > lastIndex) {
      parts.push(span(k++, theme.text, tag.slice(lastIndex, innerMatch.index)));
    }
    lastIndex = innerMatch.index + innerMatch[0].length;

    const [, quoted, nsPrefix, colon, localName, punct, attrName, rest] = innerMatch;

    if (quoted) {
      parts.push(span(k++, theme.string, quoted));
    } else if (nsPrefix && colon && localName) {
      // namespace:localName — e.g. rdf:about, owl:Class
      parts.push(span(k++, theme.namespace, nsPrefix));
      parts.push(span(k++, theme.tag, colon));
      parts.push(span(k++, theme.tag, localName));
    } else if (punct) {
      parts.push(span(k++, theme.tag, punct));
    } else if (attrName) {
      parts.push(span(k++, theme.attr, attrName));
    } else if (rest) {
      parts.push(span(k++, theme.text, rest));
    }
  }

  // Remaining tail
  if (lastIndex < tag.length) {
    parts.push(span(k++, theme.text, tag.slice(lastIndex)));
  }

  return createElement(Fragment, { key: baseKey }, ...parts);
}

function span(key: number, color: string, text: string): ReactNode {
  return createElement('span', { key, style: { color } }, text);
}
