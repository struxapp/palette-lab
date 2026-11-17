/**
 * Colour science for Palette Lab: sRGB, OKLab and OKLCH conversions, gamut mapping and WCAG 2 contrast.
 * OKLab matrices are Björn Ottosson's published reference values (https://bottosson.github.io/posts/oklab/).
 */

/** sRGB colour with channels in 0..1 (may fall outside that range before gamut mapping). */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Oklab {
  l: number;
  a: number;
  b: number;
}

/** OKLCH colour: lightness 0..1, chroma 0..~0.4, hue in degrees 0..360. */
export interface Oklch {
  l: number;
  c: number;
  h: number;
}

export const MAX_CHROMA = 0.37;

export function srgbToLinear(channel: number): number {
  const abs = Math.abs(channel);
  const sign = channel < 0 ? -1 : 1;
  return abs <= 0.04045 ? channel / 12.92 : sign * ((abs + 0.055) / 1.055) ** 2.4;
}

export function linearToSrgb(channel: number): number {
  const abs = Math.abs(channel);
  const sign = channel < 0 ? -1 : 1;
  return abs <= 0.0031308 ? channel * 12.92 : sign * (1.055 * abs ** (1 / 2.4) - 0.055);
}

export function rgbToOklab({ r, g, b }: Rgb): Oklab {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

export function oklabToRgb({ l: L, a, b }: Oklab): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return {
    r: linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  };
}

export function normalizeHue(h: number): number {
  const wrapped = h % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

export function oklabToOklch({ l, a, b }: Oklab): Oklch {
  const c = Math.hypot(a, b);
  const h = c < 1e-4 ? 0 : normalizeHue((Math.atan2(b, a) * 180) / Math.PI);
  return { l, c, h };
}

export function oklchToOklab({ l, c, h }: Oklch): Oklab {
  const rad = (h * Math.PI) / 180;
  return { l, a: c * Math.cos(rad), b: c * Math.sin(rad) };
}

export function rgbToOklch(rgb: Rgb): Oklch {
  return oklabToOklch(rgbToOklab(rgb));
}

/** Raw conversion: the result may be outside the sRGB gamut. */
export function oklchToRgb(lch: Oklch): Rgb {
  return oklabToRgb(oklchToOklab(lch));
}

export function inGamut({ r, g, b }: Rgb, epsilon = 1e-4): boolean {
  return (
    r >= -epsilon && r <= 1 + epsilon && g >= -epsilon && g <= 1 + epsilon && b >= -epsilon && b <= 1 + epsilon
  );
}

/** The largest chroma that stays inside sRGB for a lightness and hue (binary search). */
export function maxChromaFor(l: number, h: number): number {
  if (l <= 0 || l >= 1) return 0;
  let lo = 0;
  let hi = MAX_CHROMA + 0.03;
  for (let i = 0; i < 22; i += 1) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToRgb({ l, c: mid, h }))) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Maps a colour into sRGB by reducing chroma while keeping lightness and hue. */
export function toGamut(lch: Oklch): Oklch {
  const l = Math.min(1, Math.max(0, lch.l));
  const h = normalizeHue(lch.h);
  const c = Math.max(0, lch.c);
  if (inGamut(oklchToRgb({ l, c, h }))) return { l, c, h };
  return { l, c: maxChromaFor(l, h), h };
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

export function clampRgb({ r, g, b }: Rgb): Rgb {
  return { r: clamp01(r), g: clamp01(g), b: clamp01(b) };
}

export function to255(rgb: Rgb): [number, number, number] {
  const c = clampRgb(rgb);
  return [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)];
}

export function rgbToHex(rgb: Rgb): string {
  return `#${to255(rgb)
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('')}`;
}

/** Parses #rgb, #rrggbb (with or without #). Returns null when the text is not a hex colour. */
export function hexToRgb(hex: string): Rgb | null {
  let text = hex.trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(text)) {
    text = text
      .split('')
      .map((ch) => ch + ch)
      .join('');
  }
  if (!/^[0-9a-f]{6}$/.test(text)) return null;
  const n = Number.parseInt(text, 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

export function hexToOklch(hex: string): Oklch | null {
  const rgb = hexToRgb(hex);
  return rgb ? rgbToOklch(rgb) : null;
}

/** The displayable hex for an OKLCH colour (gamut-mapped first). */
export function oklchToHex(lch: Oklch): string {
  return rgbToHex(oklchToRgb(toGamut(lch)));
}

/** WCAG 2 relative luminance of an sRGB colour. */
export function relativeLuminance(rgb: Rgb): number {
  const c = clampRgb(rgb);
  return 0.2126 * srgbToLinear(c.r) + 0.7152 * srgbToLinear(c.g) + 0.0722 * srgbToLinear(c.b);
}

/** WCAG 2 contrast ratio, from 1 to 21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export interface WcagResult {
  aaNormal: boolean;
  aaLarge: boolean;
  aaaNormal: boolean;
  aaaLarge: boolean;
}

export function wcagLevels(ratio: number): WcagResult {
  // WCAG compares the unrounded ratio; 4.499 fails AA.
  return { aaNormal: ratio >= 4.5, aaLarge: ratio >= 3, aaaNormal: ratio >= 7, aaaLarge: ratio >= 4.5 };
}

/** Black or white, whichever reads better on the colour. */
export function readableOn(rgb: Rgb): '#000000' | '#ffffff' {
  const white = contrastRatio(rgb, { r: 1, g: 1, b: 1 });
  const black = contrastRatio(rgb, { r: 0, g: 0, b: 0 });
  return black >= white ? '#000000' : '#ffffff';
}

const trim = (n: number, digits: number): string => {
  const fixed = n.toFixed(digits);
  return fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed;
};

export function formatOklch({ l, c, h }: Oklch): string {
  return `oklch(${trim(l * 100, 1)}% ${trim(c, 3)} ${trim(c < 1e-4 ? 0 : h, 1)})`;
}

export function formatRgb(rgb: Rgb): string {
  const [r, g, b] = to255(rgb);
  return `rgb(${r} ${g} ${b})`;
}
