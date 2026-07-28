/**
 * Font stacks for canvas-rendered graphs.
 *
 * Cytoscape draws to a canvas, so it can't read the --font-primary CSS custom
 * property the rest of the app uses — the stack has to be handed to it as a
 * string.  Keep this in sync with `--font-primary` in src/styles/app.css.
 *
 * The Korean faces come after the Latin ones deliberately: font fallback is
 * per-glyph, so Latin labels still render in Segoe UI while Hangul falls
 * through to a face that has the glyphs.  Without them, Korean node labels
 * render as tofu boxes on systems where Segoe UI is the only match.
 */
export const GRAPH_FONT_FAMILY =
  "Segoe UI, Malgun Gothic, Apple SD Gothic Neo, Noto Sans KR, sans-serif";

/** Same stack, quoted for use in a CSS `font:` shorthand. */
export const GRAPH_FONT_FAMILY_CSS =
  "'Segoe UI','Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',sans-serif";
