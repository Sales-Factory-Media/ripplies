/** Paints a painterly landscape so the demo needs no image asset. */
export function paintBackground(W = 1800, H = 1200): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = <T,>(xs: T[]) => xs[(rnd() * xs.length) | 0];

  const dab = (x: number, y: number, rx: number, ry: number, col: string, a = 1, rot = 0) => {
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

  // canvas grain
  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * 18;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  return c;
}
