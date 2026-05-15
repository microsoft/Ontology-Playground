import { describe, expect, it } from 'vitest';
import { findShortestPath } from './pathFinder';
import type { Relationship } from '../data/ontology';

function rel(id: string, from: string, to: string): Relationship {
  return {
    id,
    name: id,
    from,
    to,
    cardinality: 'one-to-many',
  };
}

describe('findShortestPath', () => {
  it('finds a simple directed path', () => {
    const path = findShortestPath('a', 'c', [
      rel('a-b', 'a', 'b'),
      rel('b-c', 'b', 'c'),
    ]);

    expect(path?.map((node) => node.entityId)).toEqual(['a', 'b', 'c']);
  });

  it('respects direction and does not traverse backwards', () => {
    const path = findShortestPath('c', 'a', [
      rel('a-b', 'a', 'b'),
      rel('b-c', 'b', 'c'),
    ]);

    expect(path).toBeNull();
  });

  it('handles cycles without looping and still reaches the target', () => {
    const path = findShortestPath('a', 'd', [
      rel('a-b', 'a', 'b'),
      rel('b-c', 'b', 'c'),
      rel('c-a', 'c', 'a'),
      rel('c-d', 'c', 'd'),
    ]);

    expect(path?.map((node) => node.entityId)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('returns null for disconnected subgraphs', () => {
    const path = findShortestPath('a', 'z', [
      rel('a-b', 'a', 'b'),
      rel('b-c', 'b', 'c'),
      rel('x-y', 'x', 'y'),
      rel('y-z', 'y', 'z'),
    ]);

    expect(path).toBeNull();
  });

  it('returns a shortest path when multiple equal-length paths exist', () => {
    const path = findShortestPath('a', 'd', [
      rel('a-b', 'a', 'b'),
      rel('b-d', 'b', 'd'),
      rel('a-c', 'a', 'c'),
      rel('c-d', 'c', 'd'),
    ]);

    const ids = path?.map((node) => node.entityId);
    expect(ids?.length).toBe(3);
    expect(ids?.[0]).toBe('a');
    expect(ids?.[2]).toBe('d');
    expect([
      ['a', 'b', 'd'],
      ['a', 'c', 'd'],
    ]).toContainEqual(ids);
  });

  it('prefers fewer hops over longer alternatives in a larger graph', () => {
    const relationships: Relationship[] = [];
    for (let index = 0; index < 20; index += 1) {
      relationships.push(rel(`chain-${index}`, `n${index}`, `n${index + 1}`));
    }
    relationships.push(rel('shortcut-1', 'n0', 'hub'));
    relationships.push(rel('shortcut-2', 'hub', 'n20'));
    relationships.push(rel('branch-1', 'n3', 'x1'));
    relationships.push(rel('branch-2', 'x1', 'x2'));
    relationships.push(rel('branch-3', 'x2', 'x3'));

    const path = findShortestPath('n0', 'n20', relationships);

    expect(path?.map((node) => node.entityId)).toEqual(['n0', 'hub', 'n20']);
  });

  it('returns null for the same source and target under current UI semantics', () => {
    const path = findShortestPath('a', 'a', [rel('a-b', 'a', 'b')]);

    expect(path).toBeNull();
  });
});