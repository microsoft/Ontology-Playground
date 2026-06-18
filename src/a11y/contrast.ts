// WCAG 2.1 color-contrast utilities (Success Criteria 1.4.3 and 1.4.11).
//
// Pure and dependency-free so it can run in the unit-test suite and be reused
// by tooling. Implements the relative-luminance and contrast-ratio formulas
// exactly as defined by WCAG, including the rule that the published thresholds
// are floors that must not be rounded (4.499:1 does NOT meet 4.5:1).

export interface RGB {
  /** 0–255 */ r: number;
  /** 0–255 */ g: number;
  /** 0–255 */ b: number;
}

export interface RGBA extends RGB {
  /** 0–1 */ a: number;
}

/** SC 1.4.3 — normal text. */
export const AA_NORMAL_TEXT = 4.5;
/** SC 1.4.3 — large text (>= 24px, or >= 18.66px bold). */
export const AA_LARGE_TEXT = 3;
/** SC 1.4.11 — UI components and graphical objects. */
export const AA_NON_TEXT = 3;

const HEX3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const HEX6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const HEX8 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const RGB_FN =
  /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i;

/** Parse a CSS hex (`#rgb`, `#rrggbb`, `#rrggbbaa`) or rgb()/rgba() color. */
export function parseColor(input: string): RGBA {
  const s = input.trim();

  let m = HEX8.exec(s);
  if (m) {
    return {
      r: parseInt(m[1], 16),
      g: parseInt(m[2], 16),
      b: parseInt(m[3], 16),
      a: parseInt(m[4], 16) / 255,
    };
  }
  m = HEX6.exec(s);
  if (m) {
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16), a: 1 };
  }
  m = HEX3.exec(s);
  if (m) {
    return {
      r: parseInt(m[1] + m[1], 16),
      g: parseInt(m[2] + m[2], 16),
      b: parseInt(m[3] + m[3], 16),
      a: 1,
    };
  }
  m = RGB_FN.exec(s);
  if (m) {
    const rawAlpha = m[4];
    const a =
      rawAlpha == null ? 1 : rawAlpha.endsWith('%') ? parseFloat(rawAlpha) / 100 : parseFloat(rawAlpha);
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a };
  }

  throw new Error(`Unsupported color format: "${input}"`);
}

/** Flatten a (possibly translucent) foreground over an opaque background. */
export function composite(fg: RGBA, bg: RGB): RGB {
  const a = fg.a;
  return {
    r: Math.round(fg.r * a + bg.r * (1 - a)),
    g: Math.round(fg.g * a + bg.g * (1 - a)),
    b: Math.round(fg.b * a + bg.b * (1 - a)),
  };
}

function channelLuminance(channel8bit: number): number {
  const c = channel8bit / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance of an opaque color. */
export function relativeLuminance(rgb: RGB): number {
  return (
    0.2126 * channelLuminance(rgb.r) +
    0.7152 * channelLuminance(rgb.g) +
    0.0722 * channelLuminance(rgb.b)
  );
}

/**
 * WCAG contrast ratio between a foreground and background color. A translucent
 * foreground is composited over the (opaque) background first. The background
 * must be opaque, because contrast against an unknown surface is undefined.
 */
export function contrastRatio(foreground: string, background: string): number {
  const bg = parseColor(background);
  if (bg.a < 1) {
    throw new Error(`Background color must be opaque to measure contrast: "${background}"`);
  }
  const fg = parseColor(foreground);
  const fgOpaque: RGB = fg.a < 1 ? composite(fg, bg) : fg;

  const l1 = relativeLuminance(fgOpaque);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** True when the pair meets `minimum`. Thresholds are floors (not rounded). */
export function meetsContrast(foreground: string, background: string, minimum: number): boolean {
  return contrastRatio(foreground, background) >= minimum;
}
