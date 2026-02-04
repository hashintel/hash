import { useLayoutEffect, useRef } from "react";

interface HeadStyleProps {
  id: string;
  css: string;
}

// Track reference counts for shared style elements
const refCounts = new Map<string, number>();

/**
 * Injects a <style> element into document.head with the given CSS.
 * Uses useLayoutEffect to apply styles before paint, avoiding flash of unstyled content.
 * Multiple instances with the same id share a single element; the element is only
 * removed when all instances have unmounted.
 */
export function HeadStyle({ id, css }: HeadStyleProps) {
  const elRef = useRef<HTMLStyleElement | null>(null);

  useLayoutEffect(() => {
    let el = document.getElementById(id) as HTMLStyleElement | null;

    if (!el) {
      el = document.createElement("style");
      el.id = id;
      document.head.appendChild(el);
    }

    refCounts.set(id, (refCounts.get(id) ?? 0) + 1);
    el.textContent = css;
    elRef.current = el;

    return () => {
      const count = (refCounts.get(id) ?? 1) - 1;
      if (count <= 0) {
        refCounts.delete(id);
        elRef.current?.remove();
      } else {
        refCounts.set(id, count);
      }
    };
  }, [id, css]);

  return null;
}
