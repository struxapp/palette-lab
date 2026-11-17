import { describe, expect, it } from 'vitest';
import { inGamut, oklchToRgb, type Oklch } from '../src/color';
import { DEFAULT_PALETTE, HARMONIES, generatePalette, mulberry32 } from '../src/generate';

const free = [null, null, null, null, null];
const hueGap = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

describe('generatePalette', () => {
  it('is reproducible for the same seed', () => {
    const a = generatePalette(free, 'triadic', mulberry32(42));
    const b = generatePalette(free, 'triadic', mulberry32(42));
    expect(a).toEqual(b);
  });

  it('always returns five in-gamut colours ordered from dark to light', () => {
    for (const harmony of HARMONIES) {
      for (let seed = 1; seed <= 40; seed += 1) {
        const palette = generatePalette(free, harmony, mulberry32(seed));
        expect(palette).toHaveLength(5);
        for (const color of palette) expect(inGamut(oklchToRgb(color))).toBe(true);
        expect(palette[0].l).toBeLessThan(palette[2].l);
        expect(palette[2].l).toBeLessThan(palette[4].l);
      }
    }
  });

  it('keeps locked colours exactly and harmonises around them', () => {
    const anchor: Oklch = { l: 0.55, c: 0.15, h: 200 };
    const locked = [null, null, anchor, null, null];
    const palette = generatePalette(locked, 'complementary', mulberry32(7));
    expect(palette[2]).toEqual(anchor);
    // Complementary puts the anchor's slot on the opposite hue of the base, so slot 0 sits ~180 degrees away.
    expect(hueGap(palette[0].h, anchor.h)).toBeGreaterThan(170);
  });

  it('keeps monochrome palettes on one hue', () => {
    const palette = generatePalette(free, 'monochrome', mulberry32(3));
    for (const color of palette) expect(hueGap(color.h, palette[0].h)).toBeLessThanOrEqual(8);
  });

  it('spaces triadic accents about 120 degrees apart', () => {
    const palette = generatePalette(free, 'triadic', mulberry32(11));
    expect(hueGap(palette[2].h, palette[0].h)).toBeGreaterThan(105);
    expect(hueGap(palette[3].h, palette[2].h)).toBeGreaterThan(105);
  });

  it('starts from a valid default palette', () => {
    for (const color of DEFAULT_PALETTE) expect(inGamut(oklchToRgb(color))).toBe(true);
  });
});
