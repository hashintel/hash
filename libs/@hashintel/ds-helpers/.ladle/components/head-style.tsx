import { useLayoutEffect } from "react";

interface HeadStyleProps {
  id: string;
  css: string;
}

const refCounts = new Map<string, number>();

/**
 * Injects a <style> element into document.head with the given CSS.
 * Uses useLayoutEffect to apply styles before paint, avoiding flash of unstyled content.
 * Multiple instances with the same id share a single element; the element is only
 * removed when all instances have unmounted.
 */
export function HeadStyle({ id, css }: HeadStyleProps) {
  useLayoutEffect(() => {
    let el = document.getElementById(id) as HTMLStyleElement | null;

    if (!el) {
      el = document.createElement("style");
      el.id = id;
      document.head.appendChild(el);
    }

    refCounts.set(id, (refCounts.get(id) ?? 0) + 1);
    el.textContent = css;

    return () => {
      const count = (refCounts.get(id) ?? 1) - 1;
      if (count <= 0) {
        refCounts.delete(id);
        el?.remove();
      } else {
        refCounts.set(id, count);
      }
    };
  }, [id, css]);

  return null;
}
