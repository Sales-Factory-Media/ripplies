'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { RING_CONTROLS, RING_DEFAULTS, RingsRenderer, type Point } from '@/lib/ringsRenderer';
import { applyConfig, downloadJson, toConfig, type RingsState } from '@/lib/ringsConfig';
import { paintBackground } from '@/lib/paintBackground';
import styles from './RingsStudio.module.css';

const NARROW = '(max-width: 639px)';
const subscribeNarrow = (cb: () => void) => {
  const mq = matchMedia(NARROW);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};

const isJson = (f: File) => f.type === 'application/json' || f.name.endsWith('.json');

export default function RingsStudio() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const configInputRef = useRef<HTMLInputElement>(null);
  const rendererRef = useRef<RingsRenderer | null>(null);
  const cursorRef = useRef<Point | null>(null);

  const [state, setState] = useState<RingsState>({
    params: RING_DEFAULTS,
    center: null,
    showSampleUi: true,
  });
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
    rendererRef.current?.setParams(state.params);
  }, [state]);

  // Panel starts collapsed on phones so the effect stays visible; the user's toggle wins after that.
  const narrow = useSyncExternalStore(subscribeNarrow, () => matchMedia(NARROW).matches, () => false);
  const [collapsedChoice, setCollapsedChoice] = useState<boolean | null>(null);
  const collapsed = collapsedChoice ?? narrow;

  const [dragging, setDragging] = useState(false);
  const [fallbackSrc, setFallbackSrc] = useState<string | null>(null);

  // ---- Renderer lifecycle ----
  useEffect(() => {
    const canvas = canvasRef.current!;
    const painted = paintBackground();
    const renderer = new RingsRenderer(canvas);
    if (!renderer.supported) {
      queueMicrotask(() => setFallbackSrc(painted.toDataURL('image/jpeg', 0.85)));
      return;
    }
    rendererRef.current = renderer;
    renderer.setImage(painted);
    renderer.setParams(stateRef.current.params);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) renderer.speedScale = 0.25;
    renderer.goal = () => {
      const s = stateRef.current;
      if (cursorRef.current) return cursorRef.current;
      if (s.center) return s.center;
      const logo = logoRef.current;
      if (logo) {
        const b = logo.getBoundingClientRect();
        const c = canvas.getBoundingClientRect();
        return { x: (b.left + b.width / 2 - c.left) / c.width, y: 1 - (b.top + b.height / 2 - c.top) / c.height };
      }
      return { x: 0.5, y: 0.5 };
    };
    const ro = new ResizeObserver(() => renderer.resize());
    ro.observe(canvas);
    renderer.start();
    return () => {
      ro.disconnect();
      renderer.destroy();
      rendererRef.current = null;
    };
  }, []);

  // ---- Images ----
  function loadImageSrc(src: string) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!rendererRef.current) {
        setFallbackSrc(src);
        return;
      }
      try {
        rendererRef.current.setImage(img);
      } catch {
        alert('That image could not be used (the host does not allow cross-origin use). Try downloading it and choosing the file instead.');
      }
    };
    img.onerror = () => alert('Could not load that image.');
    img.src = src;
  }
  const loadImageFile = (f?: File | null) => {
    if (f && f.type.startsWith('image/')) loadImageSrc(URL.createObjectURL(f));
  };

  // ---- Config ----
  async function loadConfigFile(file: File) {
    try {
      const next = applyConfig(JSON.parse(await file.text()), stateRef.current);
      setState(next);
    } catch (err) {
      alert('Could not load config: ' + (err instanceof SyntaxError ? 'the file is not valid JSON.' : (err as Error).message));
    }
  }

  // ---- Window-level input: drag & drop, paste, cursor follow ----
  // Handlers read the latest closures through a ref so the listeners are attached once.
  const handlersRef = useRef({ loadImageFile, loadConfigFile });
  useEffect(() => {
    handlersRef.current = { loadImageFile, loadConfigFile };
  });
  useEffect(() => {
    let depth = 0;
    const onDragEnter = (e: DragEvent) => {
      e.preventDefault();
      depth++;
      setDragging(true);
    };
    const onDragLeave = () => {
      if (--depth <= 0) {
        depth = 0;
        setDragging(false);
      }
    };
    const onDragOver = (e: DragEvent) => e.preventDefault();
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const f = e.dataTransfer?.files[0];
      if (!f) return;
      if (isJson(f)) handlersRef.current.loadConfigFile(f);
      else handlersRef.current.loadImageFile(f);
    };
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find(i => i.type.startsWith('image/'));
      if (item) handlersRef.current.loadImageFile(item.getAsFile());
    };
    const onMove = (e: PointerEvent) => {
      cursorRef.current = { x: e.clientX / innerWidth, y: 1 - e.clientY / innerHeight };
    };
    addEventListener('dragenter', onDragEnter);
    addEventListener('dragleave', onDragLeave);
    addEventListener('dragover', onDragOver);
    addEventListener('drop', onDrop);
    addEventListener('paste', onPaste);
    addEventListener('pointermove', onMove);
    return () => {
      removeEventListener('dragenter', onDragEnter);
      removeEventListener('dragleave', onDragLeave);
      removeEventListener('dragover', onDragOver);
      removeEventListener('drop', onDrop);
      removeEventListener('paste', onPaste);
      removeEventListener('pointermove', onMove);
    };
  }, []);

  return (
    <main className={styles.scene}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        role="img"
        aria-label="Background image with an animated water ripple effect"
      />
      {fallbackSrc && (
        // eslint-disable-next-line @next/next/no-img-element -- runtime data/blob URL, not an optimisable asset
        <img className={styles.fallback} src={fallbackSrc} alt="" />
      )}

      {state.showSampleUi && (
        <div className={styles.hero}>
          <div className={styles.logo} ref={logoRef} aria-hidden="true">
            <svg width="40" height="40" viewBox="-20 -20 40 40" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round">
              {Array.from({ length: 12 }, (_, i) => (
                <line key={i} x1="0" y1="-6.5" x2="0" y2="-17" transform={`rotate(${i * 30})`} />
              ))}
              <circle r="3.4" fill="#fff" stroke="none" />
            </svg>
          </div>
        </div>
      )}

      <section className={`${styles.panel} ${collapsed ? styles.collapsed : ''}`} aria-label="Ripple controls">
        <header className={styles.panelHeader}>
          <h1>Rings</h1>
          <button
            className={styles.iconBtn}
            aria-expanded={!collapsed}
            aria-controls="rings-panel-body"
            title={collapsed ? 'Show controls' : 'Hide controls'}
            onClick={() => setCollapsedChoice(!collapsed)}
          >
            {collapsed ? '+' : '–'}
          </button>
        </header>
        <div className={styles.body} id="rings-panel-body">
          <div className={styles.btns}>
            <button className={`${styles.btn} ${styles.primary}`} onClick={() => imageInputRef.current?.click()}>
              Choose image…
            </button>
            <button
              className={styles.btn}
              onClick={() => {
                const u = prompt('Image URL (the host must allow cross-origin use):');
                if (u) loadImageSrc(u.trim());
              }}
            >
              From URL…
            </button>
            <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={e => loadImageFile(e.target.files?.[0])} />
          </div>
          <p className={styles.hint}>Or drop / paste an image anywhere. The ripples follow your cursor.</p>

          {RING_CONTROLS.map(({ key, label, min, max, step }) => (
            <div className={styles.row} key={key}>
              <label htmlFor={`ring-${key}`}>{label}</label>
              <output htmlFor={`ring-${key}`}>{state.params[key].toFixed(2)}</output>
              <input
                id={`ring-${key}`}
                type="range"
                min={min}
                max={max}
                step={step}
                value={state.params[key]}
                onChange={e => {
                  const v = parseFloat(e.target.value);
                  setState(s => ({ ...s, params: { ...s.params, [key]: v } }));
                }}
              />
            </div>
          ))}

          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={state.showSampleUi}
              onChange={e => setState(s => ({ ...s, showSampleUi: e.target.checked }))}
            />{' '}
            Show sample UI
          </label>

          <div className={styles.btns}>
            <button className={styles.btn} onClick={() => downloadJson(toConfig(state), 'rippler-config.json')}>
              Save config
            </button>
            <button className={styles.btn} onClick={() => configInputRef.current?.click()}>
              Load config…
            </button>
            <input
              ref={configInputRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) loadConfigFile(f);
                e.target.value = ''; // allow re-loading the same file
              }}
            />
          </div>
        </div>
      </section>

      {dragging && (
        <div className={styles.drop} aria-hidden="true">
          Drop an image or a config file
        </div>
      )}
    </main>
  );
}
