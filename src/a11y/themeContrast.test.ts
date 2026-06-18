import { describe, it, expect } from 'vitest';
import { contrastRatio, AA_NORMAL_TEXT, AA_NON_TEXT } from './contrast';
import { THEMES, getThemeTokens } from './themeTokens';

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
