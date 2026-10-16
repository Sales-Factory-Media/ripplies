'use client';

import { useEffect, useRef } from 'react';
import { RippleEngine, type Obstacle } from '@/lib/rippleEngine';
import { paintBackground } from '@/lib/paintBackground';
import styles from './RippleBoxes.module.css';

// Positions in % of the viewport, so the layout (and its gaps) scale with the screen.
const BOXES = [
  { title: 'Spring', left: 9, top: 12, width: 24, height: 28 },
  { title: 'Meadow', left: 44, top: 13, width: 19, height: 21 },
  { title: 'Grove', left: 73, top: 20, width: 18, height: 36 },
  { title: 'Brook', left: 17, top: 56, width: 30, height: 25 },
  { title: 'Pond', left: 58, top: 65, width: 21, height: 21 },
];

type Props = {
  /** Optional background image URL. Defaults to a generated painterly landscape. */
  backgroundSrc?: string;
};

export default function RippleBoxes({ backgroundSrc }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const engineRef = useRef<RippleEngine | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const painted = paintBackground();
    const engine = new RippleEngine(canvas);

    if (!engine.supported) {
      // No WebGL2: show the plain image, boxes still work as buttons.
      canvas.style.backgroundImage = `url(${backgroundSrc ?? painted.toDataURL('image/jpeg', 0.85)})`;
      canvas.style.backgroundSize = 'cover';
      return;
    }
    engineRef.current = engine;
    engine.setBackground(painted, painted.width, painted.height);

    let cancelled = false;
    if (backgroundSrc) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => !cancelled && engine.setBackground(img, img.naturalWidth, img.naturalHeight);
      img.src = backgroundSrc;
    }

    const readObstacles = () =>
      engine.setObstacles(
        boxRefs.current.map((el): Obstacle => {
          const b = el!.getBoundingClientRect();
          const r = parseFloat(getComputedStyle(el!).borderTopLeftRadius) || 0;
          return { x: b.left, y: b.top, w: b.width, h: b.height, r };
        }),
      );

    // Fires once on observe, then on every size change: refit the grid, re-read the boxes.
    const ro = new ResizeObserver(() => {
      engine.resize();
      readObstacles();
    });
    ro.observe(canvas);
    engine.start();

    return () => {
      cancelled = true;
      ro.disconnect();
      engine.destroy();
      engineRef.current = null;
    };
  }, [backgroundSrc]);

  return (
    <main className={styles.scene}>
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
      {BOXES.map((box, i) => (
        <button
          key={box.title}
          ref={el => {
            boxRefs.current[i] = el;
          }}
          type="button"
          className={styles.box}
          style={{ left: `${box.left}%`, top: `${box.top}%`, width: `${box.width}%`, height: `${box.height}%` }}
          onClick={() => engineRef.current?.pulse(i)}
        >
          <span className={styles.title}>{box.title}</span>
          <span className={styles.hint}>Tap to ripple</span>
        </button>
      ))}
    </main>
  );
}
