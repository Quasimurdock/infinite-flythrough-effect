/* =====================================================================
   InfiniteFlythrough.jsx — React 18+ wrapper for the framework-agnostic
   engine. Zero deps beyond react itself.

   <InfiniteFlythrough
     items={myItems}
     motion={{ inertia: 0.09, lanes: 5 }}
     ui={{ hud: true, controls: false }}
     onFocus={onFocus}
     onRelease={onRelease}
     onLaneChange={onLane}
     onCardClick={onClick}
     ref={ftRef}
   />
   ===================================================================== */
import { useEffect, useImperativeHandle, forwardRef, useMemo } from 'react';
import { createFlythrough } from '../../src/infinite-flythrough.js';
import '../../src/styles.css';

export const InfiniteFlythrough = forwardRef(function InfiniteFlythrough(
  { items, motion = {}, style = {}, ui = {}, seed = 21,
    onFocus, onRelease, onLaneChange, onCardClick, ...rest },
  ref
) {
  const hostRef = useRefWithId();

  // keep latest callbacks without re-creating the engine
  const cbs = useMemo(() => ({
    onFocus, onRelease, onLaneChange, onCardClick,
  }), [onFocus, onRelease, onLaneChange, onCardClick]);
  const cbsRef = useRefShim(cbs);

  useEngine(hostRef, items, motion, style, ui, seed, cbsRef, ref);

  return <div ref={hostRef} className="ift-react-host" {...rest} />;
});

/* tiny helpers kept inline so this file stays single-file portable */
import { useRef, useCallback } from 'react';
function useRefWithId(){
  return useRef(null);
}
function useRefShim(value){
  const r = useRef(value);
  r.current = value;
  return r;
}

function useEngine(hostRef, items, motion, style, ui, seed, cbsRef, ref){
  const engineRef = useRef(null);
  const itemsKey = useMemo(() => items.map(it => it.src).join('|'), [items]);

  useEffect(() => {
    if (!hostRef.current) return;
    const ft = createFlythrough({
      container: hostRef.current,
      items,
      motion, style, ui, seed,
      onFocus:      it => cbsRef.current.onFocus && cbsRef.current.onFocus(it),
      onRelease:    it => cbsRef.current.onRelease && cbsRef.current.onRelease(it),
      onLaneChange: l  => cbsRef.current.onLaneChange && cbsRef.current.onLaneChange(l),
      onCardClick:  it => cbsRef.current.onCardClick && cbsRef.current.onCardClick(it),
    });
    engineRef.current = ft;
    return () => { ft.destroy(); engineRef.current = null; };
    // engine is (re)created only when the media set or structural props change
  }, [hostRef, itemsKey, motion, style, ui, seed, cbsRef]);

  useImperativeHandle(ref, () => ({
    focus: i => engineRef.current?.focus(i),
    release: () => engineRef.current?.release(),
    flyBy: px => engineRef.current?.flyBy(px),
    setOption: (k, v) => engineRef.current?.setOption(k, v),
    get state(){ return engineRef.current?.state; },
  }), []);
}

export function useFlythroughApi(){
  // convenience: attach to the ref you pass to <InfiniteFlythrough ref={...}/>
  const ref = useRef(null);
  const api = useMemo(() => ({
    focus: i => ref.current?.focus(i),
    release: () => ref.current?.release(),
    flyBy: px => ref.current?.flyBy(px),
    setOption: (k, v) => ref.current?.setOption(k, v),
  }), []);
  return [ref, api];
}

export default InfiniteFlythrough;

