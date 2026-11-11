import { act, renderHook } from '@testing-library/react';
import type { Core } from 'cytoscape';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGraphNodeActionPosition } from './useGraphNodeActionPosition';

describe('useGraphNodeActionPosition', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stops reading node bounds after the graph is destroyed', () => {
    let destroyed = false;
    let scheduledFrame: FrameRequestCallback | null = null;
    const renderedBoundingBox = vi.fn(() => ({
      x1: 200,
      y1: 200,
      x2: 240,
      y2: 240,
      w: 40,
      h: 40,
    }));
    const node = {
      length: 1,
      renderedBoundingBox,
    };
    const cy = {
      destroyed: () => destroyed,
      getElementById: () => node,
      width: () => 800,
      height: () => 600,
      on: vi.fn(),
      off: vi.fn(),
    } as unknown as Core;
    vi.stubGlobal('requestAnimationFrame', (
      callback: FrameRequestCallback,
    ) => {
      scheduledFrame = callback;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    const { result } = renderHook(() => (
      useGraphNodeActionPosition(cy, 'collection', true)
    ));
    expect(result.current).toEqual({
      left: 220,
      top: 190,
      placement: 'above',
    });
    expect(renderedBoundingBox).toHaveBeenCalledTimes(1);

    destroyed = true;
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(scheduledFrame).not.toBeNull();
    act(() => {
      scheduledFrame?.(0);
    });

    expect(result.current).toBeNull();
    expect(renderedBoundingBox).toHaveBeenCalledTimes(1);
  });
});
