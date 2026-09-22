/* =====================================================================
   infinite-flythrough.esm.js
   ---------------------------------------------------------------------
   Framework-agnostic core for the "Infinite Scroll Zoom" effect:
   a real 3D camera flies forward through a cloud of image / video cards
   riding parallel lanes; depth is chunked through slot recycling, so the
   flight loops forever with no resets, no snapping, no DOM growth.

   Zero dependencies. Works with plain HTML, Vue, React, Svelte — anything
   that can hand you a DOM element.

   Usage:
     import { createFlythrough } from './infinite-flythrough.esm.js';
     const ft = createFlythrough({
       container: document.querySelector('#stage-root'),
       items: [{ title: 'Dunes', src: '...', type: 'img' }, ...],
       ui: { hud: true, controls: true, title: 'Continuous Horizons' },
       motion: { inertia: 0.085, depthGap: 420, lanes: 4 },
       style:  { radius: 16, shadow: 60, panelW: 100 },
       onFocus(card) {}, onRelease(card) {}, onLaneChange(lane) {},
     });
     // ft.focus(i) · ft.release() · ft.setOption(key, value) · ft.destroy()
   ===================================================================== */

const DEFAULT_MOTION = {
  wheelFactor: 1.35,     // fly speed from scroll
  zoomScale:   1.05,     // far↔near size contrast
  inertia:     0.085,    // smoothing / floatiness (0..1)
  camAngle:    1.00,     // perspective skew while flying
  camPerspective: 1200,  // viewing distance — foreshortening speed
  parallax:    30,       // mouse pan amplitude (px)
  panelW:      100,      // focus layout width, % of the contain target
  depthGap:    420,      // base depth spacing between cards (px)
  density:     24,       // number of card slots in the cloud
  lanes:       4,        // parallel flight lanes
  laneSpread:  1.05,     // lane separation, × viewport width
  autoCruise:  1.6,      // idle forward drift, px/frame @60fps (0 = off)
  videoEvery:  5,        // every Nth slot becomes a video (0 = never)
};

const DEFAULT_STYLE = {
  radius: 16,
  radiusHov: 22,
  shadow: 60,
  panelW: 100,
};

const DEFAULT_UI = {
  hud: true,             // top/bottom chrome + zoom/depth readout
  controls: true,        // the collapsible property panel
  hint: true,            // transient "scroll to fly" hint
  title: 'Continuous Horizons',
  eyebrow: 'A spatial scroll',
  foot: 'scroll to fly · click a card to dive in',
  progress: true,        // thin progress bar
};

/* deterministic pseudo-random for a stable, art-directed scatter */
function makeRand(seed){
  let s = seed >>> 0 || 21;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s & 0xffff) / 0xffff;
  };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* -------------------------------------------------------------- UI ---- */
// Optional chrome (HUD / panel / hint). Rendered into the container and
// torn down on destroy(); every piece is individually switchable.
function buildUI(container, uiOpt, handlers){
  const root = document.createElement('div');
  root.className = 'ift-ui';
  let hudZoom = null, hudDepth = null, progress = null, hint = null;

  if (uiOpt.progress){
    progress = document.createElement('div');
    progress.className = 'ift-progress';
    root.appendChild(progress);
  }
  if (uiOpt.hud){
    const hud = document.createElement('div');
    hud.className = 'ift-hud';
    hud.innerHTML =
      `<div class="ift-hud__top"><span>Infinite Scroll Zoom</span>` +
      `<div class="ift-hud__brace"></div><span>v2.0</span></div>` +
      `<div class="ift-hud__bottom"><span>CSS stage chunking · no resets</span>` +
      `<div class="ift-hud__readout"><span>Zoom&nbsp;<b data-ref="zoom">1.00</b></span>` +
      `<span>Depth&nbsp;<b data-ref="depth">0</b></span></div></div>`;
    hudZoom  = hud.querySelector('[data-ref=zoom]');
    hudDepth = hud.querySelector('[data-ref=depth]');
    root.appendChild(hud);
  }
  if (uiOpt.title !== null && uiOpt.title !== false){
    const t = document.createElement('div');
    t.className = 'ift-title';
    t.innerHTML =
      `<div class="ift-title__eyebrow"></div><h1></h1><div class="ift-title__foot"></div>`;
    t.querySelector('.ift-title__eyebrow').textContent = uiOpt.eyebrow;
    t.querySelector('h1').textContent = uiOpt.title;
    t.querySelector('.ift-title__foot').textContent = uiOpt.foot;
    root.appendChild(t);
  }
  if (uiOpt.hint){
    hint = document.createElement('div');
    hint.className = 'ift-hint';
    hint.textContent = 'scroll to dive · move to look around';
    root.appendChild(hint);
  }
  let controls = null, ctlToggle = null;
  if (uiOpt.controls){
    ctlToggle = document.createElement('button');
    ctlToggle.className = 'ift-ctl-toggle';
    ctlToggle.type = 'button';
    ctlToggle.textContent = 'Adjust';
    root.appendChild(ctlToggle);

    controls = document.createElement('aside');
    controls.className = 'ift-controls ift-controls--collapsed';
    controls.innerHTML = `
      <div class="ift-controls__head"><b>Motion · Layout</b><span>live</span></div>
      <div class="ift-controls__body">
        <div class="ift-controls__group"><h4>Flight</h4>
          <div class="ift-ctl"><label>Fly velocity</label><output data-o="wheelFactor"></output><input type="range" min="0.3" max="3" step="0.05" data-key="wheelFactor" data-f="2"></div>
          <div class="ift-ctl"><label>Near emphasis</label><output data-o="zoomScale"></output><input type="range" min="0.6" max="1.8" step="0.01" data-key="zoomScale" data-f="2"></div>
          <div class="ift-ctl"><label>Inertia</label><output data-o="inertia"></output><input type="range" min="0.02" max="0.3" step="0.005" data-key="inertia" data-f="3"></div>
          <div class="ift-ctl"><label>Depth spacing</label><output data-o="depthGap"></output><input type="range" min="160" max="900" step="10" data-key="depthGap" data-f="0"></div>
          <div class="ift-ctl"><label>Lanes</label><output data-o="lanes"></output><input type="range" min="1" max="8" step="1" data-key="lanes" data-f="0"></div>
        </div>
        <div class="ift-controls__group"><h4>Fake Camera</h4>
          <div class="ift-ctl"><label>Perspective</label><output data-o="camPerspective"></output><input type="range" min="600" max="3200" step="50" data-key="camPerspective" data-f="0"></div>
          <div class="ift-ctl"><label>Angle skew</label><output data-o="camAngle"></output><input type="range" min="0" max="3" step="0.05" data-key="camAngle" data-f="2"></div>
          <div class="ift-ctl"><label>Parallax pan</label><output data-o="parallax"></output><input type="range" min="0" max="120" step="1" data-key="parallax" data-f="0"></div>
        </div>
        <div class="ift-controls__group"><h4>Cloud</h4>
          <div class="ift-ctl"><label>Card size</label><output data-o="panelW"></output><input type="range" min="50" max="120" step="2" data-key="panelW" data-f="0"></div>
          <div class="ift-ctl"><label>Card count</label><output data-o="density"></output><input type="range" min="8" max="40" step="1" data-key="density" data-f="0"></div>
          <div class="ift-ctl"><label>Corner radius</label><output data-o="radius"></output><input type="range" min="0" max="40" step="1" data-key="radius" data-f="0"></div>
          <div class="ift-ctl"><label>Shadow depth</label><output data-o="shadow"></output><input type="range" min="0" max="100" step="1" data-key="shadow" data-f="0"></div>
        </div>
      </div>`;
    root.appendChild(controls);

    ctlToggle.addEventListener('click', () => {
      controls.classList.toggle('ift-controls--collapsed');
      ctlToggle.textContent = controls.classList.contains('ift-controls--collapsed') ? 'Adjust' : 'Close';
    });
    // wire the property panel to the live engine
    controls.querySelectorAll('input[type=range]').forEach(inp => {
      const key = inp.dataset.key, dec = parseInt(inp.dataset.f || '0');
      const out = controls.querySelector(`output[data-o="${key}"]`);
      const paint = v => {
        if (out) out.textContent = dec ? (+v).toFixed(dec) : String(Math.round(+v));
        const lo = +inp.min, hi = +inp.max;
        inp.style.setProperty('--fill', ((v - lo) / (hi - lo) * 100) + '%');
      };
      inp.addEventListener('input', () => { paint(inp.value); handlers.setOption(key, +inp.value); });
      inp._sync = v => { inp.value = v; paint(v); };
      paint(inp.value);
    });
  }
  container.appendChild(root);

  let hintT;
  return {
    root, hudZoom, hudDepth, progress, hint, controls,
    flashHint(){
      if (!hint) return;
      hint.classList.add('ift-hint--show');
      clearTimeout(hintT);
      hintT = setTimeout(() => hint.classList.remove('ift-hint--show'), 1600);
    },
    initialHint(){
      if (!hint) return;
      hint.classList.add('ift-hint--show');
      setTimeout(() => hint.classList.remove('ift-hint--show'), 3400);
    },
    syncControl(key, value){
      if (!controls) return;
      const inp = controls.querySelector(`input[data-key="${key}"]`);
      if (inp && inp._sync) inp._sync(value);
    },
  };
}

/* ----------------------------------------------------------- engine --- */
export function createFlythrough(userOpts = {}){
  const opts = {
    container: userOpts.container || null,
    items: userOpts.items || [],
    motion: { ...DEFAULT_MOTION, ...(userOpts.motion || {}) },
    style:  { ...DEFAULT_STYLE,  ...(userOpts.style  || {}) },
    ui:     { ...DEFAULT_UI,     ...(userOpts.ui     || {}) },
    onFocus: userOpts.onFocus || null,
    onRelease: userOpts.onRelease || null,
    onCardClick: userOpts.onCardClick || null,
    onLaneChange: userOpts.onLaneChange || null,
    seed: userOpts.seed || 21,
  };
  if (!opts.container) throw new Error('[infinite-flythrough] "container" is required');

  const container = typeof opts.container === 'string'
    ? document.querySelector(opts.container)
    : opts.container;
  if (!container) throw new Error('[infinite-flythrough] container not found');
  if (container.__ift) return container.__ift;    // idempotent mount

  const gui  = opts.motion;
  const styl = opts.style;
  const items = opts.items.length ? opts.items : demoItems();
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rootEl = document.documentElement;

  /* ---------------- DOM scaffold (all classes prefixed ift-) -------- */
  container.classList.add('ift-root');
  const viewport = document.createElement('div');
  viewport.className = 'ift-viewport';
  const viewer = document.createElement('div');
  viewer.className = 'ift-viewer';
  const stage = document.createElement('div');
  stage.className = 'ift-stage';
  viewer.appendChild(stage);
  viewport.appendChild(viewer);
  container.prepend(viewport);

  const ui = buildUI(container, opts.ui, { setOption });

  /* ---------------- state ---------------- */
  const cards = [];
  const cam = { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0 };
  let curLane = 0;
  let mouseX = 0, mouseY = 0, panX = 0, panY = 0, panTX = 0, panTY = 0, panK = 1;
  let running = false, destroyed = false, lastT = performance.now(), lastApply = 0;
  const focus = { card: null, k: 0, kT: 0 };
  let vw = window.innerWidth, vh = window.innerHeight;
  let FOCUS_W = 0, FOCUS_H = 0, BASE_W = 0, BASE_H = 0;
  let DEPTH_PERIOD = 1;
  const _last = new WeakMap();     // per-card style write cache

  const persp = () => gui.camPerspective;
  const rand = makeRand(opts.seed);   // engine-level deterministic scatter

  /* ---------------- geometry ---------------- */
  function computeWorld(){
    vw = window.innerWidth; vh = window.innerHeight;
    DEPTH_PERIOD = gui.depthGap * gui.density;
    FOCUS_W = Math.round(vw * (styl.panelW / 100) * 0.86 * 10) / 10;
    FOCUS_H = Math.round(FOCUS_W * 1.25);
    BASE_W  = Math.round(FOCUS_W * 0.42);
    BASE_H  = Math.round(BASE_W * 1.25);
    // write on the .ift-root element itself — inline beats the class defaults
    container.style.setProperty('--card-w', BASE_W + 'px');
    container.style.setProperty('--card-focus-w', FOCUS_W + 'px');
  }
  // Keep the layout vars glued to the live viewport: embedding hosts may
  // resize without firing window resize (CSS zoom, container transitions).
  // Cheap diff — writes only on drift.
  function syncLayoutVars(){
    const w = window.innerWidth, h = window.innerHeight;
    if (w !== vw || h !== vh){ computeWorld(); seedLanes(); }
  }
  function laneOffset(k){
    const n = gui.lanes;
    const fx = (n === 1) ? 0 : (k / (n - 1)) * 2 - 1;
    return {
      x: fx * gui.laneSpread * vw * 0.62,
      y: ((k % 2 === 0) ? -1 : 1) * (0.14 + 0.10 * (k % 3)) * vh,
    };
  }
  // depth of the Nth slot ahead — widening spacing, sparse far field
  const slotDepth = idx => gui.depthGap * (1.4 + idx * 1.5);
  const standDist = () => {
    const sW = (vw * 0.86) / FOCUS_W, sH = (vh * 0.88) / FOCUS_H;
    const sT = Math.min(sW, sH);
    return Math.max(60, persp() / sT - persp());
  };

  /* ---------------- card cloud ---------------- */
  function rehome(c, lane, z){
    const lo = laneOffset(lane);
    c.lane = lane;
    c.z = z;
    // depth-compensated scatter: far cards spread wide on screen too
    const rel = z - cam.z;
    const Sest = Math.max(0.12, persp() / (persp() - rel));
    c.jx = (rand() - 0.5) * vw * 0.60 / Sest;
    c.jy = (rand() - 0.5) * vh * 0.72 / Sest;
    c.x = lo.x + c.jx;
    c.y = lo.y + c.jy;
  }
  function seedLanes(){
    const per = Math.max(3, Math.ceil(gui.density / gui.lanes));
    const baseZ = cam.tz;
    let cur = 0, side = 0;
    for (const c of cards){
      if (c === focus.card) continue;
      if (cur < per) rehome(c, curLane, baseZ - slotDepth(cur)), cur++;
      else {
        const lane = (curLane + 1 + (side % Math.max(1, gui.lanes - 1))) % gui.lanes;
        rehome(c, lane, baseZ - slotDepth(0.6 + (side % 6) * 0.8));
        side++;
      }
    }
  }
  function recyclePassed(){
    let ahead = 0, side = 0;
    for (const c of cards){
      if (c === focus.card) continue;          // never touch the card being viewed
      const rel = c.z - cam.z;
      const passed = rel > -gui.depthGap * 0.4;
      if (c.lane === curLane){
        if (passed) rehome(c, curLane, cam.z - slotDepth(6 + (++ahead % 3)));
      } else if (passed || rel < -slotDepth(6)){
        const lane = (curLane + 1 + (side % Math.max(1, gui.lanes - 1))) % gui.lanes;
        rehome(c, lane, cam.z - slotDepth(0.5 + (side % 5) * 0.9));
        side++;
      }
    }
  }
  function buildCloud(){
    stage.innerHTML = '';
    cards.length = 0;
    const n = gui.density;
    for (let i = 0; i < n; i++){
      const lane = i % gui.lanes;
      const idx = Math.floor(i / gui.lanes);
      const it = items[i % items.length];
      const el = document.createElement('div');
      el.className = 'ift-panel';
      el.dataset.i = String(i);
      const isVideo = it.type === 'video' || (gui.videoEvery > 0 && i % gui.videoEvery === 3 && !it.type);
      const media = isVideo
        ? `<video src="${it.src}" muted loop playsinline preload="metadata" class="ift-panel__media"></video>`
        : `<img src="${it.src}" alt="${it.title || ''}" loading="lazy" draggable="false" class="ift-panel__media">`;
      el.innerHTML =
        `<div class="ift-panel__frame">${media}</div>` +
        `<div class="ift-panel__caption"><span class="t">${it.title || ''}</span>` +
        `<span class="n">${String(i + 1).padStart(2, '0')}</span></div>`;
      stage.appendChild(el);
      const card = {
        el, media: el.querySelector('.ift-panel__media'),
        lane, z: -(idx * (gui.depthGap * gui.lanes)) - gui.depthGap,
        size: 0.06 + rand() * 0.20,
        slice: rand() * 40 - 20,
        title: it.title || '',
      };
      const lo = laneOffset(lane);
      card.jx = (rand() - 0.5) * vw * 0.10;
      card.jy = (rand() - 0.5) * vh * 0.14;
      card.x = lo.x + card.jx;
      card.y = lo.y + card.jy;
      cards.push(card);
    }
  }

  /* ---------------- write-through style cache ---------------- */
  function put(c, key, val){
    let m = _last.get(c.el);
    if (!m){ m = {}; _last.set(c.el, m); }
    if (m[key] !== val){ m[key] = val; c.el.style[key] = val; }
  }

  /* ---------------- render ---------------- */
  function apply(){
    const P = persp();
    const thrust = reduceMotion ? 1 : (1 + 0.025 * Math.sin(cam.z * 0.0006));
    const winDepth = gui.depthGap * 5;

    for (const c of cards){
      const rz = c.z - cam.z;
      const el = c.el;
      if (rz > -8 || rz < -winDepth){
        put(c, 'visibility', 'hidden');
        put(c, 'pointerEvents', 'none');
        if (c.media && c.media.tagName === 'VIDEO' && !c.media.paused) c.media.pause();
        continue;
      }
      put(c, 'visibility', 'visible');

      const S = P / (P - rz);
      const g = clamp(1 + rz / (gui.depthGap * 6), 0, 1);
      const focused = focus.card === c;
      const inFocus = focus.k > 0.1;

      let opacity = 1, blur;
      if (focused && inFocus){ opacity = 1; blur = 0; }
      else if (inFocus){ opacity = 0.08; blur = Math.max(0, 1 - g) * 1.5; }
      else {
        if (g > 0.94) opacity = Math.max(0, 1 - (g - 0.94) / 0.06);
        blur = Math.max(0, 1 - g) * 1.5;
      }
      const haze = 0.88 + 0.12 * g;
      const sx = (c.x - cam.x) * S;
      const sy = (c.y - cam.y) * S;

      let cardScale, rot;
      if (focused){
        if (inFocus && !c._fc){ el.classList.add('ift-panel--focused'); c._fc = true; }
        cardScale = c.size + (1 - c.size) * focus.k;
        rot = c.slice * (1 - focus.k);
      } else {
        if (c._fc){ el.classList.remove('ift-panel--focused'); c._fc = false; }
        const depthK = 1 + (1 - g) * (gui.zoomScale - 1) * 2;
        cardScale = Math.max(0.03, c.size * thrust * depthK);
        rot = c.slice;
      }
      put(c, 'transform',
        `translate3d(${sx|0}px, ${sy|0}px, ${rz|0}px) ` +
        `translate(-50%,-50%) rotate(${(rot*10|0)/10}deg) scale(${(cardScale*10000|0)/10000})`);
      const finalOp = (focused && inFocus) ? 1 : opacity * haze;
      put(c, 'opacity', finalOp.toFixed(3));
      let filterStr = '';
      if (!(focused && inFocus) && blur >= 0.8)
        filterStr = `blur(${Math.min(3, Math.round(blur * 2) / 2)}px)`;
      put(c, 'filter', filterStr);
      put(c, 'zIndex', (focused && inFocus) ? '5000' : String(Math.round(g * 1000)));

      if (c.media && c.media.tagName === 'VIDEO'){
        const playing = !c.media.paused;
        if (finalOp > 0.25 && !playing) c.media.play().catch(()=>{});
        else if (finalOp <= 0.25 && playing) c.media.pause();
      }
      put(c, 'pointerEvents',
        (!focus.card || focus.k < 0.05) ? 'auto' : (focused ? 'auto' : 'none'));
    }

    viewer.style.transform =
      `translate(-50%,-50%) translate(${panX.toFixed(1)}px, ${panY.toFixed(1)}px) ` +
      `rotateX(${(-panY * gui.camAngle * 2).toFixed(3)}deg) ` +
      `rotateY(${( panX * gui.camAngle * 2.4).toFixed(3)}deg)`;

    if (ui.progress){
      const pp = (((-cam.tz) % DEPTH_PERIOD) + DEPTH_PERIOD) % DEPTH_PERIOD / DEPTH_PERIOD * 100;
      ui.progress.style.width = pp.toFixed(2) + '%';
    }
    if (ui.hudZoom)  ui.hudZoom.textContent  = thrust.toFixed(2);
    if (ui.hudDepth) ui.hudDepth.textContent =
      (((cam.z % DEPTH_PERIOD) + DEPTH_PERIOD) % DEPTH_PERIOD / DEPTH_PERIOD).toFixed(2);
  }

  /* ---------------- loop ---------------- */
  // rAF is throttled to ~0 in background tabs; keep the flight alive with a
  // low-frequency timer fallback so the idle cruise never freezes.
  const raf = cb => {
    if (typeof document !== 'undefined' && document.hidden)
      return setTimeout(() => cb(performance.now()), 120);
    return requestAnimationFrame(cb);
  };
  function loop(){
    if (destroyed) return;
    running = true;
    const t = performance.now();
    const dt = Math.min((t - lastT) / 16.667, 3);
    lastT = t;

    const camRate = Math.min(1, gui.inertia * 2.4 * dt);
    cam.x += (cam.tx - cam.x) * camRate;
    cam.y += (cam.ty - cam.y) * camRate;
    cam.z += (cam.tz - cam.z) * camRate;

    panK = 1 - Math.min(1, focus.k * 0.85);
    panTX = mouseX * gui.parallax * panK;
    panTY = mouseY * gui.parallax * 0.5 * panK;
    panX += (panTX - panX) * Math.min(1, gui.inertia * 2.2 * dt);
    panY += (panTY - panY) * Math.min(1, gui.inertia * 2.2 * dt);

    focus.k += ((focus.card ? 1 : 0) - focus.k) * Math.min(1, 0.10 * dt * 4);
    focus.k = clamp(focus.k, 0, 1);
    if (!focus.card && focus.k <= 0.001) focus.kT = 0;

    const fast = focus.card !== null ||
                 Math.abs(cam.tz - cam.z) > 2 ||
                 Math.abs(cam.tx - cam.x) > 0.5;
    if (!fast && t - lastApply < 32){ raf(loop); return; }
    lastApply = t;

    syncLayoutVars();
    apply();
    if (!focus.card) recyclePassed();

    const moving = Math.abs(cam.tx - cam.x) > 0.05 ||
                   Math.abs(cam.ty - cam.y) > 0.05 ||
                   Math.abs(cam.tz - cam.z) > 0.05 ||
                   Math.abs(panTX - panX) > 0.02 ||
                   Math.abs(panTY - panY) > 0.02 ||
                   Math.abs(focus.kT - focus.k) > 0.004;
    if (moving) raf(loop);
    else { running = false; apply(); }
  }

  /* ---------------- actions ---------------- */
  // cam.tz is the single source of truth for flight: forward = decreasing.
  function fly(d, user = true){
    if (user && focus.k > 0.01) release();
    cam.tz -= d;           // forward = deeper (-Z): cards swell toward you
    ui.flashHint();
    if (!running) loop();
  }
  function focusCard(card){
    focus.card = card;
    focus.kT = 1;
    // If the card sits beyond the visible depth window (it was recycled
    // deep), pull it to the near end of the window first — otherwise the
    // camera would dive to a berth OUTSIDE the window and the hero would
    // never be rendered.
    const rel = card.z - cam.z;
    const winDepth = gui.depthGap * 5;
    if (rel < -winDepth * 0.75 || rel > -gui.depthGap * 0.5){
      card.z = cam.z - winDepth * 0.7;
      const lo = laneOffset(card.lane);
      card.jx = (rand() - 0.5) * vw * 0.60;
      card.jy = (rand() - 0.5) * vh * 0.72;
      card.x = lo.x + card.jx;
      card.y = lo.y + card.jy;
    }
    const d = standDist();
    cam.tx = card.x;
    cam.ty = card.y;
    cam.tz = card.z + d;
    const laneSwitch = card.lane !== curLane;
    curLane = card.lane;
    if (laneSwitch){ seedLanes(); if (opts.onLaneChange) opts.onLaneChange(curLane); }
    if (!running) loop();
  }
  function release(){
    const c = focus.card;
    focus.kT = 0;
    focus.card = null;          // cleared FIRST — no ghost focus can survive
    if (c){
      // re-home just ahead of the parked camera — it joins the flow at
      // NORMAL cloud size, then swells past and recycles as you cruise.
      c.z = cam.tz - gui.depthGap * 1.6;
      const lo = laneOffset(c.lane);
      c.x = lo.x + c.jx; c.y = lo.y + c.jy;
      if (opts.onRelease) opts.onRelease(cardInfo(c));
    }
    // stay parked exactly where the dive ended — no fly-back
    if (!running) loop();
  }
  const cardInfo = c => ({ index: +c.el.dataset.i, title: c.title, lane: c.lane, el: c.el });

  /* ---------------- input (scoped) ---------------- */
  const onWheel = e => {
    if (reduceMotion) return;
    e.preventDefault();
    const dy = (e.deltaMode === 1) ? e.deltaY * 34 : e.deltaY;
    fly((dy + (e.deltaX || 0) * 0.6) * gui.wheelFactor);
  };
  let lastTouchY = 0;
  const onTouchStart = e => { lastTouchY = e.touches[0].clientY; };
  const onTouchMove = e => {
    if (reduceMotion) return;
    const y = e.touches[0].clientY;
    fly((lastTouchY - y) * 2.4);
    lastTouchY = y;
    e.preventDefault();
  };
  const onMouseMove = e => {
    const r = viewport.getBoundingClientRect();
    mouseX = (e.clientX - r.left) / r.width - 0.5;
    mouseY = (e.clientY - r.top) / r.height - 0.5;
  };
  const onClick = ev => {
    const p = ev.target.closest('.ift-panel');
    if (focus.k > 0.5 && focus.card){ release(); return; }
    if (!p) return;
    const card = cards[+p.dataset.i];
    if (!card) return;
    if (focus.card === card){ release(); return; }
    if (opts.onCardClick) opts.onCardClick(cardInfo(card));
    focusCard(card);
  };
  const onResize = () => { computeWorld(); seedLanes(); };

  window.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('mousemove', onMouseMove, { passive: true });
  window.addEventListener('resize', onResize);
  stage.addEventListener('click', onClick);

  /* ---------------- default demo media ---------------- */
  function demoItems(){
    const IDS = [1015,1016,1018,1036,1043,1050,1052,1057,1040,1025,1011,7];
    return IDS.map((id, i) => ({
      title: ['Dunes','Night Fields','Summit','Harbor','Lane','Wild',
              'Stone','Vast','Glass','Gates','Peak','Meadow'][i],
      src: `https://picsum.photos/id/${id}/3200/4000`,
      type: 'img',
    }));
  }

  /* ---------------- public API ---------------- */
  function setOption(key, value){
    if (key in gui){
      gui[key] = key === 'density' || key === 'lanes' ? Math.round(value) : value;
      computeWorld();
      if (key === 'density'){ buildCloud(); seedLanes(); }
      else if (key === 'lanes'){ curLane = clamp(curLane, 0, gui.lanes - 1); seedLanes(); }
      else seedLanes();
    } else if (key in styl){
      styl[key] = value;
      if (key === 'radius'){
        rootEl.style.setProperty('--panel-radius', value + 'px');
        rootEl.style.setProperty('--panel-radius-hov', Math.min(48, value + 8) + 'px');
      } else if (key === 'shadow'){
        rootEl.style.setProperty('--panel-shadow',
          `0 ${(value*0.4)|0}px ${(value*2.2)|0}px rgba(0,0,0,${(0.45 + value/150).toFixed(3)})`);
      } else { computeWorld(); seedLanes(); }
      ui.syncControl(key, value);
      return;
    }
    ui.syncControl(key, value);
  }

  const api = {
    focus(i){ const c = cards[i]; if (c && c !== focus.card) focusCard(c); },
    release,
    flyBy(px){ fly(px, false); },
    setOption,
    get state(){
      const fc = focus.card;
      return { lane: curLane, travel: Math.round(-cam.tz), focused: fc ? +fc.el.dataset.i : null,
               focusK: +focus.k.toFixed(3), camZ: Math.round(cam.z), camTz: Math.round(cam.tz),
               cards: cards.length,
               debug: fc ? { cardZ: Math.round(fc.z), rel: Math.round(fc.z - cam.z),
                             berth: Math.round(cam.tz), d: Math.round(standDist()),
                             size: +fc.size.toFixed(3) } : null };
    },
    destroy(){
      destroyed = true;
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', onResize);
      stage.removeEventListener('click', onClick);
      ui.root.remove();
      viewport.remove();
      delete container.__ift;
      container.classList.remove('ift-root');
    },
  };
  container.__ift = api;

  /* ---------------- boot ---------------- */
  computeWorld();
  buildCloud();
  seedLanes();
  apply();
  ui.initialHint();

  if (!reduceMotion && gui.autoCruise > 0){
    (function cruise(){
      if (destroyed) return;
      // SELF-HEAL: a focus that eased back to zero but was never released
      // (race on a recycled card, stray click) would freeze the cruise —
      // detect the ghost and clear it so the flight never dies.
      if (focus.card !== null && focus.k < 0.02) focus.card = null;
      if (focus.card === null && !running){
        cam.tz -= gui.autoCruise;   // toward the cards
        loop();
      }
      // self-sustaining even when rAF is background-throttled
      if (document.hidden) setTimeout(cruise, 200);
      else requestAnimationFrame(cruise);
    })();
  }
  return api;
}

export default createFlythrough;


