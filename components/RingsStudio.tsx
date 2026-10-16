'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { MAX_LAYERS, RING_CONTROLS, RING_DEFAULTS, RingsRenderer, WAVE_SHAPES, type Point, type WaveShape } from '@/lib/ringsRenderer';
import {
  DEFAULT_STACK_LAYERS,
  MIN_STACK_LAYERS,
  MIRROR_MODES,
  applyConfig,
  downloadJson,
  mirrorPoints,
  toConfig,
  type MirrorMode,
  type RingsState,
} from '@/lib/ringsConfig';
import { BACKGROUNDS, DEFAULT_BACKGROUND, VIDEO_BACKGROUNDS, paintPreset } from '@/lib/backgrounds';
import styles from './RingsStudio.module.css';

const NARROW = '(max-width: 639px)';
const subscribeNarrow = (cb: () => void) => {
  const mq = matchMedia(NARROW);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};

const isJson = (f: File) => f.type === 'application/json' || f.name.endsWith('.json');
const THUMB_W = 150;
const THUMB_H = 100;

type Props = {
  /** Stack page: extra ring layers copy the cursor (mirrored or spun around the middle). */
  stack?: boolean;
};

export default function RingsStudio({ stack = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const configInputRef = useRef<HTMLInputElement>(null);
  const rendererRef = useRef<RingsRenderer | null>(null);
  const cursorRef = useRef<Point | null>(null);

  const [state, setState] = useState<RingsState>({
    params: RING_DEFAULTS,
    // Start the stack off-centre so the mirrored layers don't all sit on one spot.
    center: stack ? { x: 0.3, y: 0.68 } : null,
    showSampleUi: !stack,
    shape: 'circle',
    background: DEFAULT_BACKGROUND,
    mirror: stack ? 'rotate' : undefined,
    layers: stack ? DEFAULT_STACK_LAYERS : undefined,
  });
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
    rendererRef.current?.setParams(state.params);
    if (rendererRef.current) rendererRef.current.shape = state.shape ?? 'circle';
  }, [state]);

  // Panel starts collapsed on phones so the effect stays visible; the user's toggle wins after that.
  const narrow = useSyncExternalStore(subscribeNarrow, () => matchMedia(NARROW).matches, () => false);
  const [collapsedChoice, setCollapsedChoice] = useState<boolean | null>(null);
  const collapsed = collapsedChoice ?? narrow;

  const [dragging, setDragging] = useState(false);
  const [fallbackSrc, setFallbackSrc] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // ---- Renderer lifecycle ----
  useEffect(() => {
    const canvas = canvasRef.current!;
    const renderer = new RingsRenderer(canvas);
    if (!renderer.supported) return;
    rendererRef.current = renderer;
    renderer.setParams(stateRef.current.params);
    renderer.shape = stateRef.current.shape ?? 'circle';
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) renderer.speedScale = 0.25;
    const primary = () => {
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
    renderer.goals = () => {
      const { mirror, layers } = stateRef.current;
      return mirror ? mirrorPoints(primary(), mirror, layers, canvas.clientWidth / Math.max(1, canvas.clientHeight)) : [primary()];
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

  // ---- Backgrounds: built-in pictures, videos, or the user's own image/video ----
  function stopVideo() {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.removeAttribute('src');
    v.load();
    videoRef.current = null;
  }

  function showCanvas(painted: HTMLCanvasElement) {
    stopVideo();
    if (rendererRef.current) rendererRef.current.setImage(painted);
    else setFallbackSrc(painted.toDataURL('image/jpeg', 0.85));
  }

  function playVideo(src: string, poster?: string) {
    stopVideo();
    if (!rendererRef.current) {
      if (poster) setFallbackSrc(poster); // no WebGL: show a still instead
      return;
    }
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous';
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.onerror = () => alert('Could not play that video.');
    v.src = src;
    videoRef.current = v;
    rendererRef.current.setVideo(v);
    v.play().catch(() => {}); // muted autoplay is allowed; a refusal just leaves the first frame
  }

  // Built-in backgrounds follow state.background; undefined means the user's own file is showing.
  useEffect(() => {
    const id = state.background;
    if (!id) return;
    const video = VIDEO_BACKGROUNDS.find(v => v.id === id);
    // Deferred: without WebGL these set the fallback picture (state), which an effect shouldn't do directly.
    queueMicrotask(() => (video ? playVideo(video.src, video.thumb) : showCanvas(paintPreset(id))));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a background change should repaint
  }, [state.background]);
  useEffect(() => stopVideo, []);

  // Thumbnails are painted in the browser after the first render.
  useEffect(() => {
    queueMicrotask(() =>
      setThumbs(Object.fromEntries(BACKGROUNDS.map(b => [b.id, paintPreset(b.id, THUMB_W, THUMB_H).toDataURL('image/jpeg', 0.8)]))),
    );
  }, []);

  function loadImageSrc(src: string) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setState(s => ({ ...s, background: undefined }));
      stopVideo();
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
    if (!f) return;
    if (f.type.startsWith('image/')) loadImageSrc(URL.createObjectURL(f));
    else if (f.type.startsWith('video/')) {
      setState(s => ({ ...s, background: undefined }));
      playVideo(URL.createObjectURL(f));
    }
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
          <h1>{stack ? 'Stack' : 'Rings'}</h1>
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
              Choose image or video…
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
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*,video/*"
              hidden
              onChange={e => {
                loadImageFile(e.target.files?.[0]);
                e.target.value = ''; // allow picking the same file again
              }}
            />
          </div>
          <div className={styles.thumbs} role="group" aria-label="Built-in backgrounds">
            {BACKGROUNDS.map(b => (
              <button
                key={b.id}
                className={styles.thumb}
                aria-pressed={state.background === b.id}
                aria-label={b.label}
                title={b.label}
                onClick={() => setState(s => ({ ...s, background: b.id }))}
              >
                {thumbs[b.id] && (
                  // eslint-disable-next-line @next/next/no-img-element -- painted at runtime as a data URL
                  <img src={thumbs[b.id]} alt="" />
                )}
              </button>
            ))}
            {VIDEO_BACKGROUNDS.map(v => (
              <button
                key={v.id}
                className={styles.thumb}
                aria-pressed={state.background === v.id}
                aria-label={v.label}
                title={v.label}
                onClick={() => setState(s => ({ ...s, background: v.id }))}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- tiny still from the video */}
                <img src={v.thumb} alt="" />
                <span className={styles.play} aria-hidden="true">
                  ▶
                </span>
              </button>
            ))}
          </div>
          <p className={styles.hint}>
            Or drop / paste an image or video anywhere. The ripples follow your cursor{stack ? ' and the other layers copy it' : ''}.
          </p>

          <div className={styles.row}>
            <label htmlFor="ring-shape">Wave shape</label>
            <select
              id="ring-shape"
              className={styles.select}
              value={state.shape ?? 'circle'}
              onChange={e => setState(s => ({ ...s, shape: e.target.value as WaveShape }))}
            >
              {WAVE_SHAPES.map(w => (
                <option key={w.value} value={w.value}>
                  {w.label}
                </option>
              ))}
            </select>
          </div>

          {stack && (
            <div className={styles.row}>
              <label htmlFor="ring-mirror">Layer pattern</label>
              <select
                id="ring-mirror"
                className={styles.select}
                value={state.mirror}
                onChange={e => setState(s => ({ ...s, mirror: e.target.value as MirrorMode }))}
              >
                {MIRROR_MODES.map(m => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {stack && MIRROR_MODES.find(m => m.value === state.mirror)?.usesCount && (
            <div className={styles.row}>
              <label htmlFor="ring-layers">Layers</label>
              <output htmlFor="ring-layers">{state.layers}</output>
              <input
                id="ring-layers"
                type="range"
                min={MIN_STACK_LAYERS}
                max={MAX_LAYERS}
                step={1}
                value={state.layers ?? DEFAULT_STACK_LAYERS}
                onChange={e => {
                  const layers = parseInt(e.target.value, 10);
                  setState(s => ({ ...s, layers }));
                }}
              />
            </div>
          )}

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
            <button className={styles.btn} onClick={() => downloadJson(toConfig(state), stack ? 'rippler-stack-config.json' : 'rippler-config.json')}>
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
          Drop an image, a video or a config file
        </div>
      )}
    </main>
  );
}
