<!--
  InfiniteFlythrough.vue — Vue 3 wrapper for the framework-agnostic engine.

  <InfiniteFlythrough
    :items="myItems"
    :motion="{ inertia: 0.09, lanes: 5 }"
    ui="{ hud: true, controls: false }"
    @focus="onFocus"
    @release="onRelease"
    @lane-change="onLane"
    @card-click="onClick"
    ref="ft"
  />
-->
<template>
  <div ref="host" class="ift-vue-host" />
</template>

<script>
import { createFlythrough } from '../../src/infinite-flythrough.js';
import '../../src/styles.css';

let uid = 0;

export default {
  name: 'InfiniteFlythrough',
  props: {
    items:  { type: Array,  required: true },   // [{ title, src, type: 'img'|'video' }]
    motion: { type: Object, default: () => ({}) },
    style:  { type: Object, default: () => ({}) },
    ui:     { type: Object, default: () => ({}) },
    seed:   { type: Number, default: 21 },
  },
  emits: ['focus', 'release', 'lane-change', 'card-click'],
  data: () => ({ ft: null }),
  mounted() {
    this.ft = createFlythrough({
      container: this.$refs.host,
      items: this.items,
      motion: this.motion,
      style: this.style,
      ui: this.ui,
      seed: this.seed + uid++,
      onFocus:      it => this.$emit('focus', it),
      onRelease:    it => this.$emit('release', it),
      onLaneChange: l  => this.$emit('lane-change', l),
      onCardClick:  it => this.$emit('card-click', it),
    });
  },
  beforeUnmount() {
    if (this.ft) this.ft.destroy();
    this.ft = null;
  },
  methods: {
    focus(i)      { this.ft && this.ft.focus(i); },
    release()     { this.ft && this.ft.release(); },
    flyBy(px)     { this.ft && this.ft.flyBy(px); },
    setOption(k,v){ this.ft && this.ft.setOption(k, v); },
  },
};
</script>

<style>
.ift-vue-host { position: relative; width: 100%; height: 100%; min-height: 420px; }
</style>

