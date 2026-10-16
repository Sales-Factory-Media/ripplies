import { RING_CONTROLS, type Point, type RingParams } from './ringsRenderer';

/** The JSON file format for saved ring settings. Same format as the original standalone page. */
export type RingsConfig = {
  type: 'rippler-config';
  version: 1;
  params: RingParams;
  center: Point | null; // null = follow the logo
  followCursor: boolean;
  showSampleUi: boolean;
};

export type RingsState = Omit<RingsConfig, 'type' | 'version'>;

export function toConfig(state: RingsState): RingsConfig {
  return {
    type: 'rippler-config',
    version: 1,
    params: state.params,
    center: state.center ? { x: +state.center.x.toFixed(4), y: +state.center.y.toFixed(4) } : null,
    followCursor: state.followCursor,
    showSampleUi: state.showSampleUi,
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
    followCursor: typeof cfg.followCursor === 'boolean' ? cfg.followCursor : current.followCursor,
    showSampleUi: typeof cfg.showSampleUi === 'boolean' ? cfg.showSampleUi : current.showSampleUi,
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
