/** A single learning article compiled from Markdown at build time. */
export interface LearnArticle {
  slug: string;
  title: string;
  description: string;
  order: number;
  /** Catalogue ontology ID to embed, e.g. "official/cosmic-coffee" */
  embed?: string;
  /** HTML content rendered from Markdown */
  html: string;
}

/** The full learn manifest emitted by compile-learn.ts */
export interface LearnManifest {
  generatedAt: string;
  count: number;
  articles: LearnArticle[];
}
