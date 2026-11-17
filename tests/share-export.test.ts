import { describe, expect, it } from 'vitest';
import { hexToOklch, oklchToHex } from '../src/color';
import { exportPalette } from '../src/export';
import { decodeHash, encodeHash } from '../src/share';

const hexes = ['#1f2a44', '#7a2e6b', '#e8735a', '#f6c48a', '#fbf4e6'];
const colors = hexes.map((h) => hexToOklch(h)!);

describe('URL hash', () => {
  it('round-trips colours, locks and harmony', () => {
    const hash = encodeHash({ colors, locks: [true, false, false, true, false], harmony: 'triadic' });
    expect(hash).toBe('c=1f2a44-7a2e6b-e8735a-f6c48a-fbf4e6&h=triadic&lock=10010');
    const decoded = decodeHash(`#${hash}`);
    expect(decoded?.colors.map(oklchToHex)).toEqual(hexes);
    expect(decoded?.locks).toEqual([true, false, false, true, false]);
    expect(decoded?.harmony).toBe('triadic');
  });

  it('rejects broken hashes and falls back to auto harmony', () => {
    expect(decodeHash('#c=zzzzzz-000000-000000-000000-000000')).toBeNull();
    expect(decodeHash('#c=000000-ffffff')).toBeNull();
    expect(decodeHash('')).toBeNull();
    expect(decodeHash('#c=000000-111111-222222-333333-444444&h=nonsense')?.harmony).toBe('auto');
  });
});

describe('exports', () => {
  it('writes CSS custom properties', () => {
    const css = exportPalette(colors, 'css');
    expect(css.startsWith(':root {')).toBe(true);
    expect(css).toContain('--palette-1: #1f2a44;');
    expect(css).toContain('--palette-5: #fbf4e6;');
  });

  it('writes JSON with hex, rgb and oklch', () => {
    const data = JSON.parse(exportPalette(colors, 'json'));
    expect(data.palette).toHaveLength(5);
    expect(data.palette[0].hex).toBe('#1f2a44');
    expect(data.palette[0].rgb).toEqual([31, 42, 68]);
    expect(data.palette[0].oklch).toHaveLength(3);
  });

  it('writes Tailwind config and v4 theme blocks', () => {
    expect(exportPalette(colors, 'tailwind')).toContain("3: '#e8735a',");
    expect(exportPalette(colors, 'tailwind4')).toMatch(/--color-palette-1: oklch\([\d.]+% [\d.]+ [\d.]+\);/);
  });
});

import { assignRoles } from '../src/roles';

describe('preview roles', () => {
  it('uses the darkest colour as ink, the lightest as paper and the most colourful middle tone as primary', () => {
    const roles = assignRoles(colors);
    expect(roles.ink).toBe(0);
    expect(roles.paper).toBe(4);
    expect(roles.primary).toBe(2);
    expect(new Set(Object.values(roles)).size).toBe(5);
  });
});
