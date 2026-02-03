import { useLayoutEffect, useRef } from "react";

interface HeadStyleProps {
  id: string;
  css: string;
}

/**
 * Injects a <style> element into document.head with the given CSS.
 * Uses useLayoutEffect to apply styles before paint, avoiding flash of unstyled content.
 */
export function HeadStyle({ id, css }: HeadStyleProps) {
  const elRef = useRef<HTMLStyleElement | null>(null);
  const ownerRef = useRef(false);

  useLayoutEffect(() => {
    let el = document.getElementById(id) as HTMLStyleElement | null;

    if (!el) {
      el = document.createElement("style");
      el.id = id;
      document.head.appendChild(el);
      ownerRef.current = true;
    } else {
      ownerRef.current = false;
    }

    el.textContent = css;
    elRef.current = el;

    return () => {
      if (ownerRef.current) {
        elRef.current?.remove();
      }
    };
  }, [id, css]);

  return null;
}
