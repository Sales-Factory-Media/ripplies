/**
 * GPU water-ripple engine.
 *
 * A 2D wave equation is solved on a grid that covers the viewport plus an
 * off-screen margin. Every obstacle (rounded rect) is a solid wall, so waves
 * reflect off it. The margin is a "sponge" that soaks waves up, so they leave
 * the screen instead of bouncing back. A small global damping makes everything
 * subside. The background image is drawn refracted by the water's slope.
 */

export type Obstacle = { x: number; y: number; w: number; h: number; r: number }; // CSS px, viewport coords

export type RippleOptions = {
  cellPx: number;        // CSS px per simulation cell (lower = finer, heavier)
  marginPx: number;      // off-screen sponge width in CSS px
  stepsPerSecond: number;// simulation speed (wave speed ∝ this)
  damping: number;       // per-step energy retention on screen (0.99–1)
  pulseAmp: number;      // height of a click pulse
  pulseWidthPx: number;  // thickness of a click pulse
  refractPx: number;     // image displacement per unit slope
  specular: number;      // crest highlight strength
  chroma: number;        // chromatic split (0–1)
};

export const DEFAULT_OPTIONS: RippleOptions = {
  cellPx: 3,
  marginPx: 260,
  stepsPerSecond: 300,
  damping: 0.999,
  pulseAmp: 1.8,
  pulseWidthPx: 14,
  refractPx: 150,
  specular: 0.6,
  chroma: 0.25,
};

const MAX_OBSTACLES = 12;

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const SIM_FRAG = `#version 300 es
precision highp float;
#define MAXR ${MAX_OBSTACLES}
uniform sampler2D uState;      // r = height now, g = height one step ago
uniform vec2  uSize;           // grid size in cells
uniform vec4  uRects[MAXR];    // x, y (bottom-left, y up), w, h — in cells
uniform float uRadii[MAXR];
uniform int   uCount;
uniform float uSponge;         // sponge width in cells
uniform float uDamping;
uniform float uC2;             // (c·dt/dx)², must stay < 0.5
uniform int   uPulse;          // obstacle index to emit from, or -1
uniform float uPulseAmp;
uniform float uPulseWidth;     // in cells
out vec4 o;

float sdRoundRect(vec2 p, vec4 R, float r) {
  vec2 hs = R.zw * 0.5;
  vec2 q = abs(p - (R.xy + hs)) - hs + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  ivec2 mx = ivec2(uSize) - 1;
  vec4 s = texelFetch(uState, c, 0);
  float h = s.r, hp = s.g;
  float l = texelFetch(uState, clamp(c + ivec2(-1, 0), ivec2(0), mx), 0).r;
  float r = texelFetch(uState, clamp(c + ivec2( 1, 0), ivec2(0), mx), 0).r;
  float d = texelFetch(uState, clamp(c + ivec2(0, -1), ivec2(0), mx), 0).r;
  float u = texelFetch(uState, clamp(c + ivec2(0,  1), ivec2(0), mx), 0).r;

  float hn = 2.0 * h - hp + uC2 * (l + r + u + d - 4.0 * h);

  // Sponge: damping ramps up toward the outer edge of the off-screen margin.
  vec2 p = gl_FragCoord.xy;
  float edge = min(min(p.x, uSize.x - p.x), min(p.y, uSize.y - p.y));
  float k = smoothstep(0.0, 1.0, edge / uSponge);
  hn *= mix(0.88, uDamping, k);

  // Obstacles are rigid walls: the surface inside them is pinned flat.
  float sd = 1e9;
  for (int i = 0; i < MAXR; i++) {
    if (i >= uCount) break;
    sd = min(sd, sdRoundRect(p, uRects[i], uRadii[i]));
  }
  if (sd < 0.0) {
    hn = 0.0; h = 0.0;
  } else if (uPulse >= 0) {
    // A band of raised water hugging the clicked box's outline, launched
    // already moving outward: the "previous" frame holds the same band one
    // step closer to the box. (A still bump would split in two, and the inward
    // half would bounce off the box inverted and cancel the outward one.)
    float dp = sdRoundRect(p, uRects[uPulse], uRadii[uPulse]);
    float c0 = uPulseWidth * 1.5;
    float stepLen = sqrt(uC2);
    hn += uPulseAmp * exp(-pow((dp - c0) / uPulseWidth, 2.0));
    h  += uPulseAmp * exp(-pow((dp - c0 + stepLen) / uPulseWidth, 2.0));
  }

  o = vec4(clamp(hn, -6.0, 6.0), h, 0.0, 1.0);
}`;

const DISPLAY_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uState;
uniform sampler2D uImg;
uniform vec2  uView;      // viewport in CSS px
uniform vec2  uImgSize;
uniform vec2  uSimSize;   // grid size in cells
uniform float uCell;      // CSS px per cell
uniform float uMargin;    // CSS px
uniform float uRefract;
uniform float uSpec;
uniform float uChroma;

vec2 cover(vec2 uv) {
  float ca = uView.x / uView.y, ia = uImgSize.x / uImgSize.y;
  vec2 s = ca > ia ? vec2(1.0, ia / ca) : vec2(ca / ia, 1.0);
  vec2 c = (uv - 0.5) * s + 0.5;
  return 1.0 - abs(1.0 - mod(c, 2.0));   // mirror past the edges
}

float H(vec2 cell) { return texture(uState, cell / uSimSize).r; }

void main() {
  vec2 px = vUv * uView;
  vec2 cell = (px + uMargin) / uCell;
  vec2 g = 0.5 * vec2(H(cell + vec2(1, 0)) - H(cell - vec2(1, 0)),
                      H(cell + vec2(0, 1)) - H(cell - vec2(0, 1)));   // slope per cell

  vec2 disp = -g * uRefract / uView;
  vec2 ca = disp * uChroma;
  vec3 col;
  col.r = texture(uImg, cover(vUv + disp + ca)).r;
  col.g = texture(uImg, cover(vUv + disp)).g;
  col.b = texture(uImg, cover(vUv + disp - ca)).b;

  vec3 n = normalize(vec3(-g * 4.0, 1.0));
  vec3 L = normalize(vec3(-0.35, 0.75, 0.6));
  vec3 Hv = normalize(L + vec3(0.0, 0.0, 1.0));
  float diff = (dot(n, L) - L.z) * 0.35;
  float spec = max(0.0, pow(max(dot(n, Hv), 0.0), 200.0) - pow(Hv.z, 200.0));
  o = vec4(col * (1.0 + diff) + spec * uSpec, 1.0);
}`;

type Uniforms = Record<string, WebGLUniformLocation | null>;

export class RippleEngine {
  readonly supported: boolean;
  private gl!: WebGL2RenderingContext;
  private opts: RippleOptions;
  private simProg!: WebGLProgram;
  private dispProg!: WebGLProgram;
  private simU: Uniforms = {};
  private dispU: Uniforms = {};
  private vao!: WebGLVertexArrayObject;
  private state: WebGLTexture[] = [];
  private fbos: WebGLFramebuffer[] = [];
  private cur = 0;
  private simW = 0;
  private simH = 0;
  private viewW = 1;
  private viewH = 1;
  private imgTex!: WebGLTexture;
  private imgW = 1;
  private imgH = 1;
  private obstacles: Obstacle[] = [];
  private pulses: { index: number; amp: number }[] = [];
  private raf = 0;
  private last = 0;
  private acc = 0;

  constructor(private canvas: HTMLCanvasElement, options: Partial<RippleOptions> = {}) {
    this.opts = { ...DEFAULT_OPTIONS, ...options };
    const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false });
    // Rendering into half-float textures needs this extension (near-universal on WebGL2).
    if (!gl || !gl.getExtension('EXT_color_buffer_float')) {
      this.supported = false;
      return;
    }
    this.gl = gl;
    this.simProg = this.program(SIM_FRAG);
    this.dispProg = this.program(DISPLAY_FRAG);
    for (const n of ['uState', 'uSize', 'uRects', 'uRadii', 'uCount', 'uSponge', 'uDamping', 'uC2', 'uPulse', 'uPulseAmp', 'uPulseWidth']) {
      this.simU[n] = gl.getUniformLocation(this.simProg, n);
    }
    for (const n of ['uState', 'uImg', 'uView', 'uImgSize', 'uSimSize', 'uCell', 'uMargin', 'uRefract', 'uSpec', 'uChroma']) {
      this.dispU[n] = gl.getUniformLocation(this.dispProg, n);
    }

    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.imgTex = this.texture(gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([20, 30, 25, 255]));

    this.supported = this.resize();
  }

  setOptions(options: Partial<RippleOptions>) {
    const resizeNeeded = options.cellPx !== undefined || options.marginPx !== undefined;
    this.opts = { ...this.opts, ...options };
    if (resizeNeeded) this.resize();
  }

  setBackground(source: TexImageSource, width: number, height: number) {
    if (!this.supported) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.imgTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    this.imgW = width;
    this.imgH = height;
  }

  /** Obstacles in CSS px, viewport coordinates (as from getBoundingClientRect). */
  setObstacles(obstacles: Obstacle[]) {
    this.obstacles = obstacles.slice(0, MAX_OBSTACLES);
  }

  /** Emit a ripple from the outline of obstacle `index`. */
  pulse(index: number, amp = this.opts.pulseAmp) {
    if (index >= 0 && index < this.obstacles.length) this.pulses.push({ index, amp });
  }

  /** Re-fit canvas and grid to the canvas' CSS size. Clears the water. */
  resize(): boolean {
    const gl = this.gl;
    if (!gl) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.viewW = Math.max(1, this.canvas.clientWidth);
    this.viewH = Math.max(1, this.canvas.clientHeight);
    this.canvas.width = Math.round(this.viewW * dpr);
    this.canvas.height = Math.round(this.viewH * dpr);

    const { cellPx, marginPx } = this.opts;
    this.simW = Math.ceil((this.viewW + 2 * marginPx) / cellPx);
    this.simH = Math.ceil((this.viewH + 2 * marginPx) / cellPx);

    this.state.forEach(t => gl.deleteTexture(t));
    this.fbos.forEach(f => gl.deleteFramebuffer(f));
    this.state = [];
    this.fbos = [];
    for (let i = 0; i < 2; i++) {
      const t = this.texture(gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, this.simW, this.simH, 0, gl.RGBA, gl.HALF_FLOAT, null);
      const f = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) return false;
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.state.push(t);
      this.fbos.push(f);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return true;
  }

  start() {
    if (!this.supported || this.raf) return;
    this.last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.acc += dt * this.opts.stepsPerSecond;
      const steps = Math.min(16, Math.floor(this.acc));
      this.acc -= Math.floor(this.acc);
      for (let i = 0; i < steps; i++) this.step();
      this.render();
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  destroy() {
    this.stop();
    if (!this.supported) return;
    const gl = this.gl;
    this.state.forEach(t => gl.deleteTexture(t));
    this.fbos.forEach(f => gl.deleteFramebuffer(f));
    gl.deleteTexture(this.imgTex);
    gl.deleteProgram(this.simProg);
    gl.deleteProgram(this.dispProg);
    // Deliberately no WEBGL_lose_context: React StrictMode re-mounts on the same
    // canvas, and getContext() would hand back the lost context.
  }

  // ---------------------------------------------------------------------------

  private step() {
    const gl = this.gl;
    const { cellPx, marginPx } = this.opts;
    const next = 1 - this.cur;
    gl.useProgram(this.simProg);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos[next]);
    gl.viewport(0, 0, this.simW, this.simH);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.state[this.cur]);

    const rects = new Float32Array(MAX_OBSTACLES * 4);
    const radii = new Float32Array(MAX_OBSTACLES);
    this.obstacles.forEach((o, i) => {
      // CSS viewport (y down) → grid cells (y up, offset by the margin).
      rects[i * 4] = (o.x + marginPx) / cellPx;
      rects[i * 4 + 1] = (this.viewH - (o.y + o.h) + marginPx) / cellPx;
      rects[i * 4 + 2] = o.w / cellPx;
      rects[i * 4 + 3] = o.h / cellPx;
      radii[i] = Math.min(o.r, o.w / 2, o.h / 2) / cellPx;
    });
    const pulse = this.pulses.shift();

    const U = this.simU;
    gl.uniform1i(U.uState, 0);
    gl.uniform2f(U.uSize, this.simW, this.simH);
    gl.uniform4fv(U.uRects, rects);
    gl.uniform1fv(U.uRadii, radii);
    gl.uniform1i(U.uCount, this.obstacles.length);
    gl.uniform1f(U.uSponge, marginPx / cellPx);
    gl.uniform1f(U.uDamping, this.opts.damping);
    gl.uniform1f(U.uC2, 0.45);
    gl.uniform1i(U.uPulse, pulse ? pulse.index : -1);
    gl.uniform1f(U.uPulseAmp, pulse ? pulse.amp : 0);
    gl.uniform1f(U.uPulseWidth, this.opts.pulseWidthPx / cellPx);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.cur = next;
  }

  private render() {
    const gl = this.gl;
    const { cellPx, marginPx, refractPx, specular, chroma } = this.opts;
    gl.useProgram(this.dispProg);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.state[this.cur]);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.imgTex);

    const U = this.dispU;
    gl.uniform1i(U.uState, 0);
    gl.uniform1i(U.uImg, 1);
    gl.uniform2f(U.uView, this.viewW, this.viewH);
    gl.uniform2f(U.uImgSize, this.imgW, this.imgH);
    gl.uniform2f(U.uSimSize, this.simW, this.simH);
    gl.uniform1f(U.uCell, cellPx);
    gl.uniform1f(U.uMargin, marginPx);
    gl.uniform1f(U.uRefract, refractPx);
    gl.uniform1f(U.uSpec, specular);
    gl.uniform1f(U.uChroma, chroma);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private program(frag: string) {
    const gl = this.gl;
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'shader compile failed');
      return sh;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, frag));
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link failed');
    return prog;
  }

  private texture(filter: number) {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
}
