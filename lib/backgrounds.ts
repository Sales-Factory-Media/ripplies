/**
 * Built-in background pictures, painted in code so the demo needs no image
 * assets. Each one is drawn on a 1800×1200 board and scaled to the size asked
 * for, so the same painter makes both the full image and its thumbnail.
 * They are picked to show the effect off: sharp edges, bright points, strong colour.
 */

const W = 1800;
const H = 1200;

type Kit = {
  g: CanvasRenderingContext2D;
  rnd: () => number;
  pick: <T>(xs: readonly T[]) => T;
  dab: (x: number, y: number, rx: number, ry: number, col: string, a?: number, rot?: number) => void;
};

type Background = { id: string; label: string; grain: number; paint: (k: Kit) => void };

export const BACKGROUNDS: readonly Background[] = [
  { id: 'meadow', label: 'Meadow', grain: 18, paint: meadow },
  { id: 'pool', label: 'Pool tiles', grain: 8, paint: pool },
  { id: 'city', label: 'City at night', grain: 10, paint: city },
  { id: 'sunset', label: 'Sunset sea', grain: 10, paint: sunset },
  { id: 'neon', label: 'Neon grid', grain: 6, paint: neon },
  { id: 'leaves', label: 'Autumn leaves', grain: 12, paint: leaves },
  { id: 'pebbles', label: 'Pebbles', grain: 16, paint: pebbles },
  { id: 'stripes', label: 'Candy stripes', grain: 6, paint: stripes },
];

/**
 * Looping videos in /public/backgrounds.
 * - flow.mp4: generated with ffmpeg (maths only, nothing to license).
 * - street.mp4: "Video Codec Test pedestrian area 1080p25" by Taurus Media Technik, CC0, from
 *   https://commons.wikimedia.org/wiki/File:Video_Codec_Test_pedestrian_area_1080p25.y4m.webm
 *   (originally the xiph.org test set). People walking past in Munich's Neuhauser Straße.
 * - ocean.mp4: "Ocean surface waves 06" by Mostafameraji, CC0 (public domain), from
 *   https://commons.wikimedia.org/wiki/File:Ocean_surface_waves_06.ogv
 * Both real clips are cut to 720p with the last second faded into the first so they loop without a jump.
 */
export const VIDEO_BACKGROUNDS = [
  { id: 'video-street', label: 'People walking (video)', src: '/backgrounds/street.mp4', thumb: '/backgrounds/street-thumb.jpg' },
  { id: 'video-ocean', label: 'Sunset ocean (video)', src: '/backgrounds/ocean.mp4', thumb: '/backgrounds/ocean-thumb.jpg' },
  { id: 'video-flow', label: 'Neon flow (video)', src: '/backgrounds/flow.mp4', thumb: '/backgrounds/flow-thumb.jpg' },
] as const;

export const DEFAULT_BACKGROUND = 'meadow';

export function isBackgroundId(id: unknown): id is string {
  return BACKGROUNDS.some(b => b.id === id) || VIDEO_BACKGROUNDS.some(v => v.id === id);
}

/** Paints a built-in background at the given size (default: full size). */
export function paintPreset(id: string, width = W, height = H): HTMLCanvasElement {
  const bg = BACKGROUNDS.find(b => b.id === id) ?? BACKGROUNDS[0];
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const g = c.getContext('2d')!;
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = <T,>(xs: readonly T[]) => xs[(rnd() * xs.length) | 0];
  const dab: Kit['dab'] = (x, y, rx, ry, col, a = 1, rot = 0) => {
    g.save();
    g.globalAlpha = a;
    g.fillStyle = col;
    g.translate(x, y);
    g.rotate(rot);
    g.beginPath();
    g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  };

  g.save();
  g.scale(width / W, height / H);
  bg.paint({ g, rnd, pick, dab });
  g.restore();

  // Fine grain so flat areas still show the refraction.
  const img = g.getImageData(0, 0, width, height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * bg.grain;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  return c;
}

function meadow({ g, rnd, pick, dab }: Kit) {
  const sky = g.createLinearGradient(0, 0, 0, H * 0.55);
  sky.addColorStop(0, '#a9bfb0');
  sky.addColorStop(0.45, '#d8cfa6');
  sky.addColorStop(1, '#c9bf9a');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 1200; i++) {
    dab(rnd() * W, rnd() * H * 0.5, 20 + rnd() * 60, 4 + rnd() * 7,
      pick(['#e6dcb4', '#b9c9b8', '#cfc49c', '#a6b8ad']), 0.25, (rnd() - 0.5) * 0.3);
  }

  // distant hills
  g.fillStyle = '#8c7f8f';
  g.beginPath();
  g.moveTo(0, H * 0.5);
  for (let x = 0; x <= W; x += 40) g.lineTo(x, H * 0.47 + Math.sin(x * 0.004) * 40 + rnd() * 10);
  g.lineTo(W, H);
  g.lineTo(0, H);
  g.fill();
  for (let i = 0; i < 600; i++) {
    dab(rnd() * W, H * 0.46 + rnd() * H * 0.1, 14 + rnd() * 34, 4 + rnd() * 7,
      pick(['#9a8d9b', '#7d7286', '#a39383', '#c0a48c']), 0.5);
  }

  // ground
  const ground = g.createLinearGradient(0, H * 0.55, 0, H);
  ground.addColorStop(0, '#5f7a45');
  ground.addColorStop(1, '#2f5a2c');
  g.fillStyle = ground;
  g.fillRect(0, H * 0.56, W, H * 0.44);
  for (let i = 0; i < 4000; i++) {
    dab(rnd() * W, H * 0.55 + rnd() * H * 0.45, 6 + rnd() * 20, 3 + rnd() * 9,
      pick(['#3f6b35', '#6c8a3e', '#2d4f2a', '#8fa34a', '#c9b843', '#567a3a']), 0.6, rnd() * 3);
  }

  // trees
  for (const [tx, ty, s] of [[0.22, 0.2, 0.8], [0.7, 0.12, 1], [0.9, 0.3, 0.6]] as const) {
    g.strokeStyle = '#6e4b3a';
    g.lineWidth = 22 * s;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(W * tx, H * 0.95);
    g.quadraticCurveTo(W * (tx - 0.01), H * 0.7, W * tx, H * (ty + 0.25));
    g.stroke();
    for (let i = 0; i < 1400 * s; i++) {
      const a = rnd() * Math.PI * 2;
      const rr = Math.sqrt(rnd());
      dab(W * tx + Math.cos(a) * rr * W * 0.12 * s, H * (ty + 0.12) + Math.sin(a) * rr * H * 0.18 * s,
        8 + rnd() * 22, 6 + rnd() * 14, pick(['#1f3a2a', '#2c4a31', '#143022', '#3d5e3a', '#4e6f3f']), 0.85, rnd() * 3);
    }
  }
}

function pool({ g, rnd, pick }: Kit) {
  const T = 60;
  for (let y = 0; y < H; y += T) {
    for (let x = 0; x < W; x += T) {
      g.fillStyle = pick(['#2b9ac4', '#2690bb', '#34a5cd', '#2286b3']);
      g.fillRect(x, y, T, T);
    }
  }
  // grout
  g.strokeStyle = '#c9eef7';
  g.lineWidth = 5;
  g.beginPath();
  for (let x = 0; x <= W; x += T) {
    g.moveTo(x, 0);
    g.lineTo(x, H);
  }
  for (let y = 0; y <= H; y += T) {
    g.moveTo(0, y);
    g.lineTo(W, y);
  }
  g.stroke();
  // lane marker
  g.fillStyle = '#163a6b';
  g.fillRect(0, H / 2 - T / 2, W, T);
  g.fillRect(W * 0.12, H / 2 - T * 2.5, T, T * 5);
  // caustics: bright wavy lines
  g.strokeStyle = 'rgba(235, 255, 255, 0.35)';
  g.lineWidth = 3;
  for (let i = 0; i < 90; i++) {
    let x = rnd() * W;
    let y = rnd() * H;
    g.beginPath();
    g.moveTo(x, y);
    for (let j = 0; j < 6; j++) {
      const nx = x + (rnd() - 0.5) * 160;
      const ny = y + (rnd() - 0.5) * 160;
      g.quadraticCurveTo(x + (rnd() - 0.5) * 120, y + (rnd() - 0.5) * 120, nx, ny);
      x = nx;
      y = ny;
    }
    g.stroke();
  }
}

function city({ g, rnd, pick }: Kit) {
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#070b1f');
  sky.addColorStop(0.6, '#2a1c4a');
  sky.addColorStop(1, '#4b2547');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);

  // two rows of buildings, the back row lighter
  for (const [base, shade, lit] of [[0.42, '#1a1838', 0.25], [0.3, '#0c0d1c', 0.4]] as const) {
    let x = -20;
    while (x < W) {
      const bw = 70 + rnd() * 150;
      const top = H * base + rnd() * H * 0.3;
      g.fillStyle = shade;
      g.fillRect(x, top, bw, H - top);
      for (let wy = top + 14; wy < H - 10; wy += 26) {
        for (let wx = x + 10; wx < x + bw - 14; wx += 20) {
          if (rnd() < lit) {
            g.fillStyle = pick(['#ffd27a', '#ffb347', '#fff1c1', '#9fd3ff']);
            g.fillRect(wx, wy, 10, 14);
          }
        }
      }
      x += bw + 4;
    }
  }

  // out-of-focus lights
  for (let i = 0; i < 140; i++) {
    const x = rnd() * W;
    const y = rnd() * H * 0.75;
    const r = 12 + rnd() * 50;
    const col = pick(['255,120,180', '255,200,110', '120,200,255', '180,140,255']);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(${col},0.55)`);
    grd.addColorStop(0.7, `rgba(${col},0.35)`);
    grd.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
}

function sunset({ g, rnd, pick }: Kit) {
  const hz = H * 0.55;
  const sky = g.createLinearGradient(0, 0, 0, hz);
  sky.addColorStop(0, '#2b1a4a');
  sky.addColorStop(0.55, '#d6526b');
  sky.addColorStop(1, '#f7b267');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, hz);

  const sx = W * 0.5;
  const glow = g.createRadialGradient(sx, hz, 0, sx, hz, 520);
  glow.addColorStop(0, 'rgba(255, 220, 140, 0.8)');
  glow.addColorStop(1, 'rgba(255, 220, 140, 0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, hz);
  g.fillStyle = '#ffe3a0';
  g.beginPath();
  g.arc(sx, hz, 150, Math.PI, 0);
  g.fill();

  const sea = g.createLinearGradient(0, hz, 0, H);
  sea.addColorStop(0, '#5a3466');
  sea.addColorStop(1, '#140f2b');
  g.fillStyle = sea;
  g.fillRect(0, hz, W, H - hz);

  // reflection of the sun, narrowing toward the horizon
  for (let i = 0; i < 700; i++) {
    const t = rnd();
    const y = hz + 6 + t * (H - hz);
    const spread = 120 + t * 420;
    const x = sx + (rnd() - 0.5) * 2 * spread * rnd();
    g.globalAlpha = 0.25 + rnd() * 0.6;
    g.fillStyle = pick(['#ffd88a', '#ffb36b', '#ffeccc']);
    g.fillRect(x, y, 20 + rnd() * 70 * (0.3 + t), 2 + t * 4);
  }
  // swell lines across the water
  g.globalAlpha = 0.18;
  g.fillStyle = '#b77aa8';
  for (let i = 0; i < 400; i++) {
    const t = rnd();
    g.fillRect(rnd() * W, hz + t * t * (H - hz), 40 + rnd() * 160, 2 + t * 3);
  }
  g.globalAlpha = 1;
}

function neon({ g, rnd }: Kit) {
  const hz = H * 0.52;
  g.fillStyle = '#0a0420';
  g.fillRect(0, 0, W, H);
  const sky = g.createLinearGradient(0, 0, 0, hz);
  sky.addColorStop(0, '#0a0420');
  sky.addColorStop(1, '#3a0b4f');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, hz);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.7})`;
    g.fillRect(rnd() * W, rnd() * hz * 0.8, 2 + rnd() * 2, 2 + rnd() * 2);
  }

  // striped sun
  const sx = W / 2;
  const sy = hz - 40;
  const R = 230;
  const sun = g.createLinearGradient(0, sy - R, 0, sy + R);
  sun.addColorStop(0, '#ffe45e');
  sun.addColorStop(1, '#ff3fa4');
  g.fillStyle = sun;
  g.beginPath();
  g.arc(sx, sy, R, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#2a0940';
  for (let i = 0; i < 7; i++) {
    const y = sy + 20 + i * 30;
    g.fillRect(sx - R, y, R * 2, 4 + i * 2.5);
  }
  g.fillStyle = '#0a0420';
  g.fillRect(0, hz, W, H - hz);

  // perspective grid
  g.strokeStyle = '#ff3fd0';
  g.shadowColor = '#ff3fd0';
  g.shadowBlur = 14;
  g.lineWidth = 3;
  g.beginPath();
  for (let i = 1; i <= 16; i++) {
    const y = hz + (H - hz) * (i / 16) ** 2;
    g.moveTo(0, y);
    g.lineTo(W, y);
  }
  for (let i = -20; i <= 20; i++) {
    g.moveTo(sx + i * 30, hz);
    g.lineTo(sx + i * 260, H);
  }
  g.stroke();
  g.shadowBlur = 0;
  g.strokeStyle = '#7af7ff';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(0, hz);
  g.lineTo(W, hz);
  g.stroke();
}

function leaves({ g, rnd, pick }: Kit) {
  const water = g.createLinearGradient(0, 0, W, H);
  water.addColorStop(0, '#0f2830');
  water.addColorStop(1, '#0a1a22');
  g.fillStyle = water;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 520; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const len = 30 + rnd() * 40;
    const rot = rnd() * Math.PI * 2;
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    // pointed leaf from two curves
    g.fillStyle = pick(['#e0662b', '#c9402a', '#f2a93b', '#a8462a', '#e8c547', '#8a3a1f']);
    g.beginPath();
    g.moveTo(-len, 0);
    g.quadraticCurveTo(0, -len * 0.55, len, 0);
    g.quadraticCurveTo(0, len * 0.55, -len, 0);
    g.fill();
    g.strokeStyle = 'rgba(70, 25, 10, 0.6)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-len * 1.15, 0);
    g.lineTo(len * 0.9, 0);
    g.stroke();
    g.restore();
  }
}

function pebbles({ g, rnd, pick, dab }: Kit) {
  g.fillStyle = '#5c544d';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 1100; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const rx = 18 + rnd() * 34;
    const ry = rx * (0.55 + rnd() * 0.35);
    const rot = rnd() * Math.PI;
    dab(x + 4, y + 6, rx, ry, '#2b2622', 0.5, rot);
    dab(x, y, rx, ry, pick(['#b9b2a6', '#8f877c', '#d6cfc2', '#a49786', '#77706a', '#c4ab8e']), 1, rot);
    dab(x - rx * 0.25, y - ry * 0.3, rx * 0.5, ry * 0.35, '#ffffff', 0.18, rot);
  }
}

function stripes({ g }: Kit) {
  const cols = ['#ff5c8a', '#ffd166', '#06d6a0', '#118ab2', '#f8f4e3', '#ef476f', '#7b5cff'];
  const band = 70;
  g.save();
  g.translate(W / 2, H / 2);
  g.rotate(-Math.PI / 5);
  const span = Math.hypot(W, H);
  for (let i = 0, x = -span / 2; x < span / 2; i++, x += band) {
    g.fillStyle = cols[i % cols.length];
    g.fillRect(x, -span / 2, band, span);
  }
  g.restore();
}
