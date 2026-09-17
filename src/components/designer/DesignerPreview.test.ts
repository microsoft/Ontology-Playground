import { describe, expect, it } from 'vitest';
import cytoscape, { type Core } from 'cytoscape';
import { syncGraphElements } from './DesignerPreview';

// The designer preview renders into a canvas, which jsdom does not provide, so
// the sync logic is exercised against a headless Cytoscape instance instead.

type GraphOntology = Parameters<typeof syncGraphElements>[1];

function entity(id: string) {
  return { id, name: id, icon: '📦', color: '#0078D4' };
}

function relationship(id: string, from: string, to: string, name = 'relatesTo') {
  return { id, name, from, to, cardinality: 'one-to-many' };
}

function graphOf(ontology: GraphOntology): Core {
  const cy = cytoscape({ headless: true });
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
