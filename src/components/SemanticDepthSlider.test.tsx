import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  depthFromTrackPointer,
  SemanticDepthSlider,
} from './SemanticDepthSlider';

describe('SemanticDepthSlider', () => {
  it.each([
    { value: 3, pointerX: 270, expected: 2 },
    { value: 3, pointerX: 225, expected: 2 },
    { value: 1, pointerX: 30, expected: 2 },
    { value: 1, pointerX: 75, expected: 2 },
    { value: 3, pointerX: 0, expected: 1 },
    { value: 1, pointerX: 300, expected: 3 },
  ])(
    'maps an off-thumb click at $pointerX from $value to $expected',
    ({ value, pointerX, expected }) => {
      expect(depthFromTrackPointer({
        pointerX,
        trackLeft: 0,
        trackWidth: 300,
        value,
        max: 3,
      })).toBe(expected);
    },
  );

  it('leaves direct thumb interaction to native dragging', () => {
    expect(depthFromTrackPointer({
      pointerX: 150,
      trackLeft: 0,
      trackWidth: 300,
      value: 2,
      max: 3,
    })).toBeNull();
  });

  it.each([
    { value: 1, pointerX: 0 },
    { value: 1, pointerX: 27 },
    { value: 3, pointerX: 273 },
    { value: 3, pointerX: 300 },
  ])(
    'keeps endpoint thumb contact at $pointerX native for value $value',
    ({ value, pointerX }) => {
      expect(depthFromTrackPointer({
        pointerX,
        trackLeft: 0,
        trackWidth: 300,
        value,
        max: 3,
      })).toBeNull();
    },
  );

  it('handles track clicks while preserving native changes', () => {
    const onDepthChange = vi.fn();
    render(
      <SemanticDepthSlider
        aria-label="Detail"
        value={3}
        max={3}
        onDepthChange={onDepthChange}
      />,
    );
    const slider = screen.getByRole('slider', { name: 'Detail' });
    expect(slider).toHaveClass('semantic-depth-slider');
    expect(slider).toHaveStyle({
      '--semantic-depth-thumb-size': '28px',
    });
    expect(
      document.getElementById('semantic-depth-slider-styles'),
    ).toHaveTextContent('.semantic-depth-slider::-webkit-slider-thumb');
    vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({
      bottom: 44,
      height: 44,
      left: 0,
      right: 300,
      top: 0,
      width: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(slider, {
      button: 0,
      clientX: 270,
      isPrimary: true,
      pointerType: 'mouse',
    });
    expect(onDepthChange).toHaveBeenCalledWith(2);
    expect(slider).toHaveFocus();

    onDepthChange.mockClear();
    fireEvent.change(slider, { target: { value: '2' } });
    expect(onDepthChange).toHaveBeenCalledWith(2);

    onDepthChange.mockClear();
    fireEvent.pointerDown(slider, {
      button: 0,
      clientX: 270,
      isPrimary: true,
      pointerType: 'touch',
    });
    expect(onDepthChange).toHaveBeenCalledWith(2);

    onDepthChange.mockClear();
    fireEvent.pointerDown(slider, {
      button: 2,
      clientX: 270,
      isPrimary: true,
      pointerType: 'mouse',
    });
    expect(onDepthChange).not.toHaveBeenCalled();
  });

  it('suppresses native touch rounding only for handled track taps', () => {
    const onDepthChange = vi.fn();
    const { rerender } = render(
      <SemanticDepthSlider
        aria-label="Detail"
        value={3}
        max={3}
        onDepthChange={onDepthChange}
      />,
    );
    const slider = screen.getByRole('slider', { name: 'Detail' });
    vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({
      bottom: 44,
      height: 44,
      left: 0,
      right: 300,
      top: 0,
      width: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(slider, {
      button: 0,
      clientX: 270,
      isPrimary: true,
      pointerType: 'touch',
    });
    const handledTouch = new Event('touchstart', {
      bubbles: true,
      cancelable: true,
    });
    slider.dispatchEvent(handledTouch);
    expect(handledTouch.defaultPrevented).toBe(true);

    rerender(
      <SemanticDepthSlider
        aria-label="Detail"
        value={2}
        max={3}
        onDepthChange={onDepthChange}
      />,
    );
    fireEvent.pointerDown(slider, {
      button: 0,
      clientX: 150,
      isPrimary: true,
      pointerType: 'touch',
    });
    const thumbTouch = new Event('touchstart', {
      bubbles: true,
      cancelable: true,
    });
    slider.dispatchEvent(thumbTouch);
    expect(thumbTouch.defaultPrevented).toBe(false);
  });
});
