import { describe, it, expect } from 'vitest';
import { contrastRatio, AA_NORMAL_TEXT, AA_NON_TEXT, composite, parseColor } from './contrast';
import { THEMES, getThemeTokens } from './themeTokens';
import { EMBED_THEMES } from '../components/embedTheme';

// Microsoft's accessibility bar is WCAG 2.1 Level AA. This suite enforces the
// contrast contract for every theme so a new theme — or a tweak to an existing
// one — cannot ship a combination that fails to meet:
//   * SC 1.4.3 Contrast (Minimum): 4.5:1 for normal text.
//   * SC 1.4.11 Non-text Contrast: 3:1 for graphical objects (graph edges).
//
// Foreground/background are CSS custom-property names resolved from app.css.

type Kind = 'text' | 'non-text';

interface Pair {
  name: string;
  fg: string;
  bg: string;
  kind: Kind;
}

const PAIRS: Pair[] = [
  { name: 'primary text on app background', fg: '--text-primary', bg: '--bg-primary', kind: 'text' },
  { name: 'primary text on panel', fg: '--text-primary', bg: '--bg-secondary', kind: 'text' },
  { name: 'secondary text on app background', fg: '--text-secondary', bg: '--bg-primary', kind: 'text' },
  { name: 'secondary text on panel', fg: '--text-secondary', bg: '--bg-secondary', kind: 'text' },
  { name: 'secondary text on elevated surface', fg: '--text-secondary', bg: '--bg-elevated', kind: 'text' },
  { name: 'muted text on app background', fg: '--text-tertiary', bg: '--bg-primary', kind: 'text' },
  { name: 'muted text on panel', fg: '--text-tertiary', bg: '--bg-secondary', kind: 'text' },
  { name: 'about link on app background', fg: '--about-link-color', bg: '--bg-primary', kind: 'text' },
  { name: 'button label on accent', fg: '--on-accent', bg: '--ms-blue', kind: 'text' },
  { name: 'graph node label on canvas', fg: '--graph-node-text', bg: '--graph-bg', kind: 'text' },
  { name: 'graph edge label on chip', fg: '--graph-edge-text', bg: '--graph-edge-label-bg', kind: 'text' },
  { name: 'graph edge line on canvas', fg: '--graph-edge-color', bg: '--graph-bg', kind: 'non-text' },
];

const minimumFor = (kind: Kind): number => (kind === 'text' ? AA_NORMAL_TEXT : AA_NON_TEXT);

describe('WCAG 2.1 AA theme contrast (SC 1.4.3 / 1.4.11)', () => {
  for (const theme of THEMES) {
    const tokens = getThemeTokens(theme);

    describe(theme, () => {
      for (const pair of PAIRS) {
        const minimum = minimumFor(pair.kind);
        it(`${pair.name} meets ${minimum}:1`, () => {
          const fg = tokens[pair.fg];
          const bg = tokens[pair.bg];
          expect(fg, `theme "${theme}" is missing token ${pair.fg}`).toBeTruthy();
          expect(bg, `theme "${theme}" is missing token ${pair.bg}`).toBeTruthy();

          const ratio = contrastRatio(fg, bg);
          expect(
            ratio,
            `${theme}: ${pair.name} — ${pair.fg} (${fg}) on ${pair.bg} (${bg}) = ` +
              `${ratio.toFixed(2)}:1, needs >= ${minimum}:1`,
          ).toBeGreaterThanOrEqual(minimum);
        });
      }
    });
  }
});

describe('WCAG 2.1 AA embed graph contrast', () => {
  for (const [themeName, tokens] of Object.entries(EMBED_THEMES)) {
    it(`${themeName} graph labels and lines meet contrast minimums`, () => {
      expect(
        contrastRatio(tokens.nodeText, tokens.bg),
        `${themeName} embed node label contrast`,
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      expect(
        contrastRatio(tokens.edgeText, tokens.edgeLabelBg),
        `${themeName} embed edge label contrast`,
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      expect(
        contrastRatio(tokens.text, tokens.edgeLabelBg),
        `${themeName} embed active edge label contrast`,
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      expect(
        contrastRatio(tokens.edgeColor, tokens.bg),
        `${themeName} embed edge line contrast`,
      ).toBeGreaterThanOrEqual(AA_NON_TEXT);
      expect(
        contrastRatio(tokens.accent, tokens.bg),
        `${themeName} embed active edge line contrast`,
      ).toBeGreaterThanOrEqual(AA_NON_TEXT);
    });
  }
});

// ── Stat-card metric tiles (OntologyStatsPanel) ──────────────────────────────
// Each colored tile lays a translucent tint over the sidebar (--bg-secondary).
// The icon (graphical object, SC 1.4.11) and the 22px-bold value (large text,
// SC 1.4.3) share a per-theme accent token and must clear 3:1 against the
// *composited* tile background — guarding against a re-introduced opacity fade
// or an off-contrast token in any current or future theme.
const STAT_TILES = ['blue', 'purple', 'green'] as const;

const STAT_TILE_TINT: Record<(typeof STAT_TILES)[number], string> = {
  blue: 'rgba(0, 120, 212, 0.12)',
  purple: 'rgba(92, 45, 145, 0.12)',
  green: 'rgba(16, 124, 16, 0.12)',
};

const STAT_TILE_FG: Record<(typeof STAT_TILES)[number], string> = {
  blue: '--stat-blue',
  purple: '--stat-purple',
  green: '--stat-green',
};

function flatten(tint: string, baseHex: string): string {
  const { r, g, b } = composite(parseColor(tint), parseColor(baseHex));
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

describe('WCAG 2.1 AA stat-card tiles (SC 1.4.11 / 1.4.3)', () => {
  for (const theme of THEMES) {
    const tokens = getThemeTokens(theme);

    describe(theme, () => {
      const sidebar = tokens['--bg-secondary'];

      for (const tile of STAT_TILES) {
        it(`${tile} tile icon & value meet ${AA_NON_TEXT}:1`, () => {
          const fg = tokens[STAT_TILE_FG[tile]];
          expect(fg, `theme "${theme}" is missing token ${STAT_TILE_FG[tile]}`).toBeTruthy();
          expect(sidebar, `theme "${theme}" is missing token --bg-secondary`).toBeTruthy();

          const tileBg = flatten(STAT_TILE_TINT[tile], sidebar);
          const ratio = contrastRatio(fg, tileBg);
          expect(
            ratio,
            `${theme}: ${tile} stat tile — ${STAT_TILE_FG[tile]} (${fg}) on composited ` +
              `${tileBg} = ${ratio.toFixed(2)}:1, needs >= ${AA_NON_TEXT}:1`,
          ).toBeGreaterThanOrEqual(AA_NON_TEXT);
        });
      }
    });
  }
});

// ── Amber foreground token (--ms-yellow-fg) ──────────────────────────────────
// #FFB900 reads on the dark themes but fails on light surfaces (~1.7:1), so the
// light themes override it to a darker gold. It colors text + icons: header
// points/badges (.stat-value), quest points, the pathfinder warning message,
// and the active designer ID toggle. Guard it as normal text (4.5:1) against
// every surface it lands on, including the translucent amber warn tile.
const WARN_TINT = 'rgba(255, 185, 0, 0.1)'; // .pathfinder-message--warn / .designer-id-btn.active

describe('WCAG 2.1 AA amber foreground (SC 1.4.3)', () => {
  for (const theme of THEMES) {
    const tokens = getThemeTokens(theme);

    describe(theme, () => {
      const fg = tokens['--ms-yellow-fg'];
      const surfaces: { name: string; bg: string }[] = [
        { name: 'panel', bg: tokens['--bg-secondary'] },
        { name: 'elevated surface', bg: tokens['--bg-elevated'] },
        { name: 'app background', bg: tokens['--bg-primary'] },
        { name: 'warn tile', bg: flatten(WARN_TINT, tokens['--bg-secondary']) },
      ];

      for (const s of surfaces) {
        it(`amber text on ${s.name} meets ${AA_NORMAL_TEXT}:1`, () => {
          expect(fg, `theme "${theme}" is missing token --ms-yellow-fg`).toBeTruthy();
          expect(s.bg, `theme "${theme}" is missing a surface token`).toBeTruthy();

          const ratio = contrastRatio(fg, s.bg);
          expect(
            ratio,
            `${theme}: amber text — --ms-yellow-fg (${fg}) on ${s.name} (${s.bg}) = ` +
              `${ratio.toFixed(2)}:1, needs >= ${AA_NORMAL_TEXT}:1`,
          ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
        });
      }
    });
  }
});

// ── Progress-bar fill vs track (SC 1.4.11) ───────────────────────────────────
// .progress-fill paints a gradient between --progress-from and --progress-to
// over the --bg-tertiary track. Both stops must clear 3:1 against the track so
// the filled portion stays distinguishable (the mid-tone accent + purple failed
// on the dark themes before these stops were split per theme).
const PROGRESS_STOPS = ['--progress-from', '--progress-to'] as const;

describe('WCAG 2.1 AA progress-bar fill (SC 1.4.11)', () => {
  for (const theme of THEMES) {
    const tokens = getThemeTokens(theme);

    describe(theme, () => {
      const track = tokens['--bg-tertiary'];

      for (const stop of PROGRESS_STOPS) {
        it(`${stop} on track meets ${AA_NON_TEXT}:1`, () => {
          const fg = tokens[stop];
          expect(fg, `theme "${theme}" is missing token ${stop}`).toBeTruthy();
          expect(track, `theme "${theme}" is missing token --bg-tertiary`).toBeTruthy();

          const ratio = contrastRatio(fg, track);
          expect(
            ratio,
            `${theme}: progress fill — ${stop} (${fg}) on --bg-tertiary (${track}) = ` +
              `${ratio.toFixed(2)}:1, needs >= ${AA_NON_TEXT}:1`,
          ).toBeGreaterThanOrEqual(AA_NON_TEXT);
        });
      }
    });
  }
});
