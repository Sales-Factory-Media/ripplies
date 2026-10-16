import { isBackgroundId } from './backgrounds';
import { MAX_LAYERS, RING_CONTROLS, WAVE_SHAPES, type Point, type RingParams, type WaveShape } from './ringsRenderer';

/** How the extra ring layers on the Stack page copy the cursor. */
export type MirrorMode = 'x' | 'y' | 'point' | 'all' | 'rotate' | 'kaleido';

export const MIRROR_MODES: { value: MirrorMode; label: string; usesCount?: boolean }[] = [
  { value: 'x', label: 'Left ↔ right (2 layers)' },
  { value: 'y', label: 'Top ↕ bottom (2 layers)' },
  { value: 'point', label: 'Through the middle (2 layers)' },
  { value: 'all', label: 'All four corners (4 layers)' },
  { value: 'rotate', label: 'Spin around the middle', usesCount: true },
  { value: 'kaleido', label: 'Kaleidoscope (spin + mirror)', usesCount: true },
];

export const MIN_STACK_LAYERS = 2;
export const DEFAULT_STACK_LAYERS = 8;

/**
 * The cursor point first, then its copies. `layers` is only used by the spin
 * modes; `aspect` (width / height) keeps the spin round on non-square screens.
 */
export function mirrorPoints(p: Point, mode: MirrorMode, layers = DEFAULT_STACK_LAYERS, aspect = 1): Point[] {
  if (mode === 'x') return [p, { x: 1 - p.x, y: p.y }];
  if (mode === 'y') return [p, { x: p.x, y: 1 - p.y }];
  if (mode === 'point') return [p, { x: 1 - p.x, y: 1 - p.y }];
  if (mode === 'all') return [p, { x: 1 - p.x, y: p.y }, { x: p.x, y: 1 - p.y }, { x: 1 - p.x, y: 1 - p.y }];

  // Spin modes work around the screen centre, in units where x and y are the same size.
  const n = Math.min(MAX_LAYERS, Math.max(MIN_STACK_LAYERS, Math.round(layers)));
  const vx = (p.x - 0.5) * aspect;
  const vy = p.y - 0.5;
  const at = (x: number, y: number, angle: number) => ({
    x: 0.5 + (x * Math.cos(angle) - y * Math.sin(angle)) / aspect,
    y: 0.5 + x * Math.sin(angle) + y * Math.cos(angle),
  });
  const points: Point[] = [];
  if (mode === 'rotate') {
    for (let i = 0; i < n; i++) points.push(at(vx, vy, (i / n) * Math.PI * 2));
  } else {
    // Each spun copy is followed by its mirror image (flipped across the horizontal axis, then spun).
    const spokes = Math.ceil(n / 2);
    for (let i = 0; i < spokes; i++) {
      const angle = (i / spokes) * Math.PI * 2;
      points.push(at(vx, vy, angle), at(vx, -vy, angle));
    }
  }
  return points.slice(0, n);
}

/** The JSON file format for saved ring settings. Same format as the original standalone page. */
export type RingsConfig = {
  type: 'rippler-config';
  version: 1;
  params: RingParams;
  center: Point | null; // where the rings sit before the cursor moves; null = the logo
  showSampleUi: boolean;
  shape?: WaveShape; // older files don't have it; missing = circle
  background?: string; // a built-in picture or video; missing = the user's own image
  mirror?: MirrorMode; // Stack page only; older files don't have it
  layers?: number; // Stack page spin modes only
};

export type RingsState = Omit<RingsConfig, 'type' | 'version'>;

export function toConfig(state: RingsState): RingsConfig {
  return {
    type: 'rippler-config',
    version: 1,
    params: state.params,
    center: state.center ? { x: +state.center.x.toFixed(4), y: +state.center.y.toFixed(4) } : null,
    showSampleUi: state.showSampleUi,
    shape: state.shape,
    background: state.background,
    mirror: state.mirror,
    layers: state.layers,
  };
}

/**
 * Applies a parsed config on top of the current state. Values are clamped to
 * the slider ranges; anything missing or malformed keeps its current value.
 */
export function applyConfig(raw: unknown, current: RingsState): RingsState {
  const cfg = raw as Partial<RingsConfig> | null;
  if (!cfg || cfg.type !== 'rippler-config' || typeof cfg.params !== 'object' || cfg.params === null) {
    throw new Error('This is not a Rippler config file.');
  }
  const params = { ...current.params };
  for (const { key, min, max } of RING_CONTROLS) {
    const v = Number((cfg.params as Record<string, unknown>)[key]);
    if (Number.isFinite(v)) params[key] = Math.min(max, Math.max(min, v));
  }
  const c = cfg.center as Point | null | undefined;
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  const center = c && Number.isFinite(+c.x) && Number.isFinite(+c.y) ? { x: clamp01(+c.x), y: clamp01(+c.y) } : null;
  return {
    params,
    center,
    showSampleUi: typeof cfg.showSampleUi === 'boolean' ? cfg.showSampleUi : current.showSampleUi,
    shape: WAVE_SHAPES.some(w => w.value === cfg.shape) ? cfg.shape : 'circle',
    background: isBackgroundId(cfg.background) ? cfg.background : current.background,
    mirror: MIRROR_MODES.some(m => m.value === cfg.mirror) ? cfg.mirror : current.mirror,
    layers: Number.isFinite(Number(cfg.layers))
      ? Math.min(MAX_LAYERS, Math.max(MIN_STACK_LAYERS, Math.round(Number(cfg.layers))))
      : current.layers,
  };
}

export function downloadJson(data: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
