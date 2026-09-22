# Infinite Flythrough — 无限滚动缩放（Infinite Scroll Zoom）

滚动即飞行。相机沿 -Z 深处穿行一片由图片/视频卡片组成的多航道点云：
近处卡片放大掠过、深处卡片迎面浮现，点击任意卡片相机真实飞到它面前
铺满视口，释放后原地续航。深度通过**槽位循环复用**（CSS stage chunking
思想）实现无限飞行——无吸附、无重置、DOM 数量恒定。

- 零依赖核心，框架无关（原生 / Vue 3 / React 18+ 均有一等封装）
- 真实相机系统（位置 + 惯性 + 鼠标视差 + 透视倾斜）
- 多航道（lanes）散布 + 深度补偿散开，铺满视口
- 性能层：双档光栅化（聚焦卡按需升全尺寸）、视频可视区节流解码、
  blur 量化限额、脏检查样式写入、visibility 裁剪、自适应帧率、
  后台标签页 rAF 兜底

---

## 目录结构

```
dist/
  infinite-flythrough.esm.js   # 框架无关核心（ES Module，零依赖）
  infinite-flythrough.umd.js   # 浏览器全局构建（file:// 双击可用）
  infinite-flythrough.css      # 必需样式（主题走 CSS 变量）
  serve.ps1                    # 本地预览服务器（PowerShell，端口 8787）
  vue/InfiniteFlythrough.vue   # Vue 3 封装
  react/InfiniteFlythrough.jsx # React 18+ 封装
index.html                     # 独立 demo（ESM 优先，UMD 兜底）
```

## 快速开始

### 0) 看 demo

```
powershell ./dist/serve.ps1     # → http://localhost:8787
```
或直接双击 `index.html`（自动回退 UMD 构建）。

### 1) 原生页面

```html
<link rel="stylesheet" href="dist/infinite-flythrough.css">
<div id="app" style="position:fixed;inset:0"></div>

<script type="module">
  import { createFlythrough } from './dist/infinite-flythrough.esm.js';

  const ft = createFlythrough({
    container: document.getElementById('app'),
    items: [
      { title: 'Dunes', type: 'img',   src: 'https://.../a.jpg' },
      { title: 'Drift', type: 'video', src: 'https://.../b.mp4' },
      // ...至少 8 条；自动循环取用
    ],
    ui: { hud: true, controls: true, title: 'Continuous Horizons' },
    motion: { inertia: 0.085, lanes: 4, autoCruise: 1.6 },
    style: { radius: 16, shadow: 60, panelW: 100 },
    onFocus: info => console.log(info),   // { index, title, lane, el }
    onRelease: info => {},
    onLaneChange: lane => {},
    onCardClick: info => {},              // 聚焦前触发（可拦截/埋点）
  });
</script>
```

### 2) Vue 3

```vue
<script setup>
import InfiniteFlythrough from './dist/vue/InfiniteFlythrough.vue';
import { ref } from 'vue';
const ft = ref(null);
const items = [/* 同上 */];
</script>

<template>
  <InfiniteFlythrough
    ref="ft" :items="items"
    :motion="{ lanes: 5 }" :ui="{ controls: false }"
    @focus="i => console.log(i)" @lane-change="l => console.log(l)"
  />
</template>
```

组件方法：`ft.value.focus(i) / release() / flyBy(px) / setOption(k, v)`。
卸载时自动 `destroy()`，无泄漏。

### 3) React

```jsx
import { useRef } from 'react';
import { InfiniteFlythrough, useFlythroughApi } from './dist/react/InfiniteFlythrough.jsx';

function App(){
  const [ref, api] = useFlythroughApi();
  return <InfiniteFlythrough ref={ref} items={items}
    motion={{ lanes: 4 }} onFocus={info => console.log(info)} />;
}
```

引擎仅在 `items` 的 src 集合或结构 props 变化时重建；回调经 ref 转发，
不因渲染函数重跑而重建引擎。

---

## 配置

### motion（飞行与相机）

| 键 | 默认 | 说明 |
|---|---|---|
| wheelFactor | 1.35 | 滚轮/触摸飞行灵敏度 |
| zoomScale | 1.05 | 远↔近尺寸对比强度（近景强调） |
| inertia | 0.085 | 惯性/阻尼（0.02 极黏 – 0.3 极飘） |
| camAngle | 1.0 | 鼠标视差引起的透视倾斜强度 |
| camPerspective | 1200 | 透视视距（px），越小纵越猛 |
| parallax | 30 | 鼠标平移视差幅度（px） |
| panelW | 100 | 聚焦布局宽 = 视口宽 × 0.86 × panelW% |
| depthGap | 420 | 基础深度间距（px），实际随距离递增 |
| density | 24 | 卡片槽位数（DOM 恒定值） |
| lanes | 4 | 平行航道数 |
| laneSpread | 1.05 | 航道横向间距（× 视口宽） |
| autoCruise | 1.6 | 怠速自动前进 px/帧@60fps（0 = 关闭） |
| videoEvery | 5 | 未标注 type 时，每 N 槽自动当视频（0 = 关） |

### style（卡片外观）

| 键 | 默认 | 说明 |
|---|---|---|
| radius / radiusHov | 16 / 22 | 圆角（悬停自动 +8） |
| shadow | 60 | 阴影深度 0–100 |
| panelW | 100 | 同 motion.panelW（同步） |

### ui（可选界面层，全部可独立开关）

| 键 | 默认 | 说明 |
|---|---|---|
| hud | true | 顶部/底部信息条 + Zoom/Depth 读数 |
| controls | true | 右侧可折叠参数面板（实时热更） |
| hint | true | 「scroll to dive」瞬时提示 |
| progress | true | 底部进度条（一个飞行周期） |
| title / eyebrow / foot | — | 左上标题块文案（`title: null` 隐藏整块） |

### 主题

颜色/字体走 `.ift-root` 上的 CSS 变量，覆盖即可换肤：

```css
.ift-root {
  --ift-bg: #05060a;
  --ift-accent: #7fd4c1;
  --ift-serif: "Songti SC", serif;
}
```

---

## 公共 API

| 方法 | 说明 |
|---|---|
| `focus(index)` | 编程式聚焦第 index 张卡（相机真实飞行） |
| `release()` | 释放聚焦（原地驻留，不回飞） |
| `flyBy(px)` | 编程式前进/倒退（正=前进） |
| `setOption(key, value)` | 运行时热更 motion/style 参数 |
| `state` | getter：`{ lane, travel, focused, focusK, camZ, cards }` |
| `destroy()` | 完全卸载（移除 DOM/监听/rAF，幂等） |

## 性能设计（为何它快）

1. **恒定 DOM**：槽位循环复用，任何时刻 DOM 卡数 = density。
2. **双档光栅化**：卡片平时按 42% 布局光栅化（纹理面积约 18%），
   被聚焦的卡通过 `.ift-panel--focused` 一次性升到全尺寸重栅格——
   清晰度与合成成本解耦。
3. **写穿缓存**：transform/opacity/filter/zIndex 全部脏检查，
   值不变不触 style 重算；transform 分量整数量化。
4. **视口裁剪**：窗口外卡片 `visibility:hidden` 直接踢出合成树，
   近平面/远窗双阈值。
5. **视频节流**：仅可视且不透明度 >0.25 的视频卡解码。
6. **自适应帧率**：俯冲/快飞全速 60fps，怠速巡航 30fps。
7. **后台兜底**：document.hidden 时 rAF 自动降级为 120ms 定时器，
   切回前台无感恢复。

## 无障碍 / 降级

- `prefers-reduced-motion: reduce`：关闭自动巡航、thrust 抖动与胶片颗粒，
  飞行变为即时定位。
- 触屏：垂直滑动 = 前飞，`touchmove` 已 `preventDefault` 防页面回弹。
- 纯键盘：`focus(i)` / `release()` / `flyBy()` 可自行绑定快捷键。

## 常见问题

**为什么聚焦的图很清晰而缩略图略软？**
缩略图按 42% 布局光栅化（性能预算），聚焦瞬间单卡升全尺寸。视觉上
缩略图处于运动+景深中差异不可感，聚焦图 100% 锐利。

**滚动方向可以反过来吗？**
交换 `fly()` 与 `autoBreathe` 中的符号（`cam.tz -= d` → `+= d`），
并把 `rehome`/`seedLanes` 中的 `- slotDepth(...)` 取反即可。

**如何接入真实数据？**
`items` 换成你的接口数组即可；`onCardClick` 里可拿 `{ index, title, lane, el }`
做路由跳转或埋点。

## License

内部演示用途；媒体示例来自 picsum.photos 与 test-videos.co.uk。
