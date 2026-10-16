import { RING_CONTROLS, type Point, type RingParams } from './ringsRenderer';

/** How the extra ring layers on the Stack page mirror the cursor. */
export type MirrorMode = 'x' | 'y' | 'point' | 'all';

export const MIRROR_MODES: { value: MirrorMode; label: string }[] = [
  { value: 'x', label: 'Left ↔ right (2 layers)' },
  { value: 'y', label: 'Top ↕ bottom (2 layers)' },
  { value: 'point', label: 'Through the middle (2 layers)' },
  { value: 'all', label: 'All four corners (4 layers)' },
];

/** The cursor point first, then its mirror images. */
export function mirrorPoints(p: Point, mode: MirrorMode): Point[] {
  const flipX = { x: 1 - p.x, y: p.y };
  const flipY = { x: p.x, y: 1 - p.y };
  const flipXY = { x: 1 - p.x, y: 1 - p.y };
  if (mode === 'x') return [p, flipX];
  if (mode === 'y') return [p, flipY];
  if (mode === 'point') return [p, flipXY];
  return [p, flipX, flipY, flipXY];
}

/** The JSON file format for saved ring settings. Same format as the original standalone page. */
export type RingsConfig = {
  type: 'rippler-config';
  version: 1;
  params: RingParams;
  center: Point | null; // where the rings sit before the cursor moves; null = the logo
  showSampleUi: boolean;
  mirror?: MirrorMode; // Stack page only; older files don't have it
};

export type RingsState = Omit<RingsConfig, 'type' | 'version'>;

export function toConfig(state: RingsState): RingsConfig {
  return {
    type: 'rippler-config',
    version: 1,
    params: state.params,
    center: state.center ? { x: +state.center.x.toFixed(4), y: +state.center.y.toFixed(4) } : null,
    showSampleUi: state.showSampleUi,
    mirror: state.mirror,
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
    mirror: MIRROR_MODES.some(m => m.value === cfg.mirror) ? cfg.mirror : current.mirror,
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
