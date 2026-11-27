import { useCallback } from "react";

export const dropdownSizeVars = [
  "--dropdown-max-height",
  "--dropdown-max-width",
] as const;

/**
 * Lets the list's size variables be set on (or above) the element that opens
 * it — e.g. a `className` on a Select or Combobox — even though the content
 * is portaled out of that subtree. On every open, the anchor's (the element
 * whose `aria-controls` names the content) computed values are copied onto
 * the positioner, so a value set on the content itself still wins.
 *
 * Returns a callback ref for the content element, which may mount lazily.
 */
export const useAnchorSizeVars = () =>
  useCallback((content: HTMLElement | null) => {
    if (!content) {
      return undefined;
    }

    const sync = () => {
      const positioner = content.parentElement;
      if (
        !content.id ||
        !positioner ||
        content.getAttribute("data-state") !== "open"
      ) {
        return;
      }
      const anchor = content.ownerDocument.querySelector(
        `[aria-controls="${CSS.escape(content.id)}"]`,
      );
      const anchorStyle = anchor ? getComputedStyle(anchor) : null;
      for (const name of dropdownSizeVars) {
        const value = anchorStyle?.getPropertyValue(name).trim();
        if (value) {
          positioner.style.setProperty(name, value);
        } else {
          positioner.style.removeProperty(name);
        }
      }
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(content, { attributeFilter: ["data-state"] });
    return () => observer.disconnect();
  }, []);
