import { afterEach, describe, expect, it, vi } from 'vitest';
import cytoscape, { type Core } from 'cytoscape';
import { syncGraphElements } from './syncGraphElements';

// The designer preview renders into a canvas, which jsdom does not provide, so
// the sync logic is exercised against a headless Cytoscape instance instead.

type GraphOntology = Parameters<typeof syncGraphElements>[1];
const graphs: Core[] = [];

afterEach(() => {
  graphs.forEach((cy) => cy.destroy());
  graphs.length = 0;
  vi.restoreAllMocks();
});

function entity(id: string) {
  return { id, name: id, icon: '📦', color: '#0078D4' };
}

function relationship(id: string, from: string, to: string, name = 'relatesTo') {
  return { id, name, from, to, cardinality: 'one-to-many' };
}

function graphOf(ontology: GraphOntology): Core {
  const cy = cytoscape({ headless: true });
  graphs.push(cy);
  syncGraphElements(cy, ontology);
  return cy;
}

describe('syncGraphElements', () => {
  it('draws an edge between the entities its relationship points at', () => {
    const cy = graphOf({
      entityTypes: [entity('book'), entity('author')],
      relationships: [relationship('rel-1', 'book', 'author', 'writtenBy')],
    });

    const edge = cy.getElementById('rel-1');
    expect(edge.source().id()).toBe('book');
    expect(edge.target().id()).toBe('author');
  });

  it('moves the edge when the relationship is re-pointed at another source', () => {
    const entityTypes = [entity('book'), entity('author'), entity('member')];
    const cy = graphOf({
      entityTypes,
      relationships: [relationship('rel-1', 'member', 'author', 'writtenBy')],
    });

    syncGraphElements(cy, {
      entityTypes,
      relationships: [relationship('rel-1', 'book', 'author', 'writtenBy')],
    });

    const edge = cy.getElementById('rel-1');
    expect(edge.source().id()).toBe('book');
    expect(edge.target().id()).toBe('author');
    expect(cy.edges()).toHaveLength(1);
  });

  it('moves the edge when the relationship is re-pointed at another target', () => {
    const entityTypes = [entity('book'), entity('author'), entity('member')];
    const cy = graphOf({
      entityTypes,
      relationships: [relationship('rel-1', 'book', 'author', 'borrowedBy')],
    });

    syncGraphElements(cy, {
      entityTypes,
      relationships: [relationship('rel-1', 'book', 'member', 'borrowedBy')],
    });

    const edge = cy.getElementById('rel-1');
    expect(edge.source().id()).toBe('book');
    expect(edge.target().id()).toBe('member');
    expect(cy.edges()).toHaveLength(1);
  });

  it.each([
    ['member', 'author'],
    ['book', 'member'],
    ['member', 'member'],
  ])('keeps a re-pointed edge after removing its old endpoint (%s → %s)', (from, to) => {
    const cy = graphOf({
      entityTypes: [entity('book'), entity('author'), entity('member')],
      relationships: [relationship('rel-1', from, to, 'writtenBy')],
    });

    syncGraphElements(cy, {
      entityTypes: [entity('book'), entity('author')],
      relationships: [relationship('rel-1', 'book', 'author', 'writtenBy')],
    });

    const edge = cy.getElementById('rel-1');
    expect(edge).toHaveLength(1);
    expect(edge.source().id()).toBe('book');
    expect(edge.target().id()).toBe('author');
    expect(cy.getElementById('member')).toHaveLength(0);
    expect(cy.edges()).toHaveLength(1);
  });

  it('creates new endpoint nodes before reconnecting existing edges', () => {
    const cy = graphOf({
      entityTypes: [entity('book'), entity('author')],
      relationships: [relationship('rel-1', 'book', 'author')],
    });

    syncGraphElements(cy, {
      entityTypes: [entity('book'), entity('author'), entity('publisher')],
      relationships: [relationship('rel-1', 'publisher', 'book')],
    });

    expect(cy.getElementById('rel-1').source().id()).toBe('publisher');
    expect(cy.getElementById('rel-1').target().id()).toBe('book');
    expect(cy.edges()).toHaveLength(1);
  });

  it('moves edges through Cytoscape while updating label and hierarchy kind', () => {
    const entityTypes = [entity('book'), entity('author'), entity('member')];
    const cy = graphOf({
      entityTypes,
      relationships: [relationship('rel-1', 'book', 'author')],
    });
    const edge = cy.getElementById('rel-1');
    const move = vi.spyOn(edge[0], 'move');

    syncGraphElements(cy, {
      entityTypes,
      relationships: [{
        ...relationship('rel-1', 'member', 'book', 'subClassOf'),
        kind: 'subclass',
      }],
    });

    expect(move).toHaveBeenCalledWith({ source: 'member', target: 'book' });
    expect(cy.getElementById('rel-1').data('label')).toBe('subClassOf');
    expect(cy.getElementById('rel-1').data('kind')).toBe('subclass');
  });

  it('preserves parallel edges when moving into and out of a self-loop', () => {
    const entityTypes = [entity('book'), entity('author')];
    const parallel = relationship('rel-2', 'book', 'author');
    const cy = graphOf({
      entityTypes,
      relationships: [relationship('rel-1', 'book', 'author'), parallel],
    });

    for (const to of ['book', 'author']) {
      syncGraphElements(cy, {
        entityTypes,
        relationships: [relationship('rel-1', 'book', to), parallel],
      });
      expect(cy.edges()).toHaveLength(2);
      expect(cy.getElementById('rel-1').source().id()).toBe('book');
      expect(cy.getElementById('rel-1').target().id()).toBe(to);
      expect(cy.getElementById('rel-2').target().id()).toBe('author');
    }
  });

  it('retains hierarchy styling when adding and recreating edges', () => {
    const rel = { ...relationship('rel-1', 'book', 'author'), kind: 'subclass' as const };
    const cy = graphOf({
      entityTypes: [entity('book'), entity('author'), entity('member')],
      relationships: [rel],
    });
    expect(cy.getElementById('rel-1').data('kind')).toBe('subclass');

    syncGraphElements(cy, {
      entityTypes: [entity('book'), entity('member')],
      relationships: [{ ...rel, to: 'member' }],
    });
    expect(cy.getElementById('rel-1').target().id()).toBe('member');
    expect(cy.getElementById('rel-1').data('kind')).toBe('subclass');
  });

  it('keeps the endpoints and updates the label when only the name changes', () => {
    const entityTypes = [entity('book'), entity('author')];
    const cy = graphOf({
      entityTypes,
      relationships: [relationship('rel-1', 'book', 'author', 'writtenBy')],
    });

    syncGraphElements(cy, {
      entityTypes,
      relationships: [relationship('rel-1', 'book', 'author', 'authoredBy')],
    });

    const edge = cy.getElementById('rel-1');
    expect(edge.data('label')).toBe('authoredBy');
    expect(edge.source().id()).toBe('book');
    expect(edge.target().id()).toBe('author');
  });

  it('leaves the positions of existing nodes untouched when re-pointing', () => {
    const entityTypes = [entity('book'), entity('author'), entity('member')];
    const cy = graphOf({
      entityTypes,
      relationships: [relationship('rel-1', 'member', 'author', 'writtenBy')],
    });
    cy.getElementById('book').position({ x: 100, y: 200 });

    syncGraphElements(cy, {
      entityTypes,
      relationships: [relationship('rel-1', 'book', 'author', 'writtenBy')],
    });

    expect(cy.getElementById('book').position()).toEqual({ x: 100, y: 200 });
  });

  it('drops the edge once its relationship is deleted', () => {
    const entityTypes = [entity('book'), entity('author')];
    const cy = graphOf({
      entityTypes,
      relationships: [relationship('rel-1', 'book', 'author', 'writtenBy')],
    });

    syncGraphElements(cy, { entityTypes, relationships: [] });

    expect(cy.getElementById('rel-1')).toHaveLength(0);
    expect(cy.nodes()).toHaveLength(2);
  });
});
