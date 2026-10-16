import { paintPreset } from './backgrounds';

/** Paints the default meadow picture so the demo needs no image asset. */
export function paintBackground(W = 1800, H = 1200): HTMLCanvasElement {
  return paintPreset('meadow', W, H);
}
