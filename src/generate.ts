import { normalizeHue, toGamut, type Oklch } from './color';

export type Harmony = 'analogous' | 'complementary' | 'triadic' | 'split' | 'monochrome';

export const HARMONIES: readonly Harmony[] = ['analogous', 'complementary', 'triadic', 'split', 'monochrome'];

export const HARMONY_LABELS: Record<Harmony, string> = {
  analogous: 'Analogous',
  complementary: 'Complementary',
  triadic: 'Triadic',
  split: 'Split complementary',
  monochrome: 'Monochrome',
};

export const PALETTE_SIZE = 5;

/** Small, fast, seedable PRNG (mulberry32) so generation is reproducible in tests. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Hue offsets from the base hue, slot by slot. Slots run from darkest to lightest, so the
 * contrasting hues sit in the middle where chroma is highest and they read as accents.
 */
export function hueOffsets(harmony: Harmony, spread: number): number[] {
  switch (harmony) {
    case 'analogous':
      return [-2, -1, 0, 1, 2].map((step) => step * spread);
    case 'complementary':
      return [0, 0, 180, 180, 0];
    case 'triadic':
      return [0, 0, 120, 240, 0];
    case 'split':
      return [0, 0, 150, 210, 0];
    case 'monochrome':
      return [0, 0, 0, 0, 0];
  }
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Generates a five-colour palette. `locked` holds the colours to keep (null = free slot).
 * The base hue follows the first chromatic locked colour so new colours harmonise with it.
 */
export function generatePalette(locked: readonly (Oklch | null)[], harmony: Harmony, rand: () => number): Oklch[] {
  const spread = 14 + rand() * 14;
  const offsets = hueOffsets(harmony, rand() < 0.5 ? spread : -spread);

  let base = rand() * 360;
  const anchorIndex = locked.findIndex((c) => c !== null && c.c > 0.03);
  if (anchorIndex >= 0) {
    const anchor = locked[anchorIndex] as Oklch;
    base = anchor.h - offsets[anchorIndex];
  }

  // Lightness ramp from a deep shade to a soft tint, with a little jitter.
  const darkest = 0.2 + rand() * 0.1;
  const lightest = 0.93 + rand() * 0.04;
  const vivid = harmony === 'monochrome' ? 0.07 + rand() * 0.06 : 0.1 + rand() * 0.07;

  const out: Oklch[] = [];
  for (let i = 0; i < PALETTE_SIZE; i += 1) {
    const kept = locked[i];
    if (kept) {
      out.push({ ...kept });
      continue;
    }
    const t = i / (PALETTE_SIZE - 1);
    const l = Math.min(0.98, Math.max(0.12, lerp(darkest, lightest, t) + (rand() - 0.5) * 0.04));
    // Chroma peaks in the middle tones; deep shades and pale tints stay calmer.
    const bell = Math.sin(Math.PI * Math.min(1, Math.max(0, (l - 0.1) / 0.9)));
    const raw = vivid * (0.12 + 0.88 * bell ** 1.6) * (0.85 + rand() * 0.3);
    // The deepest shade works as "ink": keep it rich but never neon.
    const c = i === 0 ? Math.min(raw, 0.065) : raw;
    const jitter = harmony === 'monochrome' ? (rand() - 0.5) * 8 : (rand() - 0.5) * 10;
    const h = normalizeHue(base + offsets[i] + jitter);
    out.push(toGamut({ l, c, h }));
  }
  return out;
}

/** The first-load palette: ink, plum, coral, apricot and cream (a warm dusk). */
export const DEFAULT_PALETTE: readonly Oklch[] = [
  { l: 0.27, c: 0.055, h: 275 },
  { l: 0.46, c: 0.12, h: 335 },
  { l: 0.68, c: 0.155, h: 30 },
  { l: 0.83, c: 0.11, h: 68 },
  { l: 0.965, c: 0.024, h: 85 },
];

export function pickHarmony(rand: () => number): Harmony {
  return HARMONIES[Math.floor(rand() * HARMONIES.length) % HARMONIES.length];
}
