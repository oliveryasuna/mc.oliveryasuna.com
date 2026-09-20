import type {Router} from 'vitepress';
import './creeper.scss';

//==================================================
// Settings
//==================================================

const DEBUG_GRID = false;

const CELL_PX = 30;            // Grid size
const BLAST_RADIUS = 120;      // px
const BIG_AREA = (500 * 500);  // px^2; larger elements blast as color, not cloned content
const GRAVITY = 2600;          // px/s^2
const MIN_SPEED = 260;         // px/s, radial launch speed
const MAX_SPEED = 720;
const UPWARD_BIAS = 320;       // px/s of extra "pop" so debris arcs up first
const LIFE_MS = 1400;          // How long a cube lives before it's culled
const FUSE_MS = 1600;          // Creeper's blinking fuse before it detonates
const HISS_MS = 700;           // One hiss at the start, then silence until the boom
const CULL_MARGIN = 200;       // px below the viewport before a cube is retired

// Chance to break through each layer, scaled by blast power (1 at the source
// cell, falling to 0 at the rim). The webpage multiplier is high, so the
// surface breaks across most of the disc and only survives near the rim; dirt
// and stone fall off faster, so the deeper layers concentrate toward the
// source, which almost (but not quite) always reaches bedrock.
const BREAK_WEBPAGE = 3.5;
const BREAK_DIRT = 1.5;
const BREAK_STONE = 0.95;

// Last-resort block color, only used if even the page root has no background.
const FALLBACK_COLOR = '#8f8f8f';

//==================================================
// Physics loop
//==================================================

interface Cube {
  el: HTMLElement;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  born: number;
}

const cubes: Cube[] = [];
let rafId = 0;
let lastFrame = 0;  // 0 = no previous frame yet

// Advances one cube; returns false once it should be retired.
const updateCube = ((
  cube: Cube,
  dt: number,
  now: number
): boolean => {
  cube.vy += (GRAVITY * dt);
  cube.x += (cube.vx * dt);
  cube.y += (cube.vy * dt);
  cube.rot += (cube.vr * dt);

  const age = (now - cube.born);
  if((age >= LIFE_MS) || (cube.y > (globalThis.innerHeight + CULL_MARGIN))) {
    return false;
  }

  cube.el.style.transform = `translate3d(${cube.x}px, ${cube.y}px, 0) rotate(${cube.rot}deg)`;
  cube.el.style.opacity = String(Math.max(0, (1 - (age / LIFE_MS))));

  return true;
});

const step = ((now: number): void => {
  rafId = 0;

  // The first frame after a spawn has no meaningful delta; peg it to ~16ms and
  // clamp long gaps (e.g. a backgrounded tab) so debris never teleports.
  const previous = ((lastFrame === 0) ? (now - 16) : lastFrame);
  lastFrame = now;
  const dt = (Math.min((now - previous), 48) / 1000);

  const survivors: Cube[] = [];
  for(const cube of cubes) {
    if(updateCube(cube, dt, now)) {
      survivors.push(cube);
    } else {
      cube.el.remove();
    }
  }

  cubes.length = 0;
  cubes.push(...survivors);

  if(cubes.length > 0) {
    rafId = requestAnimationFrame(step);
  } else {
    lastFrame = 0;
  }
});

const ensureLoop = ((): void => {
  if(rafId === 0) {
    rafId = requestAnimationFrame(step);
  }
});

//==================================================
// Color helpers
//==================================================

const isTransparent = ((color: string): boolean => {
  if(!color || (color === 'transparent')) {
    return true;
  }

  const match = (/rgba?\(([^)]+)\)/).exec(color);
  const inner = match?.[1];
  if(inner === undefined) {
    return false;
  }

  const parts = inner.split(',').map(value => value.trim());
  const alpha = parts[3];

  return ((parts.length === 4) && (alpha !== undefined) && (Number.parseFloat(alpha) === 0));
});

const resolveBaseColor = ((el: HTMLElement): string => {
  let node: (HTMLElement | null) = el;

  // Walk up to the root and return the first solid background; that's what the
  // element actually looks like. Going all the way to <body>/<html> means an
  // element whose only backdrop is the page shatters into page-colored blocks
  // instead of some random color.
  while(node) {
    const bg = getComputedStyle(node).backgroundColor;
    if(!isTransparent(bg)) {
      return bg;
    }

    node = node.parentElement;
  }

  return FALLBACK_COLOR;
});

//==================================================
// Feedback: shake + sound
//==================================================

const shake = ((): void => {
  document.body.classList.remove('creeper-shake');
  // Force reflow so the animation restarts on rapid repeated blasts.
  void document.body.offsetWidth;
  document.body.classList.add('creeper-shake');
});

let audioCtx: (AudioContext | null) = null;

// Flat white noise of a given length; the source for every explosion layer.
const createNoise = ((
  ctx: AudioContext,
  seconds: number
): AudioBuffer => {
  const frames = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  for(let i = 0; i < frames; i++) {
    data[i] = ((Math.random() * 2) - 1);
  }

  return buffer;
});

// A soft-clip curve. Driving the boom layers through it saturates the peaks,
// which glues the mix together and adds grit.
const makeSaturator = ((ctx: AudioContext): WaveShaperNode => {
  const shaper = ctx.createWaveShaper();
  const curve = (new Float32Array(256));

  for(let i = 0; i < 256; i++) {
    const x = (((i / 255) * 2) - 1);
    curve[i] = Math.tanh(x * 2.2);
  }

  shaper.curve = curve;

  return shaper;
});

// The chest-thump: a sine dropping from a low pitch down to a sub rumble, with
// a sharp attack and a long tail. This is most of what makes the boom good.
const boomSub = ((
  ctx: AudioContext,
  t0: number,
  dest: AudioNode
): void => {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(170, t0);
  osc.frequency.exponentialRampToValueAtTime(40, (t0 + 0.35));

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(1, (t0 + 0.015));
  gain.gain.exponentialRampToValueAtTime(0.0001, (t0 + 0.75));

  osc.connect(gain).connect(dest);
  osc.start(t0);
  osc.stop(t0 + 0.75);
});

// The rumble body: noise swept from bright down to dark, decaying over ~0.9s.
const boomBody = ((
  ctx: AudioContext,
  t0: number,
  dest: AudioNode
): void => {
  const noise = ctx.createBufferSource();
  noise.buffer = createNoise(ctx, 0.9);

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.setValueAtTime(1600, t0);
  lowpass.frequency.exponentialRampToValueAtTime(80, (t0 + 1.5));

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.55, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, (t0 + 1.9));

  noise.connect(lowpass).connect(gain).connect(dest);
  noise.start(t0);
  noise.stop(t0 + 0.9);
});

// The initial crack: a very short high-passed noise burst for the punch.
const boomCrack = ((
  ctx: AudioContext,
  t0: number,
  dest: AudioNode
): void => {
  const noise = ctx.createBufferSource();
  noise.buffer = createNoise(ctx, 0.09);

  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 900;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.7, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, (t0 + 0.09));

  noise.connect(highpass).connect(gain).connect(dest);
  noise.start(t0);
  noise.stop(t0 + 0.09);
});

// Layer the crack, body, and sub through the saturator into a master gain.
const playBoom = ((ctx: AudioContext): void => {
  const t0 = ctx.currentTime;

  const saturator = makeSaturator(ctx);
  const master = ctx.createGain();
  master.gain.value = 0.7;
  saturator.connect(master).connect(ctx.destination);

  boomCrack(ctx, t0, saturator);
  boomBody(ctx, t0, saturator);
  boomSub(ctx, t0, saturator);
});

const boom = ((): void => {
  if(typeof AudioContext === 'undefined') {
    return;
  }

  try {
    audioCtx ??= (new AudioContext());
    playBoom(audioCtx);
  } catch{
    // Audio is a bonus; never let it break the visual effect.
  }
});

// A single high-passed hiss: quick attack, holds steady, then fades to silence.
// It doesn't swell into the blast; the creeper hisses once at the start.
const playHiss = ((ctx: AudioContext): void => {
  const seconds = (HISS_MS / 1000);
  const t0 = ctx.currentTime;

  const noise = ctx.createBufferSource();
  noise.buffer = createNoise(ctx, seconds);

  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 3500;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.13, (t0 + 0.04));  // quick attack
  gain.gain.setValueAtTime(0.13, (t0 + (seconds * 0.55)));  // hold steady
  gain.gain.exponentialRampToValueAtTime(0.0001, (t0 + seconds));  // fade out

  noise.connect(highpass).connect(gain).connect(ctx.destination);
  noise.start(t0);
  noise.stop(t0 + seconds);
});

const hiss = ((): void => {
  if(typeof AudioContext === 'undefined') {
    return;
  }

  try {
    audioCtx ??= (new AudioContext());
    playHiss(audioCtx);
  } catch{
    // Audio is a bonus; never let it break the visual effect.
  }
});

//==================================================
// Detonation
//==================================================

// How deep each cell has been dug: 1 = dirt exposed, 2 = stone, 3 = bedrock.
// Cells not in the map are untouched webpage. Kept across blasts so an
// overlapping one only ever digs deeper, and cleared on defuse. Keyed by
// "docLeft,docTop".
const cellDepth = (new Map<string, number>());

// The tile currently shown for each cratered cell, so a later blast can swap
// its texture when it digs deeper, and defuse can remove it.
const layerTiles = (new Map<string, HTMLElement>());

// Tile texture class per exposed layer.
const LAYER_CLASS: Record<number, string> = {
  1: 'creeper-dirt',
  2: 'creeper-stone',
  3: 'creeper-bedrock'
};

// A transparent full-viewport layer that eats pointer input while armed, so the
// page underneath can't be hovered, selected, or clicked; you can only blast
// it.
let shield: (HTMLElement | null) = null;

interface Launch {
  vx: number;
  vy: number;
  vr: number;
}

// Launch a fragment radially away from the blast center, with an upward pop and
// deterministic per-cube variation (no RNG needed, so it stays SSR-safe).
const launchVelocity = ((
  cx: number,
  cy: number,
  blastX: number,
  blastY: number,
  wobble: number
): Launch => {
  let dirX = (cx - blastX);
  let dirY = (cy - blastY);
  const len = (Math.hypot(dirX, dirY) || 1);
  dirX /= len;
  dirY /= len;

  const speed = (MIN_SPEED + (wobble * (MAX_SPEED - MIN_SPEED)));

  return {
    vx: ((dirX * speed) + ((wobble - 0.5) * 200)),
    vy: (((dirY * speed) - UPWARD_BIAS) + ((wobble - 0.5) * 120)),
    vr: ((wobble - 0.5) * 720)
  };
});

// One in-flight blast: its center, spawn time, and the fragment its cubes go
// into. `layers` is the per-cell outcome (which layer each cratered cell ends
// up showing), collected while sampling and applied only at detonation, so
// nothing shows during the fuse.
interface Blast {
  x: number;
  y: number;
  now: number;
  fragment: DocumentFragment;
  layers: {docLeft: number; docTop: number; depth: number;}[];
}

// Give one finished cube its launch physics and stage it in the fragment.
const launchCube = ((
  cube: HTMLElement,
  left: number,
  top: number,
  blast: Blast
): void => {
  const wobble = ((Math.abs((Math.round(left) * 7) + (Math.round(top) * 13)) % 10) / 10);  // 0..0.9
  const launch = launchVelocity((left + (CELL_PX / 2)), (top + (CELL_PX / 2)), blast.x, blast.y, wobble);

  cube.style.transform = `translate3d(${left}px, ${top}px, 0)`;
  cubes.push({
    el: cube,
    x: left,
    y: top,
    vx: launch.vx,
    vy: launch.vy,
    rot: 0,
    vr: launch.vr,
    born: blast.now
  });
  blast.fragment.append(cube);
});

// A solid colored block, used for big background containers where cloning the
// whole element for every cell would be wasteful.
const createColorCube = ((
  left: number,
  top: number,
  color: string,
  blast: Blast
): void => {
  const cube = document.createElement('div');
  cube.className = 'creeper-cube';
  cube.style.width = `${CELL_PX}px`;
  cube.style.height = `${CELL_PX}px`;
  cube.style.background = color;
  // Brightness jitter so a field of blocks reads as textured, not a flat sheet.
  cube.style.filter = `brightness(${(0.82 + (((Math.round(left) + Math.round(top)) % 3) * 0.14)).toFixed(2)})`;

  launchCube(cube, left, top, blast);
});

// A deep clone of `el`, positioned so a CELL_PX window at (left, top) shows the
// exact slice of content that lived in that cell. The size is pinned with
// !important because page rules like `max-width: 100%` would otherwise shrink
// the clone down to the tiny cube it now sits in, collapsing the content to an
// invisible sliver.
const cloneWindow = ((
  el: HTMLElement,
  rect: DOMRect,
  left: number,
  top: number
): (HTMLElement | null) => {
  const clone = el.cloneNode(true);
  if(!(clone instanceof HTMLElement)) {
    return null;
  }

  clone.removeAttribute('id');
  clone.setAttribute('aria-hidden', 'true');

  const styles: Record<string, string> = {
    position: 'absolute',
    margin: '0',
    left: `${rect.left - left}px`,
    top: `${rect.top - top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    'max-width': 'none',
    'max-height': 'none',
    'box-sizing': 'border-box',
    'pointer-events': 'none'
  };
  for(const [prop, value] of Object.entries(styles)) {
    clone.style.setProperty(prop, value, 'important');
  }

  return clone;
});

// A block showing the actual content that occupied this cell.
const createContentCube = ((
  left: number,
  top: number,
  el: HTMLElement,
  rect: DOMRect,
  blast: Blast
): void => {
  const clone = cloneWindow(el, rect, left, top);
  if(!clone) {
    createColorCube(left, top, resolveBaseColor(el), blast);

    return;
  }

  const cube = document.createElement('div');
  cube.className = 'creeper-cube creeper-cube-content';
  cube.style.width = `${CELL_PX}px`;
  cube.style.height = `${CELL_PX}px`;
  cube.append(clone);

  launchCube(cube, left, top, blast);
});

// Topmost meaningful element at a viewport point, or null for blank space and
// our own overlay chrome (which must never be sampled or destroyed).
const elementAt = ((
  x: number,
  y: number
): (HTMLElement | null) => {
  const el = document.elementFromPoint(x, y);
  if(!(el instanceof HTMLElement) || (el === document.body) || (el === document.documentElement)) {
    return null;
  }
  if(el.closest('.creeper-cube, .creeper-flash, .creeper-badge')) {
    return null;
  }

  return el;
});

// How many layers a cell loses, given its distance from the source. Power falls
// off linearly to the rim; each layer down is its own roll, so the source
// usually reaches bedrock while the rim usually survives.
const digDepth = ((dist: number): number => {
  const power = Math.max(0, (1 - (dist / BLAST_RADIUS)));

  let depth = 0;
  if(Math.random() < (power * BREAK_WEBPAGE)) {
    depth = 1;
  }
  if((depth === 1) && (Math.random() < (power * BREAK_DIRT))) {
    depth = 2;
  }
  if((depth === 2) && (Math.random() < (power * BREAK_STONE))) {
    depth = 3;
  }

  return depth;
});

// A flying block of a ground layer (dirt or stone), textured by class.
const createTextureCube = ((
  left: number,
  top: number,
  className: string,
  blast: Blast
): void => {
  const cube = document.createElement('div');
  cube.className = `creeper-cube ${className}`;
  cube.style.width = `${CELL_PX}px`;
  cube.style.height = `${CELL_PX}px`;

  launchCube(cube, left, top, blast);
});

// Throw the webpage block for a cell: its real content, or a color block for a
// big container. Blank space has nothing to throw.
const removeWebpage = ((
  cellX: number,
  cellY: number,
  cx: number,
  cy: number,
  blast: Blast
): void => {
  const el = elementAt(cx, cy);
  if(!el) {
    return;
  }

  const rect = el.getBoundingClientRect();
  if((rect.width * rect.height) > BIG_AREA) {
    createColorCube(cellX, cellY, resolveBaseColor(el), blast);
  } else {
    createContentCube(cellX, cellY, el, rect, blast);
  }
});

// Throw a block for every layer this cell loses, from its current depth down to
// the new one.
const digCell = ((
  cellX: number,
  cellY: number,
  cx: number,
  cy: number,
  from: number,
  to: number,
  blast: Blast
): void => {
  if((from < 1) && (to >= 1)) {
    removeWebpage(cellX, cellY, cx, cy, blast);
  }
  if((from < 2) && (to >= 2)) {
    createTextureCube(cellX, cellY, 'creeper-cube-dirt', blast);
  }
  if((from < 3) && (to >= 3)) {
    createTextureCube(cellX, cellY, 'creeper-cube-stone', blast);
  }
});

// Show the exposed layer for a cratered cell. Creates the tile the first time,
// or just swaps its texture when a later blast digs deeper. Positioned in
// document space so it scrolls with the page.
const placeTile = ((
  docLeft: number,
  docTop: number,
  depth: number
): void => {
  const key = `${docLeft},${docTop}`;

  let tile = layerTiles.get(key);
  if(!tile) {
    tile = document.createElement('div');
    tile.style.left = `${docLeft}px`;
    tile.style.top = `${docTop}px`;
    tile.style.width = `${CELL_PX}px`;
    tile.style.height = `${CELL_PX}px`;
    document.body.append(tile);
    layerTiles.set(key, tile);
  }

  tile.className = (LAYER_CLASS[depth] ?? 'creeper-bedrock');
  cellDepth.set(key, depth);
});

// One grid cell inside the blast circle. Roll how deep it digs, throw a block
// for every layer it loses, and remember the exposed layer for detonation.
const blastCell = ((
  cellX: number,
  cellY: number,
  blast: Blast
): void => {
  const cx = (cellX + (CELL_PX / 2));
  const cy = (cellY + (CELL_PX / 2));
  const dist = Math.hypot((cx - blast.x), (cy - blast.y));
  if(dist > BLAST_RADIUS) {
    return;
  }

  const docLeft = (cellX + globalThis.scrollX);
  const docTop = (cellY + globalThis.scrollY);
  const current = (cellDepth.get(`${docLeft},${docTop}`) ?? 0);
  if(current >= 3) {
    return;
  }

  const target = digDepth(dist);
  if(target <= current) {
    return;
  }

  digCell(cellX, cellY, cx, cy, current, target, blast);
  blast.layers.push({
    docLeft: docLeft,
    docTop: docTop,
    depth: target
  });
});

// Treat the viewport as a fixed grid aligned to its origin, and blast every
// cell whose center falls within the radius. Snapping the bounds to the grid
// keeps cubes and the carved hole on the same lattice, so both stay blocky.
const buildBlastCubes = ((blast: Blast): void => {
  const startX = (Math.floor((blast.x - BLAST_RADIUS) / CELL_PX) * CELL_PX);
  const startY = (Math.floor((blast.y - BLAST_RADIUS) / CELL_PX) * CELL_PX);
  const endX = (blast.x + BLAST_RADIUS);
  const endY = (blast.y + BLAST_RADIUS);

  for(let y = startY; y <= endY; y += CELL_PX) {
    for(let x = startX; x <= endX; x += CELL_PX) {
      blastCell(x, y, blast);
    }
  }
});

// Directional inner shadows (light from the top): the top wall is deepest in
// shadow, the sides less so, and the near (bottom) wall catches a faint
// highlight. Together they make a cell read as sunk below its higher neighbors.
const SHADOW_TOP = 'inset 0 11px 9px -6px rgba(0, 0, 0, 0.72)';
const SHADOW_LEFT = 'inset 10px 0 8px -6px rgba(0, 0, 0, 0.5)';
const SHADOW_RIGHT = 'inset -10px 0 8px -6px rgba(0, 0, 0, 0.5)';
const SHADOW_BOTTOM = 'inset 0 -7px 7px -5px rgba(255, 255, 255, 0.14)';

// An edge is shadowed when the neighbor across it sits higher (a shallower
// depth, or intact webpage at depth 0), since that higher wall casts into this
// cell. This shades both the crater rim and every dirt/stone/bedrock step.
const edgeShadow = ((
  depth: number,
  nx: number,
  ny: number,
  shadow: string
): string => (((cellDepth.get(`${nx},${ny}`) ?? 0) < depth) ? shadow : ''));

// Re-shade every crater tile from its four neighbors. Recomputed after each
// blast, since new tiles change which edges border something higher.
const updateEdgeShadows = ((): void => {
  for(const [key, tile] of layerTiles) {
    const parts = key.split(',');
    const dl = Number(parts[0]);
    const dt = Number(parts[1]);
    const depth = (cellDepth.get(key) ?? 0);

    const shadows = ([
      edgeShadow(depth, dl, (dt - CELL_PX), SHADOW_TOP),
      edgeShadow(depth, dl, (dt + CELL_PX), SHADOW_BOTTOM),
      edgeShadow(depth, (dl - CELL_PX), dt, SHADOW_LEFT),
      edgeShadow(depth, (dl + CELL_PX), dt, SHADOW_RIGHT)
    ].filter(Boolean));

    tile.style.boxShadow = shadows.join(', ');
  }
});

// Fired once the fuse finishes: lay the exposed layer tiles (now, not during
// the fuse), release the cubes, and kick the feedback.
const detonate = ((
  flash: HTMLElement,
  blast: Blast
): void => {
  flash.remove();

  for(const layer of blast.layers) {
    placeTile(layer.docLeft, layer.docTop, layer.depth);
  }
  updateEdgeShadows();

  document.body.append(blast.fragment);
  ensureLoop();
  boom();
  shake();
});

const spawnFlash = ((blast: Blast): void => {
  // A creeper materializes in the clicked square, then blinks white and swells
  // over its fuse before detonating. blast.x/y is the square's center.
  const flash = document.createElement('div');
  flash.className = 'creeper-flash';
  flash.style.left = `${blast.x - (CELL_PX / 2)}px`;
  flash.style.top = `${blast.y - (CELL_PX / 2)}px`;
  flash.style.width = `${CELL_PX}px`;
  flash.style.height = `${CELL_PX}px`;
  // Both fuse animations read their duration from this, so they track FUSE_MS.
  flash.style.setProperty('--fuse', `${FUSE_MS}ms`);
  document.body.append(flash);

  // One hiss up front; then silence for the rest of the fuse, then the boom.
  hiss();

  globalThis.setTimeout(
    (() => {
      detonate(flash, blast);
    }),
    FUSE_MS
  );
});

const detonateAt = ((
  clientX: number,
  clientY: number
): void => {
  // Snap the blast center to the center of the clicked grid square, so the
  // crater is always grid-aligned regardless of where in the square you click.
  const blast: Blast = {
    x: ((Math.floor(clientX / CELL_PX) * CELL_PX) + (CELL_PX / 2)),
    y: ((Math.floor(clientY / CELL_PX) * CELL_PX) + (CELL_PX / 2)),
    now: performance.now(),
    fragment: document.createDocumentFragment(),
    layers: []
  };

  // The shield is on top and eats pointer input; make it transparent to
  // hit-testing just while we sample, so elementFromPoint reads the real page.
  shield?.style.setProperty('pointer-events', 'none');
  buildBlastCubes(blast);
  shield?.style.removeProperty('pointer-events');

  spawnFlash(blast);
});

//==================================================
// Mode toggle
//==================================================

let armed = false;
let badge: (HTMLElement | null) = null;

const heroImage = ((target: (EventTarget | null)): boolean => {
  if(!(target instanceof Element)) {
    return false;
  }

  return (target.closest('.VPHero .image, .VPHero .image-src') !== null);
});

// Remove every crater tile and forget the depths, so the page is whole again.
const clearScars = ((): void => {
  for(const tile of layerTiles.values()) {
    tile.remove();
  }
  layerTiles.clear();
  cellDepth.clear();
});

const disarm = ((): void => {
  if(!armed) {
    return;
  }

  armed = false;
  document.body.classList.remove('creeper-armed');
  badge?.remove();
  badge = null;
  shield?.remove();
  shield = null;

  clearScars();
});

const onBadgeClick = ((event: MouseEvent): void => {
  event.stopPropagation();
  disarm();
});

const showShield = ((): void => {
  const el = document.createElement('div');
  el.className = 'creeper-shield';
  document.body.append(el);
  shield = el;
});

const arm = ((): void => {
  if(armed) {
    return;
  }

  armed = true;
  document.body.classList.add('creeper-armed');
  showShield();

  const el = document.createElement('div');
  el.className = 'creeper-badge';
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  el.title = 'Defuse creeper mode';
  el.innerHTML = ('<img src="/creeper.svg" alt="" width="24" height="24"/>'
    + '<span>Creeper mode armed &middot; <strong>Esc</strong> to defuse</span>');
  el.addEventListener('click', onBadgeClick);
  document.body.append(el);
  badge = el;
});

//==================================================
// Debug grid
//==================================================

// Overlay the CELL_PX lattice that blasts snap to (gated by DEBUG_GRID).
const showGrid = ((): void => {
  const line = 'rgba(90, 220, 110, 0.4)';
  const overlay = document.createElement('div');
  overlay.className = 'creeper-grid';
  // Lines every CELL_PX from the viewport origin, matching where clicks snap.
  overlay.style.backgroundImage = (`repeating-linear-gradient(to right, ${line} 0 1px, transparent 1px ${CELL_PX}px), `
    + `repeating-linear-gradient(to bottom, ${line} 0 1px, transparent 1px ${CELL_PX}px)`);
  document.body.append(overlay);
});

//==================================================
// Wiring
//==================================================

const onDocumentClick = ((event: MouseEvent): void => {
  const {target} = event;

  if(!armed) {
    // Disarmed: the hero portrait is the only thing that does anything special.
    if(heroImage(target)) {
      event.preventDefault();
      arm();
    }

    return;
  }

  // Let the defuse badge handle its own clicks.
  if((target instanceof Element) && target.closest('.creeper-badge')) {
    return;
  }

  // Armed: swallow the interaction and blow up everything within the blast
  // radius of the click.
  event.preventDefault();
  event.stopPropagation();
  detonateAt(event.clientX, event.clientY);
});

const onKeydown = ((event: KeyboardEvent): void => {
  if(!armed) {
    return;
  }
  if(event.key === 'Escape') {
    disarm();

    return;
  }

  // Armed: the page is inert, so swallow every other key (search, tab, ...).
  // Browser-reserved shortcuts (reload, devtools) aren't cancelable, so they
  // still work as an escape hatch alongside Esc.
  event.preventDefault();
  event.stopPropagation();
});

let installed = false;

const initCreeperMode = ((router: {onAfterRouteChange?: Router['onAfterRouteChange'];}): void => {
  if(installed) {
    return;
  }
  installed = true;

  // Capture phase so we win clicks and keys before the page acts on them.
  document.addEventListener('click', onDocumentClick, true);
  document.addEventListener('keydown', onKeydown, true);

  // Any client-side navigation defuses and cleans up.
  const original = router.onAfterRouteChange;
  router.onAfterRouteChange = ((to: string): void => {
    original?.(to);
    disarm();
  });

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Intentional.
  if(DEBUG_GRID) {
    showGrid();
  }
});

export {
  initCreeperMode
};
