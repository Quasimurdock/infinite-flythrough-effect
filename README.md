# Infinite Flythrough — Infinite Scroll Zoom Effect

Scroll becomes flight. A real 3D camera dives through a cloud of
image / video cards scattered across parallel lanes: near cards swell and
sweep past, distant ones rise from the dark. Click any card and the camera
flies to a berth in front of it, filling the viewport — release and the
flight continues from right there. Depth is chunked through **slot
recycling** (constant DOM, no resets, no snapping), so the dive is endless.

零依赖核心，框架无关（原生 / Vue 3 / React 18+ 均有一等封装）。

## Highlights

- **Real camera** — position + inertia + mouse parallax + perspective tilt
- **Multi-lane sparse cloud** — depth-compensated scatter fills the viewport
- **Click-to-dive** — programmatic too (`focus(i)` / `release()` / `flyBy(px)`)
- **Images & video** — videos decode only while visibly on screen
- **Performance layer** — dual-tier rasterisation (focused card promotes to
  full size once), dirty-checked style writes, `visibility` culling,
  blur quantisation, adaptive frame rate, background-tab rAF fallback
- **Optional UI** — HUD, live property panel, hint, progress bar; all toggleable
- **Theming** — everything routes through CSS variables on `.ift-root`
- **Accessible fallback** — `prefers-reduced-motion` respected throughout

## Structure

```
src/
  infinite-flythrough.js       framework-agnostic engine (ESM, zero deps)
  styles.css                   required styles (CSS-variable theming)
wrappers/
  vue/InfiniteFlythrough.vue   Vue 3 single-file component
  react/InfiniteFlythrough.jsx React 18+ wrapper + useFlythroughApi hook
examples/
  index.html                   standalone demo (double-click friendly)
scripts/
  serve.ps1                    local preview server (port 8787)
  build.mjs                    optional UMD bundle generator
```

## Quick start

### Demo

```
powershell ./scripts/serve.ps1     → http://localhost:8787
```
or open `examples/index.html` directly (no server needed).

### Vanilla

```html
<link rel="stylesheet" href="src/styles.css">
<div id="app" style="position:fixed;inset:0"></div>

<script type="module">
  import { createFlythrough } from './src/infinite-flythrough.js';

  const ft = createFlythrough({
    container: document.getElementById('app'),
    items: [
      { title: 'Dunes', type: 'img',   src: 'https://.../a.jpg' },
      { title: 'Drift', type: 'video', src: 'https://.../b.mp4' },
    ],
    ui: { hud: true, controls: true, title: 'Continuous Horizons' },
    motion: { inertia: 0.085, lanes: 4, autoCruise: 1.6 },
    onFocus: info => console.log(info),   // { index, title, lane, el }
  });
</script>
```

### Vue 3

```vue
<script setup>
import InfiniteFlythrough from './wrappers/vue/InfiniteFlythrough.vue';
const items = [/* { title, src, type } */];
</script>
<template>
  <InfiniteFlythrough :items="items" :motion="{ lanes: 5 }"
                      @focus="i => console.log(i)" />
</template>
```

### React 18+

```jsx
import { InfiniteFlythrough, useFlythroughApi } from './wrappers/react/InfiniteFlythrough.jsx';

function App(){
  const [ref, api] = useFlythroughApi();
  return <InfiniteFlythrough ref={ref} items={items}
    motion={{ lanes: 4 }} onFocus={info => console.log(info)} />;
}
```

## Options

### motion

| key | default | note |
|---|---|---|
| wheelFactor | 1.35 | wheel / touch fly speed |
| zoomScale | 1.05 | far↔near size contrast |
| inertia | 0.085 | damping (0.02 sticky – 0.3 floaty) |
| camAngle | 1.0 | perspective skew from mouse |
| camPerspective | 1200 | viewing distance, px |
| parallax | 30 | mouse pan amplitude, px |
| panelW | 100 | focus layout width, % of contain target |
| depthGap | 420 | base depth spacing, px |
| density | 24 | card slots (constant DOM count) |
| lanes | 4 | parallel flight lanes |
| laneSpread | 1.05 | lane separation × viewport width |
| autoCruise | 1.6 | idle forward drift px/frame @60fps (0 = off) |
| videoEvery | 5 | auto-video every Nth slot when type omitted |

### style

`radius` (16) · `radiusHov` (22) · `shadow` (60) · `panelW` (100)

### ui

`hud` · `controls` · `hint` · `progress` — booleans; `title` / `eyebrow` /
`foot` — copy strings (`title: null` hides the block).

### API

| method | note |
|---|---|
| `focus(index)` | fly to card N |
| `release()` | stay parked where the dive ended |
| `flyBy(px)` | programmatic flight (positive = forward) |
| `setOption(k, v)` | live-tune motion/style keys |
| `state` | `{ lane, travel, focused, focusK, camZ, cards }` |
| `destroy()` | full teardown, idempotent |

Events: `onFocus` · `onRelease` · `onLaneChange` · `onCardClick`.

## Theming

```css
.ift-root {
  --ift-bg: #05060a;
  --ift-accent: #7fd4c1;
  --ift-serif: "Songti SC", serif;
}
```

## Performance design

1. **Constant DOM** — slots recycle; card count never grows.
2. **Dual-tier rasterisation** — cards lay out at 42% (≈18% texture area);
   the focused card promotes to full layout once, so sharpness never costs
   the whole cloud.
3. **Write-through cache** — transform/opacity/filter/zIndex are
   dirty-checked; transform components are integer-quantised.
4. **Culling** — out-of-window cards get `visibility:hidden` (dropped from
   compositing, not merely transparent).
5. **Video throttle** — decode only while visible and opacity > 0.25.
6. **Adaptive frame rate** — full speed while diving, 30fps idle cruise.
7. **Background fallback** — rAF degrades to a 120ms timer when hidden.

## Accessibility

`prefers-reduced-motion` disables auto-cruise, thrust wobble and film
grain. Touch: vertical swipe = fly. Keyboard: bind `focus(i)`, `release()`,
`flyBy()` to your own shortcuts.

## License

MIT
