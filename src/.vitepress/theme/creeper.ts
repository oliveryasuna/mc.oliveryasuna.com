import type {Router} from 'vitepress';
import './creeper.scss';

//==================================================
// Settings
//==================================================

const DEBUG_GRID = false;

const CELL_PX = 30;            // Grid size
const BLAST_RADIUS = 149;      // px
const BIG_AREA = (500 * 500);  // px^2; larger elements blast as color, not cloned content
const GRAVITY = 2600;          // px/s^2
const MIN_SPEED = 260;         // px/s, radial launch speed
const MAX_SPEED = 720;
const UPWARD_BIAS = 320;       // px/s of extra "pop" so debris arcs up first
const LIFE_MS = 1400;          // How long a cube lives before it's culled
const FUSE_MS = 1600;          // Creeper's blinking fuse before it detonates
const HISS_MS = 700;           // One hiss at the start, then silence until the boom
const CULL_MARGIN = 200;       // px below the viewport before a cube is retired

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

// Half a second of white noise that decays to silence; the source for the boom.
const createNoiseBuffer = ((ctx: AudioContext): AudioBuffer => {
  const frames = Math.floor(ctx.sampleRate * 0.5);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  for(let i = 0; i < frames; i++) {
    data[i] = (((Math.random() * 2) - 1) * (1 - (i / frames)));
  }

  return buffer;
});

// White noise through a downward lowpass sweep with a fast-decaying gain,
// which reads as a punchy boom.
const playBoom = ((ctx: AudioContext): void => {
  const t0 = ctx.currentTime;

  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(ctx);

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.setValueAtTime(900, t0);
  lowpass.frequency.exponentialRampToValueAtTime(120, (t0 + 0.4));

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.35, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, (t0 + 0.5));

  noise.connect(lowpass).connect(gain).connect(ctx.destination);
  noise.start(t0);
  noise.stop(t0 + 0.5);
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

// Flat, sustained white noise; the source for the fuse hiss.
const createHissBuffer = ((
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

// A single high-passed hiss: quick attack, holds steady, then fades to silence.
// It doesn't swell into the blast; the creeper hisses once at the start.
const playHiss = ((ctx: AudioContext): void => {
  const seconds = (HISS_MS / 1000);
  const t0 = ctx.currentTime;

  const noise = ctx.createBufferSource();
  noise.buffer = createHissBuffer(ctx, seconds);

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

// Every square we have carved out of each element, kept across all blasts until
// the user defuses. Overlapping blasts have to add to this rather than replace
// it, or the earlier blast's damage would heal. Keyed by "left,top" so the same
// square can't get recorded twice (the evenodd mask would cancel it).
const holesByEl = (new Map<HTMLElement, Map<string, Cell>>());

// Each carved element's mask from before we touched it, stored once, so defuse
// restores it exactly (usually to no mask at all).
const priorMask = (new Map<HTMLElement, {mask: string; webkitMask: string;}>());

// Bedrock tiles left behind in the crater to mark the destruction, plus the
// document-space cells already covered (deduped). Both cleared on defuse.
const bedrockTiles: HTMLElement[] = [];
const bedrockCells = (new Set<string>());

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

// A grid square, in viewport coordinates.
interface Cell {
  left: number;
  top: number;
}

// One in-flight blast: its center, spawn time, and the fragment cubes accrue
// into. `carved` tracks which elements this blast has already fully cleared, so
// we compute each element's disc of holes once, not once per sampled cell.
// Carved squares themselves are tracked globally in holesByEl, not per blast.
interface Blast {
  x: number;
  y: number;
  now: number;
  fragment: DocumentFragment;
  carved: Set<HTMLElement>;
  // Cells to crater into bedrock; collected during sampling but laid down only
  // at detonation, so the scar doesn't appear during the fuse.
  bedrock: Cell[];
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

// Record a square to punch out of `el`, accumulating (and deduping) across
// blasts. The first time we touch an element we also stash its original mask
// for restore.
const recordHole = ((
  el: HTMLElement,
  cell: Cell
): void => {
  let cells = holesByEl.get(el);
  if(!cells) {
    cells = (new Map<string, Cell>());
    holesByEl.set(el, cells);
    priorMask.set(
      el,
      {
        mask: el.style.maskImage,
        webkitMask: el.style.getPropertyValue('-webkit-mask-image')
      }
    );
  }

  cells.set(`${cell.left},${cell.top}`, cell);
});

// Carve the whole blast disc out of `el`, once per blast: every grid square
// that overlaps the element's box and whose center is within the radius. Going
// by box overlap rather than by what elementFromPoint sampled means edge cells
// that straddle the element's border still carve it, so no remnant strips
// survive.
const carveElement = ((
  el: HTMLElement,
  blast: Blast
): void => {
  if(blast.carved.has(el)) {
    return;
  }
  blast.carved.add(el);

  const rect = el.getBoundingClientRect();
  const startX = (Math.floor(Math.max(rect.left, (blast.x - BLAST_RADIUS)) / CELL_PX) * CELL_PX);
  const startY = (Math.floor(Math.max(rect.top, (blast.y - BLAST_RADIUS)) / CELL_PX) * CELL_PX);
  const endX = Math.min(rect.right, (blast.x + BLAST_RADIUS));
  const endY = Math.min(rect.bottom, (blast.y + BLAST_RADIUS));

  for(let y = startY; y < endY; y += CELL_PX) {
    for(let x = startX; x < endX; x += CELL_PX) {
      if(Math.hypot(((x + (CELL_PX / 2)) - blast.x), ((y + (CELL_PX / 2)) - blast.y)) <= BLAST_RADIUS) {
        recordHole(
          el,
          {
            left: x,
            top: y
          }
        );
      }
    }
  }
});

// Leave a bedrock tile in the crater, so the scar reads as "dug down to
// bedrock". Positioned in document space (so it scrolls with the page) and
// deduped. Returns false if this cell was already cratered by an earlier blast.
const placeBedrock = ((
  cellX: number,
  cellY: number
): boolean => {
  const docLeft = (cellX + globalThis.scrollX);
  const docTop = (cellY + globalThis.scrollY);
  const key = `${docLeft},${docTop}`;
  if(bedrockCells.has(key)) {
    return false;
  }
  bedrockCells.add(key);

  const tile = document.createElement('div');
  tile.className = 'creeper-bedrock';
  tile.style.left = `${docLeft}px`;
  tile.style.top = `${docTop}px`;
  tile.style.width = `${CELL_PX}px`;
  tile.style.height = `${CELL_PX}px`;
  document.body.append(tile);
  bedrockTiles.push(tile);

  return true;
});

// Spawn the block for a covered cell (real content, or a color block for big
// containers) and note the square to carve out of the original.
const spawnCubeFor = ((
  el: HTMLElement,
  rect: DOMRect,
  cellX: number,
  cellY: number,
  blast: Blast
): void => {
  if((rect.width * rect.height) > BIG_AREA) {
    createColorCube(cellX, cellY, resolveBaseColor(el), blast);
  } else {
    createContentCube(cellX, cellY, el, rect, blast);
  }
  carveElement(el, blast);
});

// One grid cell inside the blast circle: crater it, and if it covers something,
// spawn the matching block for it.
const blastCell = ((
  cellX: number,
  cellY: number,
  blast: Blast
): void => {
  const cx = (cellX + (CELL_PX / 2));
  const cy = (cellY + (CELL_PX / 2));
  if(Math.hypot((cx - blast.x), (cy - blast.y)) > BLAST_RADIUS) {
    return;
  }

  // A cell an earlier blast already cratered is bedrock now, and bedrock does
  // not break, so it throws no particles and keeps its tile.
  const key = `${cellX + globalThis.scrollX},${cellY + globalThis.scrollY}`;
  if(bedrockCells.has(key)) {
    return;
  }

  // The whole blast disc craters (even empty space), but the tile is laid down
  // at detonation, not now, so it doesn't show during the fuse.
  blast.bedrock.push({
    left: cellX,
    top: cellY
  });

  const el = elementAt(cx, cy);
  if(!el) {
    return;
  }

  spawnCubeFor(el, el.getBoundingClientRect(), cellX, cellY, blast);
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

// Punch the recorded grid squares out of an element with an SVG evenodd mask:
// one outer rect (opaque = keep) with the hole squares subtracted (transparent
// = gone). The hole is the union of blocks, so the crater is blocky too.
const applyMask = ((
  el: HTMLElement,
  cells: Cell[]
): void => {
  const rect = el.getBoundingClientRect();
  const w = Math.ceil(rect.width);
  const h = Math.ceil(rect.height);
  const squares = cells
    .map(cell => ` M${Math.round(cell.left - rect.left)} ${Math.round(cell.top - rect.top)} h${CELL_PX} v${CELL_PX} h${-CELL_PX} Z`)
    .join('');
  const svg = (`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>`
    + `<path fill-rule='evenodd' fill='#fff' d='M0 0 H${w} V${h} H0 Z${squares}'/></svg>`);
  const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

  el.style.setProperty('mask', `${url} no-repeat top left / 100% 100%`);
  el.style.setProperty('-webkit-mask', `${url} no-repeat top left / 100% 100%`);
});

// Fired once the pre-blast flash has swelled: re-carve every wounded element
// from its full accumulated hole set (so overlapping blasts add up rather than
// heal each other), release the cubes, and kick the feedback.
const detonate = ((
  flash: HTMLElement,
  blast: Blast
): void => {
  flash.remove();

  for(const [el, cells] of holesByEl) {
    applyMask(el, [...cells.values()]);
  }

  // Lay the bedrock scar now, not during the fuse.
  for(const cell of blast.bedrock) {
    placeBedrock(cell.left, cell.top);
  }

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
    carved: (new Set<HTMLElement>()),
    bedrock: []
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

// Undo every scar: restore each element's original mask (usually none) and
// remove the bedrock tiles.
const clearScars = ((): void => {
  for(const [el, prior] of priorMask) {
    el.style.removeProperty('mask');
    el.style.removeProperty('-webkit-mask');
    el.style.maskImage = prior.mask;
    el.style.setProperty('-webkit-mask-image', prior.webkitMask);
  }
  priorMask.clear();
  holesByEl.clear();

  for(const tile of bedrockTiles) {
    tile.remove();
  }
  bedrockTiles.length = 0;
  bedrockCells.clear();
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
