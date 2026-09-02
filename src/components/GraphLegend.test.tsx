import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GraphLegend, LEGEND_AUTO_COLLAPSE_THRESHOLD } from './GraphLegend';
import type { EntityType } from '../data/ontology';

const STORAGE_KEY = 'ontology-legend-collapsed';

function makeEntityTypes(count: number): EntityType[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `entity-${index}`,
    name: `Entity ${index}`,
    description: `Entity ${index} description`,
    properties: [],
    icon: '📦',
    color: '#0078D4',
  }));
}

const toggleButton = () => screen.getByRole('button', { name: /Entity Types legend/i });

describe('GraphLegend', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('lists every entity type when expanded', () => {
    render(<GraphLegend entityTypes={makeEntityTypes(3)} />);

    expect(toggleButton()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('📦 Entity 0')).toBeInTheDocument();
    expect(screen.getByText('📦 Entity 2')).toBeInTheDocument();
  });

  it('collapses the legend off the canvas and remembers the choice', () => {
    render(<GraphLegend entityTypes={makeEntityTypes(3)} />);

    fireEvent.click(toggleButton());

    expect(toggleButton()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('📦 Entity 0')).not.toBeInTheDocument();
    // The title stays visible so the collapsed legend is still findable.
    expect(screen.getByText('Entity Types')).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
  });

  it('re-expands and persists that choice too', () => {
    render(<GraphLegend entityTypes={makeEntityTypes(3)} />);

    fireEvent.click(toggleButton());
    fireEvent.click(toggleButton());

    expect(toggleButton()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('📦 Entity 0')).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBe('false');
  });

  it('shows the entity type count while collapsed', () => {
    render(<GraphLegend entityTypes={makeEntityTypes(7)} />);

    fireEvent.click(toggleButton());

    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('starts collapsed for an ontology large enough to bury the graph', () => {
    render(<GraphLegend entityTypes={makeEntityTypes(LEGEND_AUTO_COLLAPSE_THRESHOLD + 1)} />);

    expect(toggleButton()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('📦 Entity 0')).not.toBeInTheDocument();
  });

  it('starts expanded at the threshold', () => {
    render(<GraphLegend entityTypes={makeEntityTypes(LEGEND_AUTO_COLLAPSE_THRESHOLD)} />);

    expect(toggleButton()).toHaveAttribute('aria-expanded', 'true');
  });

  it('honours a stored preference over the size heuristic', () => {
    localStorage.setItem(STORAGE_KEY, 'false');

    render(<GraphLegend entityTypes={makeEntityTypes(LEGEND_AUTO_COLLAPSE_THRESHOLD + 50)} />);

    expect(toggleButton()).toHaveAttribute('aria-expanded', 'true');
  });

  it('collapses when a large ontology is loaded into an open session', () => {
    const { rerender } = render(<GraphLegend entityTypes={makeEntityTypes(3)} />);
    expect(toggleButton()).toHaveAttribute('aria-expanded', 'true');

    rerender(<GraphLegend entityTypes={makeEntityTypes(LEGEND_AUTO_COLLAPSE_THRESHOLD + 100)} />);

    expect(toggleButton()).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps an explicit choice when a large ontology is loaded', () => {
    const { rerender } = render(<GraphLegend entityTypes={makeEntityTypes(3)} />);

    fireEvent.click(toggleButton()); // collapse
    fireEvent.click(toggleButton()); // expand — now an explicit preference
    rerender(<GraphLegend entityTypes={makeEntityTypes(LEGEND_AUTO_COLLAPSE_THRESHOLD + 100)} />);

    expect(toggleButton()).toHaveAttribute('aria-expanded', 'true');
  });

  it('still toggles when localStorage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('localStorage disabled');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('localStorage disabled');
    });

    render(<GraphLegend entityTypes={makeEntityTypes(3)} />);

    expect(() => fireEvent.click(toggleButton())).not.toThrow();
    expect(toggleButton()).toHaveAttribute('aria-expanded', 'false');
  });
});
