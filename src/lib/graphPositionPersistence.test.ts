import { describe, expect, it } from 'vitest';
import type { Core, ElementDefinition } from 'cytoscape';
import {
  captureGraphPositionSnapshot,
  preserveGraphElementPositions,
  type GraphPositionSnapshot,
} from './graphPositionPersistence';
import { VISUAL_GROUP_NODE_TYPE } from './visualGroups';

const elements: ElementDefinition[] = [
  { data: { id: 'root' } },
  { data: { id: 'existing' } },
  { data: { id: 'added' } },
  {
    data: {
      id: 'root-existing',
      source: 'root',
      target: 'existing',
    },
  },
  {
    data: {
      id: 'existing-added',
      source: 'existing',
      target: 'added',
    },
  },
];

describe('graph position persistence', () => {
  it('excludes visual-only compound parents from captured positions', () => {
    const nodes = [
      {
        id: () => '__visual_group__:Commerce',
        data: (name: string) => name === 'type' ? VISUAL_GROUP_NODE_TYPE : undefined,
        position: () => ({ x: 50, y: 50 }),
      },
      {
        id: () => 'customer',
        data: (name: string) => name === 'type' ? 'entity' : undefined,
        position: () => ({ x: 100, y: 120 }),
      },
    ];
    const cy = {
      nodes: () => ({
        forEach: (callback: (node: typeof nodes[number]) => void) => {
          nodes.forEach(callback);
        },
      }),
      zoom: () => 0.8,
      pan: () => ({ x: 20, y: 30 }),
    } as unknown as Core;

    const snapshot = captureGraphPositionSnapshot(cy);

    expect(snapshot?.positions).toEqual(new Map([
      ['customer', { x: 100, y: 120 }],
    ]));
  });

  it('keeps existing nodes fixed and places added neighbors around them', () => {
    const snapshot: GraphPositionSnapshot = {
      positions: new Map([
        ['root', { x: 100, y: 100 }],
        ['existing', { x: 250, y: 100 }],
      ]),
      zoom: 0.8,
      pan: { x: 20, y: 30 },
      anchorId: 'existing',
    };

    const positioned = preserveGraphElementPositions(elements, snapshot);

    expect(positioned).not.toBeNull();
    expect(positioned?.find(({ data }) => data.id === 'root')?.position)
      .toEqual({ x: 100, y: 100 });
    expect(positioned?.find(({ data }) => data.id === 'existing')?.position)
      .toEqual({ x: 250, y: 100 });
    expect(positioned?.find(({ data }) => data.id === 'added')?.position)
      .toEqual({ x: 360, y: 100 });
  });

  it('does not apply stale coordinates to an unrelated graph', () => {
    const snapshot: GraphPositionSnapshot = {
      positions: new Map([['other', { x: 10, y: 10 }]]),
      zoom: 1,
      pan: { x: 0, y: 0 },
    };

    expect(preserveGraphElementPositions(elements, snapshot)).toBeNull();
  });

  it('places newly revealed hierarchy branches outward from fixed parents', () => {
    const branchIds = ['east', 'west', 'south', 'north'];
    const hierarchyElements: ElementDefinition[] = [
      { data: { id: 'root' } },
      ...branchIds.flatMap((id) => [
        { data: { id } },
        { data: { id: `${id}-child` } },
        {
          data: {
            id: `${id}-root`,
            source: id,
            target: 'root',
            kind: 'subclass',
          },
        },
        {
          data: {
            id: `${id}-child-edge`,
            source: `${id}-child`,
            target: id,
            kind: 'subclass',
          },
        },
      ]),
    ];
    const snapshot: GraphPositionSnapshot = {
      positions: new Map([
        ['root', { x: 0, y: 0 }],
        ['east', { x: 200, y: 0 }],
        ['west', { x: -200, y: 0 }],
        ['south', { x: 0, y: 200 }],
        ['north', { x: 0, y: -200 }],
      ]),
      zoom: 1,
      pan: { x: 0, y: 0 },
    };

    const positioned = preserveGraphElementPositions(
      hierarchyElements,
      snapshot,
    );
    const positionOf = (id: string) => positioned?.find(
      ({ data }) => data.id === id,
    )?.position;

    expect(positionOf('east-child')?.x).toBeGreaterThan(200);
    expect(positionOf('west-child')?.x).toBeLessThan(-200);
    expect(positionOf('south-child')?.y).toBeGreaterThan(200);
    expect(positionOf('north-child')?.y).toBeLessThan(-200);
  });
});
