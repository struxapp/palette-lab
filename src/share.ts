import { hexToOklch, oklchToHex, type Oklch } from './color';
import { HARMONIES, PALETTE_SIZE, type Harmony } from './generate';

export type HarmonyChoice = Harmony | 'auto';

export interface SharedState {
  colors: Oklch[];
  locks: boolean[];
  harmony: HarmonyChoice;
}

/** Encodes the palette as `c=1f2a44-…&h=analogous&lock=01000` for the URL hash. */
export function encodeHash(state: SharedState): string {
  const params = new URLSearchParams();
  params.set('c', state.colors.map((c) => oklchToHex(c).slice(1)).join('-'));
  params.set('h', state.harmony);
  if (state.locks.some(Boolean)) params.set('lock', state.locks.map((l) => (l ? '1' : '0')).join(''));
  return params.toString();
}

/** Reads a hash produced by encodeHash. Returns null when it does not hold a valid palette. */
export function decodeHash(hash: string): SharedState | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const raw = params.get('c');
  if (!raw) return null;
  const parts = raw.split('-');
  if (parts.length !== PALETTE_SIZE) return null;
  const colors: Oklch[] = [];
  for (const part of parts) {
    const lch = hexToOklch(part);
    if (!lch) return null;
    colors.push(lch);
  }
  const h = params.get('h');
  const harmony: HarmonyChoice = h === 'auto' || (HARMONIES as readonly string[]).includes(h ?? '') ? (h as HarmonyChoice) : 'auto';
  const lockText = params.get('lock') ?? '';
  const locks = colors.map((_, i) => lockText[i] === '1');
  return { colors, locks, harmony };
}
