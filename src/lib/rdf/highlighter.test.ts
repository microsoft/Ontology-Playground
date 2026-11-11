import { describe, expect, it } from 'vitest';
import {
  highlightRdf,
  MAX_HIGHLIGHTED_RDF_CHARACTERS,
  RDF_HIGHLIGHT_LIGHT,
} from './highlighter';

describe('highlightRdf', () => {
  it('keeps small RDF syntax highlighted', () => {
    const source = '<rdf:RDF><rdf:Description/></rdf:RDF>';

    expect(highlightRdf(source, RDF_HIGHLIGHT_LIGHT)).not.toBe(source);
  });

  it('renders accepted multi-megabyte sources as one plain text node', () => {
    const source = '<rdf:RDF>'
      + 'x'.repeat(MAX_HIGHLIGHTED_RDF_CHARACTERS)
      + '</rdf:RDF>';

    expect(() => highlightRdf(source, RDF_HIGHLIGHT_LIGHT)).not.toThrow();
    expect(highlightRdf(source, RDF_HIGHLIGHT_LIGHT)).toBe(source);
  });
});
