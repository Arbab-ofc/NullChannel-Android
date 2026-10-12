import { useLayoutEffect, useState, type CSSProperties } from 'react';

export function useViewportState() {
  const [state, setState] = useState<{style: CSSProperties; keyboardOpen: boolean}>({style: {}, keyboardOpen: false});
  useLayoutEffect(() => {
    const visible = window.visualViewport;
    let frame = 0;
    let baseline = window.innerHeight;
    let width = window.innerWidth;
    const update = () => {
      frame = 0;
      const editing = document.activeElement?.matches('input,textarea,[contenteditable="true"]') ?? false;
      if (width !== window.innerWidth) { width = window.innerWidth; baseline = window.innerHeight; }
      if (!editing) baseline = Math.max(window.innerHeight, visible?.height ?? 0);
      const normal = !visible || visible.scale === 1;
      const height = visible && normal ? `${visible.height}px` : undefined;
      const top = visible && normal ? `${visible.offsetTop}px` : undefined;
      const keyboardOpen = normal && editing && baseline - (visible?.height ?? window.innerHeight) > 120;
      setState(previous => previous.style.height === height && previous.style.top === top && previous.keyboardOpen === keyboardOpen ? previous : {style: {height, top}, keyboardOpen});
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    visible?.addEventListener('resize', schedule); visible?.addEventListener('scroll', schedule);
    window.addEventListener('resize', schedule); document.addEventListener('focusin', schedule); document.addEventListener('focusout', schedule);
    return () => { cancelAnimationFrame(frame); visible?.removeEventListener('resize', schedule); visible?.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); document.removeEventListener('focusin', schedule); document.removeEventListener('focusout', schedule); };
  }, []);
  return state;
}
export const useVisibleViewport = (): CSSProperties => useViewportState().style;
