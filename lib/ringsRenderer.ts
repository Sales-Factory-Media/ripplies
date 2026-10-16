/**
 * Expanding water rings over an image (WebGL1, analytic — no simulation).
 *
 * The surface is a train of travelling wave crests around a centre point.
 * Up to MAX_LAYERS centres can be stacked; their distortions add up.
 * The image is refracted by the surface slope, so the distortion lives on
 * both sides of every crest, and lit from the surface normal.
 */

export type RingParams = {
  speed: number;
  spacing: number;
  strength: number;
  crest: number;
  wobble: number;
  rim: number;
  chroma: number;
};

export const RING_CONTROLS: { key: keyof RingParams; label: string; min: number; max: number; step: number }[] = [
  { key: 'speed', label: 'Speed', min: 0, max: 1.5, step: 0.01 },
  { key: 'spacing', label: 'Ring spacing', min: 0.1, max: 1, step: 0.01 },
  { key: 'strength', label: 'Refraction', min: 0, max: 1.2, step: 0.01 },
  { key: 'crest', label: 'Wave front width', min: 0.02, max: 0.4, step: 0.01 },
  { key: 'wobble', label: 'Glass texture', min: 0, max: 2, step: 0.01 },
  { key: 'rim', label: 'Rim highlight', min: 0, max: 1.5, step: 0.01 },
  { key: 'chroma', label: 'Chromatic split', min: 0, max: 1, step: 0.01 },
];

export const RING_DEFAULTS: RingParams = {
  speed: 0.35,
  spacing: 0.15,
  strength: 0.96,
  crest: 0.2,
  wobble: 0.47,
  rim: 0.68,
  chroma: 0.25,
};

export type Point = { x: number; y: number }; // canvas uv, y up

/** The shape the waves take around each centre. The order matches uShape in the shader. */
export const WAVE_SHAPES = [
  { value: 'circle', label: 'Circles' },
  { value: 'square', label: 'Squares' },
  { value: 'diamond', label: 'Diamonds' },
  { value: 'hexagon', label: 'Hexagons' },
  { value: 'flower', label: 'Flower' },
  { value: 'star', label: 'Star' },
  { value: 'spiral', label: 'Spiral' },
  { value: 'lines', label: 'Straight lines' },
] as const;
export type WaveShape = (typeof WAVE_SHAPES)[number]['value'];

/** How many ring centres the shader can stack. */
export const MAX_LAYERS = 24;

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
#define MAX_LAYERS ${MAX_LAYERS}
varying vec2 vUv;
uniform sampler2D uImg;
uniform vec2  uRes;       // canvas size in px
uniform vec2  uImgSize;   // image size in px
uniform vec2  uCenters[MAX_LAYERS]; // ripple centres in canvas uv (y up)
uniform int   uCount;     // how many of uCenters are in use
uniform float uTime;      // already scaled by speed
uniform float uSpacing;   // ring spacing, in units of the shorter canvas side
uniform float uStrength;  // refraction amount
uniform float uWobble;    // fine rippled-glass texture
uniform float uRim;       // rim highlight
uniform float uChroma;    // chromatic split
uniform float uCrest;     // width of a wave's leading face (ring units)
uniform int   uShape;     // index into WAVE_SHAPES

// object-fit: cover
vec2 coverUv(vec2 uv) {
  float ca = uRes.x / uRes.y, ia = uImgSize.x / uImgSize.y;
  vec2 s = ca > ia ? vec2(1.0, ia / ca) : vec2(ca / ia, 1.0);
  vec2 c = (uv - 0.5) * s + 0.5;
  return 1.0 - abs(1.0 - mod(c, 2.0));        // mirror at the edges instead of smearing
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

// Distance from the centre for the chosen wave shape (waves sit at equal
// steps of it), and its gradient g: the way the waves travel at p.
float shapeDist(vec2 p, float r, vec2 rh, out vec2 g) {
  vec2 th = vec2(-rh.y, rh.x);
  vec2 sg = vec2(p.x >= 0.0 ? 1.0 : -1.0, p.y >= 0.0 ? 1.0 : -1.0);
  vec2 ap = abs(p);
  if (uShape == 1) {                          // square
    if (ap.x > ap.y) { g = vec2(sg.x, 0.0); return ap.x; }
    g = vec2(0.0, sg.y); return ap.y;
  }
  if (uShape == 2) {                          // diamond
    g = sg * 0.7071; return (ap.x + ap.y) * 0.7071;
  }
  if (uShape == 3) {                          // hexagon, flat top and bottom
    float a = ap.x * 0.8660 + ap.y * 0.5;
    if (a > ap.y) { g = vec2(sg.x * 0.8660, sg.y * 0.5); return a; }
    g = vec2(0.0, sg.y); return ap.y;
  }
  if (uShape == 4 || uShape == 5) {           // flower (6 soft petals) or star (5 points)
    float k = uShape == 4 ? 6.0 : 5.0;
    float a = uShape == 4 ? 0.18 : 0.32;
    float t = atan(p.y, p.x);
    float f = 1.0 - a * cos(k * t);
    g = f * rh + a * k * sin(k * t) * th; return r * f;
  }
  if (uShape == 6) {                          // spiral: one wave winding outward
    g = rh + th * uSpacing / (6.2832 * max(r, 1e-3));
    return r + uSpacing * atan(p.y, p.x) / 6.2832;
  }
  if (uShape == 7) {                          // straight lines, moving away from the centre line
    g = vec2(0.0, sg.y); return ap.y;
  }
  g = rh; return r;                           // circle
}

// One wave crest as a function of signed distance d from it (in ring units,
// positive = outward, ahead of the crest). Steep leading face, long gentle
// back slope, rounded top. Continuous with zero slope at the peak.
float crest(float d) {
  float w = d > 0.0 ? uCrest : 0.4;
  return exp(-(sqrt(d * d + 0.0004) - 0.02) / w);
}
// Sum of the nearby crests. Crests sit at integer s.
float waveHeight(float s) {
  float f = fract(s);
  return crest(f + 1.0) + crest(f) + crest(f - 1.0) + crest(f - 2.0) + crest(f - 3.0);
}

void main() {
  float m = min(uRes.x, uRes.y);
  vec2 toPx = uRes / m;                       // uv -> isotropic units

  // Each layer adds to the sample offset, the chromatic split, the surface
  // slope (for lighting) and the glints.
  vec2 off = vec2(0.0);
  vec2 ca = vec2(0.0);
  vec2 grad = vec2(0.0);
  float glint = 0.0;
  for (int i = 0; i < MAX_LAYERS; i++) {
    if (i >= uCount) break;
    vec2 p = (vUv - uCenters[i]) * toPx;
    float r = length(p);
    vec2 g;
    float d = shapeDist(p, r, r > 1e-5 ? p / r : vec2(0.0, 1.0), g);
    vec2 dir = length(g) > 1e-5 ? normalize(g) : vec2(0.0, 1.0);
    vec2 tan = vec2(-dir.y, dir.x);

    float s = d / uSpacing - uTime;
    // The spiral has no separate rings; a ring number there would put a seam in the texture.
    float ring = uShape == 6 ? 0.0 : floor(s);
    float nd = uShape == 6 ? r : d;           // texture coordinate along the waves, seam-free
    float h = waveHeight(s);
    float ds = 0.004;
    float slope = (waveHeight(s + ds) - waveHeight(s - ds)) / (2.0 * ds);   // dh/ds

    float fadeIn = smoothstep(0.0, uSpacing * 0.9, r);   // calm at the source
    float disp = uStrength * uSpacing * 0.06 * slope * fadeIn;

    // Fine rippled-glass texture: radial streaks, everywhere, strongest on the waves.
    float theta = atan(p.y, p.x);
    float n1 = vnoise(vec2(theta * 70.0, nd * 18.0 - uTime * 3.0 + ring * 13.0));
    float n2 = vnoise(vec2(theta * 160.0 + 3.0, nd * 60.0 + ring * 7.0));
    float tex = (n1 - 0.5) * 0.7 + (n2 - 0.5) * 0.3;
    float texAmt = uWobble * 0.01 * fadeIn * (0.3 + 0.7 * clamp(h, 0.0, 1.0));
    vec2 wob = (dir * tex + tan * (vnoise(vec2(theta * 90.0, nd * 30.0 + ring)) - 0.5) * 0.6) * texAmt;

    off += wob - dir * disp;
    ca += dir * uChroma * 0.25 * disp;        // chromatic split follows the refraction
    grad += dir * slope * fadeIn;
    glint += pow(max(0.0, tex + 0.15), 2.0) * clamp(h, 0.0, 1.0) * 0.2 * uWobble * fadeIn;
  }

  vec3 col;
  col.r = texture2D(uImg, coverUv(vUv + (off + ca) / toPx)).r;
  col.g = texture2D(uImg, coverUv(vUv + off / toPx)).g;
  col.b = texture2D(uImg, coverUv(vUv + (off - ca) / toPx)).b;

  // Lighting from the surface normal: slopes facing the light glint,
  // slopes facing away dim only slightly (never a black band).
  vec3 n = normalize(vec3(-grad * 0.06 * (0.4 + uStrength), 1.0));
  vec3 L = normalize(vec3(-0.35, 0.75, 0.6));
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float diff = (dot(n, L) - L.z) * 0.35;
  float spec = max(0.0, pow(max(dot(n, H), 0.0), 220.0) - pow(H.z, 220.0));
  col = col * (1.0 + diff) + spec * uRim * 0.9 + glint;

  gl_FragColor = vec4(col, 1.0);
}`;

const UNIFORMS = ['uImg', 'uRes', 'uImgSize', 'uCenters', 'uCount', 'uTime', 'uSpacing', 'uStrength', 'uWobble', 'uRim', 'uChroma', 'uCrest', 'uShape'] as const;

export class RingsRenderer {
  readonly supported: boolean;
  /** Where each ring centre should head (one per layer, up to MAX_LAYERS); read every frame and eased toward. */
  goals: () => Point[] = () => [{ x: 0.5, y: 0.5 }];
  /** The shape of the waves. */
  shape: WaveShape = 'circle';
  /** Multiplies the speed param, e.g. to slow things down for prefers-reduced-motion. */
  speedScale = 1;
  private gl!: WebGLRenderingContext;
  private prog!: WebGLProgram;
  private buf!: WebGLBuffer;
  private tex!: WebGLTexture;
  private U = {} as Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>;
  private params: RingParams = { ...RING_DEFAULTS };
  private centers: Point[] = [];
  private centerData = new Float32Array(MAX_LAYERS * 2);
  private imgW = 1;
  private imgH = 1;
  private video: HTMLVideoElement | null = null;
  private phase = 0;
  private raf = 0;
  private last = 0;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: false });
    if (!gl) {
      this.supported = false;
      return;
    }
    this.supported = true;
    this.gl = gl;

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'shader compile failed');
      return sh;
    };
    this.prog = gl.createProgram()!;
    gl.attachShader(this.prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(this.prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.bindAttribLocation(this.prog, 0, 'aPos');
    gl.linkProgram(this.prog);
    if (!gl.getProgramParameter(this.prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.prog) ?? 'link failed');
    for (const n of UNIFORMS) this.U[n] = gl.getUniformLocation(this.prog, n);

    this.buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  setParams(params: RingParams) {
    this.params = params;
  }

  /** Throws if the image is cross-origin tainted. */
  setImage(source: HTMLImageElement | HTMLCanvasElement) {
    if (!this.supported) return;
    this.video = null;
    const gl = this.gl;
    let w = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
    let h = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
    let src: TexImageSource = source;
    const maxTex = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE) as number, 4096);
    if (Math.max(w, h) > maxTex) {
      // Downscale oversized photos.
      const k = maxTex / Math.max(w, h);
      const c = document.createElement('canvas');
      c.width = Math.round(w * k);
      c.height = Math.round(h * k);
      c.getContext('2d')!.drawImage(source, 0, 0, c.width, c.height);
      src = c;
      w = c.width;
      h = c.height;
    }
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, src);
    this.imgW = w;
    this.imgH = h;
  }

  /**
   * Shows a video behind the rings; its current frame is copied to the GPU every
   * frame. The caller plays, pauses and cleans up the element. Throws on the
   * first frame if the video is cross-origin tainted.
   */
  setVideo(video: HTMLVideoElement) {
    if (!this.supported) return;
    this.video = video;
    this.uploadVideoFrame();
  }

  private uploadVideoFrame() {
    const v = this.video;
    if (!v || v.readyState < v.HAVE_CURRENT_DATA || !v.videoWidth) return; // not ready yet: keep the last picture
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, v);
    } catch (err) {
      // Cross-origin video: drop it rather than break the animation loop.
      console.warn('Video cannot be used as a texture', err);
      this.video = null;
      return;
    }
    this.imgW = v.videoWidth;
    this.imgH = v.videoHeight;
  }

  resize() {
    if (!this.supported) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.canvas.clientWidth * dpr);
    this.canvas.height = Math.round(this.canvas.clientHeight * dpr);
  }

  start() {
    if (!this.supported || this.raf) return;
    this.last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.draw(dt);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (!this.supported) return;
    // No WEBGL_lose_context: React StrictMode remounts on the same canvas.
    this.gl.deleteProgram(this.prog);
    this.gl.deleteBuffer(this.buf);
    this.gl.deleteTexture(this.tex);
  }

  private draw(dt: number) {
    const gl = this.gl;
    const p = this.params;
    this.phase += dt * p.speed * this.speedScale;

    // New layers start at their goal; dropped layers are forgotten.
    const goals = this.goals().slice(0, MAX_LAYERS);
    this.centers.length = goals.length;
    const k = 1 - Math.exp(-dt * 6);
    goals.forEach((goal, i) => {
      const c = (this.centers[i] ??= { ...goal });
      c.x += (goal.x - c.x) * k;
      c.y += (goal.y - c.y) * k;
      this.centerData[i * 2] = c.x;
      this.centerData[i * 2 + 1] = c.y;
    });

    this.uploadVideoFrame();
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);

    const U = this.U;
    gl.uniform1i(U.uImg, 0);
    gl.uniform2f(U.uRes, this.canvas.width, this.canvas.height);
    gl.uniform2f(U.uImgSize, this.imgW, this.imgH);
    gl.uniform2fv(U.uCenters, this.centerData);
    gl.uniform1i(U.uCount, goals.length);
    gl.uniform1f(U.uTime, this.phase);
    gl.uniform1f(U.uSpacing, p.spacing);
    gl.uniform1f(U.uStrength, p.strength);
    gl.uniform1f(U.uWobble, p.wobble);
    gl.uniform1f(U.uRim, p.rim);
    gl.uniform1f(U.uChroma, p.chroma);
    gl.uniform1f(U.uCrest, p.crest);
    gl.uniform1i(U.uShape, Math.max(0, WAVE_SHAPES.findIndex(w => w.value === this.shape)));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
