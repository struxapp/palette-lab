import type { Oklch } from './color';

export interface Roles {
  ink: number;
  paper: number;
  primary: number;
  accent: number;
  soft: number;
}

/**
 * Gives each palette slot a job in the live preview: the darkest colour becomes text ("ink"),
 * the lightest the page ("paper"), and the most colourful of the rest the primary action.
 */
export function assignRoles(colors: readonly Oklch[]): Roles {
  const byLightness = colors.map((_, i) => i).sort((a, b) => colors[a].l - colors[b].l);
  const ink = byLightness[0];
  const paper = byLightness[byLightness.length - 1];
  const middle = byLightness.slice(1, -1).sort((a, b) => colors[b].c - colors[a].c);
  const [primary, accent, soft] = middle;
  return { ink, paper, primary, accent, soft };
}
