/**
 * Expanding water rings over an image (WebGL1, analytic — no simulation).
 *
 * The surface is a train of travelling wave crests around a centre point.
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

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uImg;
uniform vec2  uRes;       // canvas size in px
uniform vec2  uImgSize;   // image size in px
uniform vec2  uCenter;    // ripple centre in canvas uv (y up)
uniform float uTime;      // already scaled by speed
uniform float uSpacing;   // ring spacing, in units of the shorter canvas side
uniform float uStrength;  // refraction amount
uniform float uWobble;    // fine rippled-glass texture
uniform float uRim;       // rim highlight
uniform float uChroma;    // chromatic split
uniform float uCrest;     // width of a wave's leading face (ring units)

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
  vec2 p = (vUv - uCenter) * toPx;
  float r = length(p);
  vec2 dir = r > 1e-5 ? p / r : vec2(0.0, 1.0);
  vec2 tan = vec2(-dir.y, dir.x);

  float s = r / uSpacing - uTime;
  float ring = floor(s);
  float h = waveHeight(s);
  float ds = 0.004;
  float slope = (waveHeight(s + ds) - waveHeight(s - ds)) / (2.0 * ds);   // dh/ds

  float fadeIn = smoothstep(0.0, uSpacing * 0.9, r);   // calm at the source
  float disp = uStrength * uSpacing * 0.06 * slope * fadeIn;

  // Fine rippled-glass texture: radial streaks, everywhere, strongest on the waves.
  float theta = atan(p.y, p.x);
  float n1 = vnoise(vec2(theta * 70.0, r * 18.0 - uTime * 3.0 + ring * 13.0));
  float n2 = vnoise(vec2(theta * 160.0 + 3.0, r * 60.0 + ring * 7.0));
  float tex = (n1 - 0.5) * 0.7 + (n2 - 0.5) * 0.3;
  float texAmt = uWobble * 0.01 * fadeIn * (0.3 + 0.7 * clamp(h, 0.0, 1.0));
  vec2 wob = (dir * tex + tan * (vnoise(vec2(theta * 90.0, r * 30.0 + ring)) - 0.5) * 0.6) * texAmt;

  vec2 q = p - dir * disp + wob;

  // Chromatic split follows the refraction.
  vec2 ca = dir * uChroma * 0.25 * disp;
  vec2 base = uCenter;
  vec3 col;
  col.r = texture2D(uImg, coverUv(base + (q + ca) / toPx)).r;
  col.g = texture2D(uImg, coverUv(base + q / toPx)).g;
  col.b = texture2D(uImg, coverUv(base + (q - ca) / toPx)).b;

  // Lighting from the surface normal: slopes facing the light glint,
  // slopes facing away dim only slightly (never a black band).
  vec2 grad = dir * slope * fadeIn;
  vec3 n = normalize(vec3(-grad * 0.06 * (0.4 + uStrength), 1.0));
  vec3 L = normalize(vec3(-0.35, 0.75, 0.6));
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float diff = (dot(n, L) - L.z) * 0.35;
  float spec = max(0.0, pow(max(dot(n, H), 0.0), 220.0) - pow(H.z, 220.0));
  float glint = pow(max(0.0, tex + 0.15), 2.0) * clamp(h, 0.0, 1.0) * 0.2 * uWobble * fadeIn;
  col = col * (1.0 + diff) + spec * uRim * 0.9 + glint;

  gl_FragColor = vec4(col, 1.0);
}`;

const UNIFORMS = ['uImg', 'uRes', 'uImgSize', 'uCenter', 'uTime', 'uSpacing', 'uStrength', 'uWobble', 'uRim', 'uChroma', 'uCrest'] as const;

export class RingsRenderer {
  readonly supported: boolean;
  /** Where the ring centre should head; read every frame and eased toward. */
  goal: () => Point = () => ({ x: 0.5, y: 0.5 });
  /** Multiplies the speed param, e.g. to slow things down for prefers-reduced-motion. */
  speedScale = 1;
  private gl!: WebGLRenderingContext;
  private prog!: WebGLProgram;
  private buf!: WebGLBuffer;
  private tex!: WebGLTexture;
  private U = {} as Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>;
  private params: RingParams = { ...RING_DEFAULTS };
  private center: Point | null = null;
  private imgW = 1;
  private imgH = 1;
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

    const goal = this.goal();
    if (!this.center) this.center = { ...goal };
    const k = 1 - Math.exp(-dt * 6);
    this.center.x += (goal.x - this.center.x) * k;
    this.center.y += (goal.y - this.center.y) * k;

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
    gl.uniform2f(U.uCenter, this.center.x, this.center.y);
    gl.uniform1f(U.uTime, this.phase);
    gl.uniform1f(U.uSpacing, p.spacing);
    gl.uniform1f(U.uStrength, p.strength);
    gl.uniform1f(U.uWobble, p.wobble);
    gl.uniform1f(U.uRim, p.rim);
    gl.uniform1f(U.uChroma, p.chroma);
    gl.uniform1f(U.uCrest, p.crest);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
