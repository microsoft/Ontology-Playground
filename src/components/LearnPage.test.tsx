import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { LearnPage } from './LearnPage';
import type { LearnManifest } from '../types/learn';

const manifestFixture: LearnManifest = {
  generatedAt: '2026-05-04T00:00:00.000Z',
  courses: [
    {
      slug: 'finance-path',
      title: 'Finance Path',
      description: 'Finance learning path',
      type: 'path',
      icon: '🏦',
      articles: [
        {
          slug: 'finance-overview',
          title: 'Finance Overview',
          description: 'Start here',
          order: 1,
          html: '<p>Finance</p>',
        },
      ],
    },
    {
      slug: 'ontology-fundamentals',
      title: 'Ontology Fundamentals',
      description: 'Foundational concepts',
      type: 'path',
      icon: '📘',
      articles: [
        {
          slug: 'what-is-ontology',
          title: 'What is an ontology?',
          description: 'Basics',
          order: 1,
          html: '<p>Intro</p>',
        },
      ],
    },
    {
      slug: 'healthcare-path',
      title: 'Healthcare Path',
      description: 'Healthcare learning path',
      type: 'path',
      icon: '🏥',
      articles: [
        {
          slug: 'healthcare-overview',
          title: 'Healthcare Overview',
          description: 'Start here',
          order: 1,
          html: '<p>Healthcare</p>',
        },
      ],
    },
  ],
};

describe('LearnPage course ordering', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('pins ontology fundamentals first while preserving order of other courses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(manifestFixture),
    } as Response);

    const { container } = render(<LearnPage route={{ page: 'learn' }} />);

    await waitFor(() => {
      expect(screen.getByText('Ontology Fundamentals')).toBeInTheDocument();
    });

    const titles = Array.from(container.querySelectorAll('.learn-card h2')).map((node) => node.textContent?.trim());
    expect(titles).toEqual(['Ontology Fundamentals', 'Finance Path', 'Healthcare Path']);
  });
});