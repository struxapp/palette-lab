import { formatOklch, oklchToRgb, oklchToHex, to255, toGamut, type Oklch } from './color';

export type ExportFormat = 'css' | 'json' | 'tailwind' | 'tailwind4';

export const EXPORT_LABELS: Record<ExportFormat, string> = {
  css: 'CSS variables',
  json: 'JSON',
  tailwind: 'Tailwind config',
  tailwind4: 'Tailwind v4 @theme',
};

const round = (n: number, digits: number): number => Number(n.toFixed(digits));

export function exportPalette(colors: readonly Oklch[], format: ExportFormat): string {
  const mapped = colors.map((c) => toGamut(c));
  const hexes = mapped.map((c) => oklchToHex(c));
  switch (format) {
    case 'css':
      return [':root {', ...hexes.map((hex, i) => `  --palette-${i + 1}: ${hex}; /* ${formatOklch(mapped[i])} */`), '}'].join(
        '\n',
      );
    case 'json':
      return JSON.stringify(
        {
          palette: mapped.map((c, i) => ({
            hex: hexes[i],
            rgb: to255(oklchToRgb(c)),
            oklch: [round(c.l, 4), round(c.c, 4), round(c.h, 2)],
          })),
        },
        null,
        2,
      );
    case 'tailwind':
      return [
        "/** @type {import('tailwindcss').Config} */",
        'export default {',
        '  theme: {',
        '    extend: {',
        '      colors: {',
        '        palette: {',
        ...hexes.map((hex, i) => `          ${i + 1}: '${hex}',`),
        '        },',
        '      },',
        '    },',
        '  },',
        '};',
      ].join('\n');
    case 'tailwind4':
      return ['@theme {', ...mapped.map((c, i) => `  --color-palette-${i + 1}: ${formatOklch(c)};`), '}'].join('\n');
  }
}
