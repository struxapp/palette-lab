import './style.css';
import {
  MAX_CHROMA,
  contrastRatio,
  formatOklch,
  formatRgb,
  hexToOklch,
  hexToRgb,
  inGamut,
  maxChromaFor,
  oklchToHex,
  oklchToRgb,
  readableOn,
  toGamut,
  wcagLevels,
  type Oklch,
  type Rgb,
} from './color';
import { exportPalette, EXPORT_LABELS, type ExportFormat } from './export';
import { DEFAULT_PALETTE, HARMONY_LABELS, generatePalette, mulberry32, pickHarmony, type Harmony } from './generate';
import { icons, logo } from './icons';
import { assignRoles } from './roles';
import { decodeHash, encodeHash, type HarmonyChoice } from './share';
import { initTheme, type Theme } from './theme';

interface Snapshot {
  colors: Oklch[];
  locks: boolean[];
}

const state = {
  colors: DEFAULT_PALETTE.map((c) => ({ ...c })),
  locks: [false, false, false, false, false],
  harmony: 'auto' as HarmonyChoice,
  lastHarmony: null as Harmony | null,
  selected: 2,
  fg: 0,
  bg: 4,
  format: 'css' as ExportFormat,
};

const WHITE = 5;
const BLACK = 6;
const history: Snapshot[] = [];
let historyIndex = -1;

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
};

const els = {
  swatches: $<HTMLElement>('swatches'),
  harmony: $<HTMLSelectElement>('harmony'),
  harmonyNote: $<HTMLParagraphElement>('harmony-note'),
  generate: $<HTMLButtonElement>('generate'),
  undo: $<HTMLButtonElement>('undo'),
  redo: $<HTMLButtonElement>('redo'),
  share: $<HTMLButtonElement>('share'),
  theme: $<HTMLButtonElement>('theme'),
  plane: $<HTMLCanvasElement>('plane'),
  marker: $<HTMLSpanElement>('plane-marker'),
  sliderL: $<HTMLInputElement>('slider-l'),
  sliderC: $<HTMLInputElement>('slider-c'),
  sliderH: $<HTMLInputElement>('slider-h'),
  outL: $<HTMLOutputElement>('out-l'),
  outC: $<HTMLOutputElement>('out-c'),
  outH: $<HTMLOutputElement>('out-h'),
  gamutNote: $<HTMLParagraphElement>('gamut-note'),
  hexInput: $<HTMLInputElement>('hex-input'),
  hexError: $<HTMLParagraphElement>('hex-error'),
  rgbText: $<HTMLElement>('rgb-text'),
  oklchText: $<HTMLElement>('oklch-text'),
  editorChip: $<HTMLSpanElement>('editor-chip'),
  editorTitle: $<HTMLHeadingElement>('editor-title'),
  fg: $<HTMLSelectElement>('fg'),
  bg: $<HTMLSelectElement>('bg'),
  swap: $<HTMLButtonElement>('swap'),
  sample: $<HTMLDivElement>('sample'),
  ratio: $<HTMLSpanElement>('ratio-value'),
  badges: $<HTMLUListElement>('badges'),
  matrix: $<HTMLDivElement>('matrix'),
  mock: $<HTMLDivElement>('mock'),
  tabs: $<HTMLDivElement>('export-tabs'),
  code: $<HTMLElement>('export-code'),
  copyExport: $<HTMLButtonElement>('copy-export'),
  toast: $<HTMLDivElement>('toast'),
};

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/* ---------- helpers ---------- */

const hexOf = (i: number): string => (i === WHITE ? '#ffffff' : i === BLACK ? '#000000' : oklchToHex(state.colors[i]));
const rgbOf = (i: number): Rgb => hexToRgb(hexOf(i)) as Rgb;
const nameOf = (i: number): string => (i === WHITE ? 'White' : i === BLACK ? 'Black' : `Colour ${i + 1}`);

let toastTimer = 0;
function toast(message: string): void {
  els.toast.textContent = message;
  els.toast.classList.add('is-visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => els.toast.classList.remove('is-visible'), 1800);
}

async function copyText(text: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${label} copied`);
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    toast(ok ? `${label} copied` : 'Copying is blocked here: select the text and copy it');
  }
}

/* ---------- history ---------- */

function pushHistory(): void {
  history.splice(historyIndex + 1);
  history.push({ colors: state.colors.map((c) => ({ ...c })), locks: [...state.locks] });
  if (history.length > 100) history.shift();
  historyIndex = history.length - 1;
  updateHistoryButtons();
}

function restore(index: number): void {
  const snap = history[index];
  if (!snap) return;
  historyIndex = index;
  state.colors = snap.colors.map((c) => ({ ...c }));
  state.locks = [...snap.locks];
  renderAll();
  updateHistoryButtons();
}

function updateHistoryButtons(): void {
  els.undo.disabled = historyIndex <= 0;
  els.redo.disabled = historyIndex >= history.length - 1;
}

/* ---------- swatches ---------- */

interface SwatchView {
  root: HTMLDivElement;
  select: HTMLButtonElement;
  lock: HTMLButtonElement;
  copy: HTMLButtonElement;
  hex: HTMLSpanElement;
  oklch: HTMLSpanElement;
  rgb: HTMLSpanElement;
}

const swatchViews: SwatchView[] = state.colors.map((_, i) => {
  const root = document.createElement('div');
  root.className = 'swatch';
  root.innerHTML = `
    <button type="button" class="swatch-select"></button>
    <div class="swatch-tools">
      <button type="button" class="swatch-btn" data-act="lock"></button>
      <button type="button" class="swatch-btn" data-act="copy"></button>
    </div>
    <div class="swatch-info">
      <span class="swatch-index">${String(i + 1).padStart(2, '0')}</span>
      <span class="swatch-hex"></span>
      <span class="swatch-meta swatch-oklch"></span>
      <span class="swatch-meta swatch-rgb"></span>
    </div>
    <span class="swatch-editing" aria-hidden="true">${icons.pen}Editing</span>`;
  els.swatches.append(root);
  const q = <T extends HTMLElement>(sel: string): T => root.querySelector(sel) as T;
  const view: SwatchView = {
    root,
    select: q('.swatch-select'),
    lock: q('[data-act="lock"]'),
    copy: q('[data-act="copy"]'),
    hex: q('.swatch-hex'),
    oklch: q('.swatch-oklch'),
    rgb: q('.swatch-rgb'),
  };
  view.copy.innerHTML = icons.copy;
  view.select.addEventListener('click', () => {
    selectSwatch(i);
    revealEditor();
  });
  view.lock.addEventListener('click', () => toggleLock(i));
  view.copy.addEventListener('click', () => void copyText(hexOf(i), hexOf(i).toUpperCase()));
  return view;
});

// The palette opens on its own: no colour is marked as being edited until the person picks one or uses the editor.
els.swatches.classList.add('is-idle');
const wake = (): void => els.swatches.classList.remove('is-idle');
document.querySelector('.workbench')?.addEventListener('input', wake);
document.querySelector('.workbench')?.addEventListener('pointerdown', wake);

// On a wide window the palette fills the first screen and the editor follows it; a colour clicked brings the editor into
// view when it is below the window.
const editorPanel = document.querySelector<HTMLElement>('.panel.editor');
function revealEditor(always = false): void {
  if (!editorPanel || (!always && editorPanel.getBoundingClientRect().top < window.innerHeight - 120)) return;
  editorPanel.scrollIntoView({block: 'start', behavior: reducedMotion.matches ? 'auto' : 'smooth'});
}

// "Edit and check contrast" under the header takes the person to the editor, and keyboard focus with it.
document.getElementById('jump-editor')?.addEventListener('click', (event) => {
  event.preventDefault();
  revealEditor(true);
  const title = document.getElementById('editor-title');
  if (!title) return;
  title.tabIndex = -1;
  title.focus({preventScroll: true});
});

function renderSwatches(): void {
  state.colors.forEach((color, i) => {
    const v = swatchViews[i];
    const hex = oklchToHex(color);
    const rgb = hexToRgb(hex) as Rgb;
    const on = readableOn(rgb);
    v.root.style.setProperty('--sw', hex);
    v.root.style.setProperty('--on', on);
    v.root.classList.toggle('is-dark', on === '#ffffff');
    v.root.classList.toggle('is-selected', state.selected === i);
    v.root.classList.toggle('is-locked', state.locks[i]);
    v.hex.textContent = hex.slice(1).toUpperCase();
    v.oklch.textContent = formatOklch(toGamut(color));
    v.rgb.textContent = formatRgb(rgb);
    v.select.setAttribute('aria-label', `Edit colour ${i + 1}, ${hex.toUpperCase()}`);
    v.select.setAttribute('aria-pressed', String(state.selected === i));
    v.lock.innerHTML = state.locks[i] ? icons.lock : icons.unlock;
    v.lock.setAttribute('aria-label', `${state.locks[i] ? 'Unlock' : 'Lock'} colour ${i + 1}`);
    v.lock.setAttribute('aria-pressed', String(state.locks[i]));
    v.lock.title = state.locks[i] ? 'Unlock (L)' : 'Lock (L)';
    v.copy.setAttribute('aria-label', `Copy ${hex.toUpperCase()}`);
    v.copy.title = 'Copy hex (C)';
  });
}

function selectSwatch(i: number): void {
  wake();
  state.selected = i;
  renderSwatches();
  renderEditor(true);
}

function toggleLock(i: number): void {
  state.locks[i] = !state.locks[i];
  renderSwatches();
  syncHash();
  toast(state.locks[i] ? `Colour ${i + 1} locked` : `Colour ${i + 1} unlocked`);
}

/* ---------- generation ---------- */

function generate(): void {
  if (state.locks.every(Boolean)) {
    toast('Every colour is locked: unlock one to generate');
    return;
  }
  const harmony = state.harmony === 'auto' ? pickHarmony(Math.random) : state.harmony;
  const seed = Math.floor(Math.random() * 2 ** 32);
  const locked = state.colors.map((c, i) => (state.locks[i] ? c : null));
  state.colors = generatePalette(locked, harmony, mulberry32(seed));
  state.lastHarmony = harmony;
  pushHistory();
  renderAll();
  if (!reducedMotion.matches) {
    els.swatches.classList.remove('is-fresh');
    void els.swatches.offsetWidth;
    els.swatches.classList.add('is-fresh');
  }
}

function renderHarmonyNote(): void {
  els.harmonyNote.textContent = state.lastHarmony
    ? `${HARMONY_LABELS[state.lastHarmony]} palette`
    : 'Example palette · Dusk, five tones from ink to cream';
}

/* ---------- editor ---------- */

const planeCtx = els.plane.getContext('2d');
let planeHue = -1;

function drawPlane(h: number): void {
  if (!planeCtx) return;
  const { width, height } = els.plane;
  const image = planeCtx.createImageData(width, height);
  const data = image.data;
  for (let y = 0; y < height; y += 1) {
    const l = 1 - y / (height - 1);
    for (let x = 0; x < width; x += 1) {
      const c = (x / (width - 1)) * MAX_CHROMA;
      const rgb = oklchToRgb({ l, c, h });
      const o = (y * width + x) * 4;
      if (inGamut(rgb, 0.002)) {
        data[o] = Math.round(Math.min(1, Math.max(0, rgb.r)) * 255);
        data[o + 1] = Math.round(Math.min(1, Math.max(0, rgb.g)) * 255);
        data[o + 2] = Math.round(Math.min(1, Math.max(0, rgb.b)) * 255);
        data[o + 3] = 255;
      } else {
        data[o + 3] = 0;
      }
    }
  }
  planeCtx.putImageData(image, 0, 0);
  planeHue = h;
}

function trackGradient(make: (t: number) => Oklch, steps = 12): string {
  const stops: string[] = [];
  for (let i = 0; i <= steps; i += 1) stops.push(oklchToHex(make(i / steps)));
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

function renderEditor(syncInputs: boolean): void {
  const i = state.selected;
  const color = state.colors[i];
  const mapped = toGamut(color);
  const hex = oklchToHex(color);
  const rgb = hexToRgb(hex) as Rgb;

  els.editorTitle.textContent = `Edit colour ${i + 1}`;
  els.editorChip.textContent = hex.toUpperCase();
  els.editorChip.style.setProperty('--chip', hex);

  if (Math.abs(planeHue - color.h) > 0.01) drawPlane(color.h);
  els.marker.style.left = `${(Math.min(color.c, MAX_CHROMA) / MAX_CHROMA) * 100}%`;
  els.marker.style.top = `${(1 - color.l) * 100}%`;
  els.marker.style.background = hex;

  if (syncInputs) {
    els.sliderL.value = String(+(color.l * 100).toFixed(1));
    els.sliderC.value = String(+color.c.toFixed(3));
    els.sliderH.value = String(+color.h.toFixed(1));
    els.hexInput.value = hex.toUpperCase();
    els.hexInput.removeAttribute('aria-invalid');
    els.hexError.hidden = true;
  }
  els.outL.textContent = `${(color.l * 100).toFixed(1)}%`;
  els.outC.textContent = color.c.toFixed(3);
  els.outH.textContent = `${color.h.toFixed(1)}°`;
  els.sliderL.setAttribute('aria-valuetext', `${(color.l * 100).toFixed(1)} percent`);
  els.sliderH.setAttribute('aria-valuetext', `${color.h.toFixed(1)} degrees`);

  els.sliderL.style.setProperty('--track', trackGradient((t) => ({ l: t, c: color.c, h: color.h })));
  els.sliderC.style.setProperty('--track', trackGradient((t) => ({ l: color.l, c: t * MAX_CHROMA, h: color.h })));
  els.sliderH.style.setProperty('--track', trackGradient((t) => ({ l: color.l, c: color.c, h: t * 360 }), 18));

  els.gamutNote.hidden = mapped.c >= color.c - 1e-4;
  els.rgbText.textContent = formatRgb(rgb);
  els.oklchText.textContent = formatOklch(mapped);
}

function updateSelected(next: Oklch, syncInputs: boolean): void {
  state.colors[state.selected] = next;
  renderSwatches();
  renderEditor(syncInputs);
  renderContrast();
  renderPreview();
  renderExport();
  scheduleHash();
}

function sliderValues(): Oklch {
  return {
    l: Number(els.sliderL.value) / 100,
    c: Number(els.sliderC.value),
    h: Number(els.sliderH.value),
  };
}

for (const slider of [els.sliderL, els.sliderC, els.sliderH]) {
  slider.addEventListener('input', () => updateSelected(sliderValues(), false));
  slider.addEventListener('change', () => {
    els.hexInput.value = oklchToHex(state.colors[state.selected]).toUpperCase();
    pushHistory();
  });
}

function commitHex(): void {
  const parsed = hexToOklch(els.hexInput.value);
  if (!parsed) {
    els.hexInput.setAttribute('aria-invalid', 'true');
    els.hexError.hidden = false;
    return;
  }
  els.hexInput.removeAttribute('aria-invalid');
  els.hexError.hidden = true;
  updateSelected(parsed, true);
  pushHistory();
}

els.hexInput.addEventListener('change', commitHex);
els.hexInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') commitHex();
});

function pickFromPlane(event: PointerEvent): void {
  const rect = els.plane.getBoundingClientRect();
  const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
  const l = 1 - y;
  const h = state.colors[state.selected].h;
  const c = Math.min(x * MAX_CHROMA, maxChromaFor(l, h));
  updateSelected({ l, c, h }, true);
}

let dragging = false;
els.plane.addEventListener('pointerdown', (event) => {
  dragging = true;
  els.plane.setPointerCapture(event.pointerId);
  pickFromPlane(event);
});
els.plane.addEventListener('pointermove', (event) => {
  if (dragging) pickFromPlane(event);
});
const endDrag = (): void => {
  if (!dragging) return;
  dragging = false;
  pushHistory();
};
els.plane.addEventListener('pointerup', endDrag);
els.plane.addEventListener('pointercancel', endDrag);

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-copy]')) {
  button.innerHTML = icons.copy;
  button.addEventListener('click', () => {
    const color = state.colors[state.selected];
    const hex = oklchToHex(color);
    const kind = button.dataset.copy;
    if (kind === 'hex') void copyText(hex.toUpperCase(), 'HEX');
    else if (kind === 'rgb') void copyText(formatRgb(hexToRgb(hex) as Rgb), 'RGB');
    else void copyText(formatOklch(toGamut(color)), 'OKLCH');
  });
}

/* ---------- contrast ---------- */

function fillPairSelect(select: HTMLSelectElement, value: number): void {
  const options = [0, 1, 2, 3, 4, WHITE, BLACK].map((i) => {
    const label = i === WHITE ? 'White' : i === BLACK ? 'Black' : `${i + 1} · ${hexOf(i).slice(1).toUpperCase()}`;
    return `<option value="${i}">${label}</option>`;
  });
  select.innerHTML = options.join('');
  select.value = String(value);
}

const badgeDefs: { key: keyof ReturnType<typeof wcagLevels>; label: string; detail: string }[] = [
  { key: 'aaNormal', label: 'AA', detail: 'body text, 4.5:1' },
  { key: 'aaLarge', label: 'AA Large', detail: 'large text, 3:1' },
  { key: 'aaaNormal', label: 'AAA', detail: 'body text, 7:1' },
  { key: 'aaaLarge', label: 'AAA Large', detail: 'large text, 4.5:1' },
];

function renderContrast(): void {
  fillPairSelect(els.fg, state.fg);
  fillPairSelect(els.bg, state.bg);
  const fgHex = hexOf(state.fg);
  const bgHex = hexOf(state.bg);
  const ratio = contrastRatio(rgbOf(state.fg), rgbOf(state.bg));
  const levels = wcagLevels(ratio);
  els.sample.style.setProperty('--fg', fgHex);
  els.sample.style.setProperty('--bg', bgHex);
  // Two decimals, truncated rather than rounded so 4.499 never reads as 4.50.
  els.ratio.textContent = (Math.floor(ratio * 100) / 100).toFixed(2);
  els.badges.innerHTML = badgeDefs
    .map(({ key, label, detail }) => {
      const pass = levels[key];
      return `<li class="badge ${pass ? 'is-pass' : 'is-fail'}" title="${detail}">${pass ? icons.check : icons.cross}<span>${label}</span><span class="sr-only">${pass ? 'passes' : 'fails'} (${detail})</span></li>`;
    })
    .join('');
  renderMatrix();
}

function renderMatrix(): void {
  const idx = [0, 1, 2, 3, 4];
  const head = idx
    .map((i) => `<th scope="col"><span class="dot" style="--dot:${hexOf(i)}"></span><span class="sr-only">Background ${nameOf(i)}</span></th>`)
    .join('');
  const rows = idx
    .map((r) => {
      const cells = idx
        .map((c) => {
          if (r === c) return '<td><span class="cell cell-self" aria-label="Same colour">·</span></td>';
          const ratio = contrastRatio(rgbOf(r), rgbOf(c));
          const level = ratio >= 7 ? 'aaa' : ratio >= 4.5 ? 'aa' : ratio >= 3 ? 'large' : 'fail';
          const active = state.fg === r && state.bg === c ? ' is-active' : '';
          return `<td><button type="button" class="cell cell-${level}${active}" data-fg="${r}" data-bg="${c}" aria-label="${nameOf(r)} text on ${nameOf(c)}: ${ratio.toFixed(2)} to 1">${ratio.toFixed(1)}</button></td>`;
        })
        .join('');
      return `<tr><th scope="row"><span class="dot" style="--dot:${hexOf(r)}"></span><span class="sr-only">Text ${nameOf(r)}</span></th>${cells}</tr>`;
    })
    .join('');
  els.matrix.innerHTML = `<table class="matrix-table"><caption class="sr-only">Contrast ratio of each palette colour as text (rows) on each as background (columns)</caption><thead><tr><td></td>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

els.matrix.addEventListener('click', (event) => {
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-fg]');
  if (!target) return;
  state.fg = Number(target.dataset.fg);
  state.bg = Number(target.dataset.bg);
  renderContrast();
  els.matrix.querySelector<HTMLButtonElement>(`button[data-fg="${state.fg}"][data-bg="${state.bg}"]`)?.focus();
});

els.fg.addEventListener('change', () => {
  state.fg = Number(els.fg.value);
  renderContrast();
});
els.bg.addEventListener('change', () => {
  state.bg = Number(els.bg.value);
  renderContrast();
});
els.swap.innerHTML = icons.swap;
els.swap.addEventListener('click', () => {
  [state.fg, state.bg] = [state.bg, state.fg];
  renderContrast();
});

/* ---------- preview ---------- */

function renderPreview(): void {
  const roles = assignRoles(state.colors);
  const set = (name: string, i: number): void => {
    const hex = oklchToHex(state.colors[i]);
    els.mock.style.setProperty(`--${name}`, hex);
    els.mock.style.setProperty(`--on-${name}`, readableOn(hexToRgb(hex) as Rgb));
  };
  set('ink', roles.ink);
  set('paper', roles.paper);
  set('primary', roles.primary);
  set('accent', roles.accent);
  set('soft', roles.soft);
  state.colors.forEach((c, i) => els.mock.style.setProperty(`--p${i + 1}`, oklchToHex(c)));
}

/* ---------- export ---------- */

const formats = Object.keys(EXPORT_LABELS) as ExportFormat[];
els.tabs.innerHTML = formats
  .map((f) => `<button type="button" role="tab" class="tab" id="tab-${f}" data-format="${f}" aria-controls="export-panel">${EXPORT_LABELS[f]}</button>`)
  .join('');
const tabButtons = [...els.tabs.querySelectorAll<HTMLButtonElement>('[role="tab"]')];

function selectFormat(format: ExportFormat, focus = false): void {
  state.format = format;
  for (const tab of tabButtons) {
    const active = tab.dataset.format === format;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    if (active && focus) tab.focus();
  }
  document.getElementById('export-panel')?.setAttribute('aria-labelledby', `tab-${format}`);
  renderExport();
}

els.tabs.addEventListener('click', (event) => {
  const tab = (event.target as HTMLElement).closest<HTMLButtonElement>('[role="tab"]');
  if (tab) selectFormat(tab.dataset.format as ExportFormat);
});
els.tabs.addEventListener('keydown', (event) => {
  const current = formats.indexOf(state.format);
  let next = -1;
  if (event.key === 'ArrowRight') next = (current + 1) % formats.length;
  else if (event.key === 'ArrowLeft') next = (current - 1 + formats.length) % formats.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = formats.length - 1;
  if (next >= 0) {
    event.preventDefault();
    selectFormat(formats[next], true);
  }
});

function renderExport(): void {
  els.code.textContent = exportPalette(state.colors, state.format);
}

els.copyExport.innerHTML = `${icons.copy}<span>Copy</span>`;
els.copyExport.addEventListener('click', () => void copyText(els.code.textContent ?? '', EXPORT_LABELS[state.format]));

/* ---------- URL hash ---------- */

let hashTimer = 0;
let lastHash = '';

function syncHash(): void {
  window.clearTimeout(hashTimer);
  const hash = encodeHash({ colors: state.colors, locks: state.locks, harmony: state.harmony });
  if (hash === lastHash) return;
  lastHash = hash;
  try {
    replaceHash(`#${hash}`);
  } catch {
    // Some embedded contexts forbid history changes; sharing still works through the button.
  }
}

function replaceHash(hash: string): void {
  window.history.replaceState(null, '', hash);
}

function scheduleHash(): void {
  window.clearTimeout(hashTimer);
  hashTimer = window.setTimeout(syncHash, 250);
}

function loadFromHash(): boolean {
  const decoded = decodeHash(window.location.hash);
  if (!decoded) return false;
  state.colors = decoded.colors;
  state.locks = decoded.locks;
  state.harmony = decoded.harmony;
  els.harmony.value = decoded.harmony;
  lastHash = window.location.hash.replace(/^#/, '');
  return true;
}

window.addEventListener('hashchange', () => {
  if (window.location.hash.replace(/^#/, '') === lastHash) return;
  if (loadFromHash()) {
    state.lastHarmony = null;
    pushHistory();
    renderAll();
  }
});

els.share.innerHTML = icons.link;
els.share.addEventListener('click', () => {
  syncHash();
  const url = `${window.location.origin}${window.location.pathname}#${encodeHash({ colors: state.colors, locks: state.locks, harmony: state.harmony })}`;
  void copyText(url, 'Share link');
});

/* ---------- wiring ---------- */

function renderAll(): void {
  renderHarmonyNote();
  renderSwatches();
  renderEditor(true);
  renderContrast();
  renderPreview();
  renderExport();
  scheduleHash();
}

els.harmony.addEventListener('change', () => {
  state.harmony = els.harmony.value as HarmonyChoice;
  syncHash();
});

document.getElementById('generate-icon')!.innerHTML = icons.shuffle;
document.getElementById('brand-mark')!.innerHTML = logo;
els.generate.addEventListener('click', generate);
els.undo.innerHTML = icons.undo;
els.redo.innerHTML = icons.redo;
els.undo.addEventListener('click', () => restore(historyIndex - 1));
els.redo.addEventListener('click', () => restore(historyIndex + 1));

const toggleTheme = initTheme((theme: Theme) => {
  els.theme.innerHTML = theme === 'dark' ? icons.sun : icons.moon;
  els.theme.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  const color = theme === 'dark' ? '#131317' : '#f6f4ef';
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) meta.content = color;
});
els.theme.addEventListener('click', toggleTheme);

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName);
}

document.addEventListener('keydown', (event) => {
  if (event.defaultPrevented || event.altKey) return;
  const mod = event.ctrlKey || event.metaKey;
  if (mod && event.key.toLowerCase() === 'z' && !isTyping(event.target)) {
    event.preventDefault();
    restore(event.shiftKey ? historyIndex + 1 : historyIndex - 1);
    return;
  }
  if (mod || isTyping(event.target)) return;
  const onControl = event.target instanceof HTMLElement && ['BUTTON', 'A'].includes(event.target.tagName);
  if (event.code === 'Space' && !onControl) {
    event.preventDefault();
    generate();
  } else if (/^[1-5]$/.test(event.key)) {
    selectSwatch(Number(event.key) - 1);
  } else if (event.key.toLowerCase() === 'l') {
    toggleLock(state.selected);
  } else if (event.key.toLowerCase() === 'c') {
    const hex = hexOf(state.selected).toUpperCase();
    void copyText(hex, hex);
  }
});

/* ---------- start ---------- */

loadFromHash();
pushHistory();
selectFormat('css');
renderAll();
