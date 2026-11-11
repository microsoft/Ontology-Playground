import type {
  ComponentProps,
  CSSProperties,
  PointerEvent,
} from 'react';
import {
  useEffect,
  useInsertionEffect,
  useRef,
} from 'react';

const THUMB_SIZE = 28;
const THUMB_RADIUS = THUMB_SIZE / 2;
const STYLE_ELEMENT_ID = 'semantic-depth-slider-styles';
const SLIDER_STYLES = `
.semantic-depth-slider {
  height: 44px;
  padding: 0;
  color: #0078d4;
  background: transparent;
  cursor: pointer;
  appearance: none;
}
.semantic-depth-slider::-webkit-slider-runnable-track {
  height: 4px;
  background: rgb(128 128 128 / 55%);
  border-radius: 999px;
}
.semantic-depth-slider::-webkit-slider-thumb {
  width: var(--semantic-depth-thumb-size);
  height: var(--semantic-depth-thumb-size);
  margin-top: calc((4px - var(--semantic-depth-thumb-size)) / 2);
  box-sizing: border-box;
  background: currentColor;
  border: 2px solid Canvas;
  border-radius: 50%;
  box-shadow: 0 1px 4px rgb(0 0 0 / 35%);
  appearance: none;
}
.semantic-depth-slider::-moz-range-track {
  height: 4px;
  background: rgb(128 128 128 / 55%);
  border-radius: 999px;
}
.semantic-depth-slider::-moz-range-thumb {
  width: var(--semantic-depth-thumb-size);
  height: var(--semantic-depth-thumb-size);
  box-sizing: border-box;
  background: currentColor;
  border: 2px solid Canvas;
  border-radius: 50%;
  box-shadow: 0 1px 4px rgb(0 0 0 / 35%);
}
.semantic-depth-slider:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}
.semantic-depth-slider:disabled {
  cursor: not-allowed;
}
`;

function ensureSliderStyles(): void {
  if (
    typeof document === 'undefined'
    || document.getElementById(STYLE_ELEMENT_ID)
  ) {
    return;
  }
  const style = document.createElement('style');
  style.id = STYLE_ELEMENT_ID;
  style.textContent = SLIDER_STYLES;
  document.head.append(style);
}

interface TrackPointerOptions {
  pointerX: number;
  trackLeft: number;
  trackWidth: number;
  value: number;
  min?: number;
  max: number;
}

export function depthFromTrackPointer({
  pointerX,
  trackLeft,
  trackWidth,
  value,
  min = 1,
  max,
}: TrackPointerOptions): number | null {
  const usableTrackWidth = trackWidth - THUMB_SIZE;
  if (usableTrackWidth <= 0 || max <= min) return null;

  const boundedValue = Math.min(max, Math.max(min, value));
  const valueRatio = (boundedValue - min) / (max - min);
  const usableTrackLeft = trackLeft + THUMB_RADIUS;
  const thumbCenter = usableTrackLeft + valueRatio * usableTrackWidth;
  if (Math.abs(pointerX - thumbCenter) <= THUMB_RADIUS) {
    return null;
  }

  const pointerRatio = Math.min(
    1,
    Math.max(0, (pointerX - usableTrackLeft) / usableTrackWidth),
  );
  const nearestValue = Math.round(min + pointerRatio * (max - min));
  const direction = pointerX < thumbCenter ? -1 : 1;
  const nextValue = nearestValue === boundedValue
    ? boundedValue + direction
    : nearestValue;

  return Math.min(max, Math.max(min, nextValue));
}

interface SemanticDepthSliderProps extends Omit<
  ComponentProps<'input'>,
  | 'max'
  | 'min'
  | 'onChange'
  | 'onPointerDownCapture'
  | 'ref'
  | 'step'
  | 'type'
  | 'value'
> {
  value: number;
  max: number;
  onDepthChange: (depth: number) => void;
}

export function SemanticDepthSlider({
  value,
  max,
  onDepthChange,
  disabled,
  className,
  style,
  ...inputProps
}: SemanticDepthSliderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const suppressNextTouchStartRef = useRef(false);

  useInsertionEffect(ensureSliderStyles, []);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    const suppressHandledTouch = (event: TouchEvent) => {
      if (!suppressNextTouchStartRef.current) return;
      suppressNextTouchStartRef.current = false;
      event.preventDefault();
    };
    input.addEventListener('touchstart', suppressHandledTouch, {
      passive: false,
    });
    return () => {
      input.removeEventListener('touchstart', suppressHandledTouch);
    };
  }, []);

  const applyTrackClick = (
    input: HTMLInputElement,
    pointerX: number,
  ) => {
    const bounds = input.getBoundingClientRect();
    const nextDepth = depthFromTrackPointer({
      pointerX,
      trackLeft: bounds.left,
      trackWidth: bounds.width,
      value,
      max,
    });
    if (nextDepth === null) return false;

    input.focus();
    onDepthChange(nextDepth);
    return true;
  };

  const handlePointerDownCapture = (
    event: PointerEvent<HTMLInputElement>,
  ) => {
    if (
      disabled
      || event.isPrimary === false
      || event.button > 0
    ) {
      return;
    }

    if (applyTrackClick(event.currentTarget, event.clientX)) {
      suppressNextTouchStartRef.current = event.pointerType === 'touch';
      event.preventDefault();
    }
  };
  const sliderStyle: CSSProperties & {
    '--semantic-depth-thumb-size': string;
  } = {
    ...style,
    '--semantic-depth-thumb-size': `${THUMB_SIZE}px`,
  };

  return (
    <input
      {...inputProps}
      className={[
        'semantic-depth-slider',
        className,
      ].filter(Boolean).join(' ')}
      style={sliderStyle}
      ref={inputRef}
      type="range"
      min={1}
      max={max}
      step={1}
      value={value}
      disabled={disabled}
      onChange={(event) => onDepthChange(Number(event.target.value))}
      onPointerDownCapture={handlePointerDownCapture}
    />
  );
}
