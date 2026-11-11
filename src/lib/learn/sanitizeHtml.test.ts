import { describe, expect, it } from 'vitest';
import { sanitizeLearnHtml } from './sanitizeHtml';

describe('sanitizeLearnHtml', () => {
  it('preserves valid ontology embed catalogue IDs', () => {
    const sanitized = sanitizeLearnHtml(
      '<ontology-embed id="official/cosmic-coffee" diff="official/cosmic-coffee-step-1"></ontology-embed>',
    );
    const container = document.createElement('div');
    container.innerHTML = sanitized;

    const embed = container.querySelector('ontology-embed');
    expect(embed?.getAttribute('id')).toBe('official/cosmic-coffee');
    expect(embed?.getAttribute('diff')).toBe('official/cosmic-coffee-step-1');
  });

  it('removes encoded catalogue IDs that decode to markup', () => {
    const sanitized = sanitizeLearnHtml(
      '<ontology-embed id="&quot;><img src=x onerror=alert(document.domain)>"></ontology-embed>',
    );
    const container = document.createElement('div');
    container.innerHTML = sanitized;

    expect(container.querySelector('ontology-embed')?.hasAttribute('id')).toBe(false);
    expect(container.querySelector('img')).toBeNull();
    expect(sanitized).not.toContain('onerror');
  });
});
