import { describe, expect, it } from 'vitest';
import {
  buildVisualGroupProjection,
  VISUAL_GROUP_NODE_TYPE,
} from './visualGroups';

describe('buildVisualGroupProjection', () => {
  it('creates a visual-only parent for groups with multiple visible members', () => {
    const projection = buildVisualGroupProjection([
      { id: 'quote', visualGroup: ' Quote & Approval ' },
      { id: 'quote-item', visualGroup: 'Quote & Approval' },
      { id: 'project', visualGroup: 'Project Core' },
      { id: 'user' },
    ]);

    expect(projection.nodes).toHaveLength(1);
    expect(projection.nodes[0]).toMatchObject({
      data: {
        label: 'Quote & Approval',
        type: VISUAL_GROUP_NODE_TYPE,
      },
      selectable: false,
      grabbable: false,
    });
    const parentId = projection.nodes[0].data.id as string;
    expect(projection.parentByEntityId.get('quote')).toBe(parentId);
    expect(projection.parentByEntityId.get('quote-item')).toBe(parentId);
    expect(projection.parentByEntityId.has('project')).toBe(false);
    expect(projection.parentByEntityId.has('user')).toBe(false);
  });

  it('avoids collisions with authored entity IDs', () => {
    const collision = '__visual_group__:Settlement';
    const projection = buildVisualGroupProjection([
      { id: collision },
      { id: 'period', visualGroup: 'Settlement' },
      { id: 'item', visualGroup: 'Settlement' },
    ]);

    expect(projection.nodes[0].data.id).toBe(`${collision}:2`);
  });

  it('avoids collisions with reserved relationship IDs', () => {
    const collision = '__visual_group__:Settlement';
    const projection = buildVisualGroupProjection([
      { id: 'period', visualGroup: 'Settlement' },
      { id: 'item', visualGroup: 'Settlement' },
    ], [collision]);

    expect(projection.nodes[0].data.id).toBe(`${collision}:2`);
  });
});
