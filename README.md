# Palette Lab

Palette Lab generates harmonious five-colour palettes in the OKLCH colour space and helps you turn them into
something you can ship.

- **Generate** a palette with <kbd>Space</kbd> or the Generate button. Pick a harmony (analogous, complementary,
  triadic, split complementary, monochrome) or leave it on Auto.
- **Lock** the colours you like; the next palettes are built around the first locked colour's hue.
- **Edit** any colour on a lightness × chroma plane at its hue, or with OKLCH sliders whose tracks show the real
  colours. Colours outside sRGB are mapped to the nearest displayable chroma, keeping lightness and hue.
- **Read** every colour as HEX, RGB and OKLCH, and copy any value.
- **Check contrast** between any two colours (or white and black) with the WCAG 2 ratio and AA/AAA badges for body
  and large text, plus a matrix of every pair.
- **Preview** the palette on a small example page: the darkest colour becomes text, the lightest the page, the most
  colourful of the rest the primary action.
- **Export** as CSS custom properties, JSON, a Tailwind config or a Tailwind v4 `@theme` block.
- **Share** the palette: the URL hash always holds the colours, the locks and the harmony.
- Undo and redo, light and dark themes, keyboard shortcuts (<kbd>1</kbd>–<kbd>5</kbd> select, <kbd>L</kbd> lock,
  <kbd>C</kbd> copy hex).

Everything runs in the browser. Nothing is sent anywhere; the only thing stored is your theme choice (localStorage).

## Run it

```sh
npm ci
npm run dev      # local development server
npm test         # unit tests (Vitest)
npm run build    # type-check and build to dist/
npm run preview  # serve dist/
```

Node 22 or newer.

## How it works

- `src/color.ts`: sRGB ⇄ linear ⇄ OKLab ⇄ OKLCH conversions, gamut mapping by chroma reduction, WCAG 2 relative
  luminance and contrast ratio.
- `src/generate.ts`: palette generation. Colours run from a deep shade to a pale tint; chroma peaks in the middle
  tones; hues follow the chosen harmony rule. A seeded PRNG keeps it testable.
- `src/share.ts`, `src/export.ts`: URL hash format and export formats.
- `tests/`: unit tests for the conversions, contrast, gamut mapping, generation, the hash and exports.

## Sources and licences

- OKLab conversion matrices: Björn Ottosson, "A perceptual color space for image processing" (2020), the same
  values used by the W3C CSS Color Module Level 4 specification.
- WCAG 2 contrast formula: W3C Web Content Accessibility Guidelines 2.2, success criteria 1.4.3 and 1.4.6.
- Fonts: Inter and Bricolage Grotesque, bundled through `@fontsource-variable` packages, SIL Open Font License 1.1.
- Icons: shapes adapted from Lucide (ISC licence).
- The example palette and the preview copy were written for this app.

## Licence

MIT, see [LICENSE](LICENSE).
