import sanitizeHtml from 'sanitize-html';

const ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'hr',
  'ul', 'ol', 'li',
  'strong', 'em', 'code', 'pre', 'blockquote',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'a', 'img',
  'div', 'span',
  'ontology-embed',
] as const;

const ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions['allowedAttributes'] = {
  a: ['href', 'title', 'target', 'rel'],
  img: ['src', 'alt', 'title'],
  div: ['class', 'data-quiz'],
  span: ['class'],
  'ontology-embed': ['id', 'height', 'diff'],
};

const ALLOWED_SCHEMES = ['http', 'https', 'mailto'] as const;

export function sanitizeLearnHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [...ALLOWED_TAGS],
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: [...ALLOWED_SCHEMES],
    allowedSchemesByTag: {
      img: ['http', 'https', 'data'],
    },
    enforceHtmlBoundary: true,
    parser: {
      lowerCaseTags: false,
    },
  });
}
