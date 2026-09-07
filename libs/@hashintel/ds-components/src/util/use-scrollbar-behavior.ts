import { debounce } from "lodash-es";
import { useEffect } from "react";

import {
  alwaysVisibleScrollbarsClassName,
  scrollingAttribute,
} from "../preset/scrollbars";

/** Cached across calls — the OS preference cannot change within a page. */
let alwaysVisible: boolean | undefined;

/**
 * The width a plain scrollable element's scrollbar consumes in a pristine
 * `about:blank` iframe, or `undefined` when the probe cannot run. The iframe
 * document carries none of the host page's stylesheets, so the probe's
 * scrollbar is guaranteed native — probing the host document instead would
 * read the preset's own `::-webkit-scrollbar` styling, which forces a
 * space-consuming custom scrollbar and would report "always visible" for
 * everyone. Zero means overlay (auto-hiding) scrollbars.
 */
const measureNativeScrollbarWidth = (host: HTMLElement): number | undefined => {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.tabIndex = -1;
  // Must stay rendered (not display: none) so layout runs inside it.
  iframe.style.cssText =
    "position:fixed;top:-200px;left:0;width:100px;height:100px;border:0;visibility:hidden";
  host.appendChild(iframe);

  try {
    const probeDocument = iframe.contentDocument;
    const probeBody = probeDocument?.body;
    if (!probeDocument || !probeBody) {
      return undefined;
    }

    const probe = probeDocument.createElement("div");
    probe.style.cssText = "overflow:scroll;width:50px;height:50px";
    probeBody.appendChild(probe);

    return probe.offsetWidth - probe.clientWidth;
  } finally {
    iframe.remove();
  }
};

/**
 * Record the user's scrollbar-visibility preference on the document: when
 * the system renders classic, always-visible scrollbars (macOS "Show scroll
 * bars: Always", most Windows setups), `<html>` gains the
 * `ds-scrollbars-visible` class and the preset's scrollbar styling keeps
 * thumbs visible instead of revealing them on hover. With overlay
 * (auto-hiding) scrollbars — and until this check has run — thumbs stay
 * hidden until the pointer is over the scroll container or it is scrolled.
 */
const applyScrollbarVisibilityPreference = (): void => {
  if (alwaysVisible === undefined) {
    const nativeScrollbarWidth = measureNativeScrollbarWidth(document.body);
    if (nativeScrollbarWidth === undefined) {
      return;
    }
    alwaysVisible = nativeScrollbarWidth > 0;
  }

  document.documentElement.classList.toggle(
    alwaysVisibleScrollbarsClassName,
    alwaysVisible,
  );
};

/** How long the scrolling state outlives the last scroll event. */
const scrollingIdleMs = 800;

let scrollActivityTracked = false;

/**
 * Mark scroll containers with `data-ds-scrolling` while they are being
 * scrolled, clearing it once scrolling has been idle for a moment. The
 * preset's scrollbar styling shows a marked container's thumb in the dark
 * shade — scrolling feedback, and the only reveal for inputs that never
 * hover the container (keyboard scrolling).
 *
 * The removal is a lodash `debounce` per container, cached for the
 * container's lifetime. Scroll events fire per frame while scrolling, and
 * lodash debounces by recording the call time and letting one timer re-arm
 * itself for the remaining wait, so the per-event cost stays a lookup and a
 * timestamp rather than timer churn.
 *
 * One capture-phase listener on the document sees the (non-bubbling) scroll
 * events of every element as well as of the viewport, whose events arrive
 * targeted at the document itself.
 */
const trackScrollActivity = (): void => {
  if (scrollActivityTracked) {
    return;
  }
  scrollActivityTracked = true;

  const debouncedClears = new WeakMap<Element, () => void>();

  document.addEventListener(
    "scroll",
    (event) => {
      const scrolled =
        event.target instanceof Element
          ? event.target
          : document.documentElement;

      if (!scrolled.hasAttribute(scrollingAttribute)) {
        scrolled.setAttribute(scrollingAttribute, "");
      }

      let clearMark = debouncedClears.get(scrolled);
      if (!clearMark) {
        clearMark = debounce(() => {
          scrolled.removeAttribute(scrollingAttribute);
        }, scrollingIdleMs);
        debouncedClears.set(scrolled, clearMark);
      }
      clearMark();
    },
    { capture: true, passive: true },
  );
};

/**
 * Set up the runtime halves of the preset's scrollbar styling on the
 * document: the always-visible preference class (see
 * `applyScrollbarVisibilityPreference` above) and scroll-activity tracking
 * (see `trackScrollActivity` above).
 *
 * Safe to call repeatedly (each half runs once per page) and during SSR
 * (no-op). Call it — or the `useScrollbarBehavior` hook — once from the
 * component that renders the theme scope root (the element carrying the
 * scope class passed to the preset), as Petrinaut's editor and preview roots
 * do.
 */
export const applyScrollbarBehavior = (): void => {
  if (typeof document === "undefined") {
    return;
  }

  // `document.body` is typed non-null but is absent while the parser is
  // still inside <head>.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!document.body) {
    return;
  }

  applyScrollbarVisibilityPreference();
  trackScrollActivity();
};

/**
 * Ensures the preset's scrollbar runtime behavior is set up (see
 * {@link applyScrollbarBehavior}). Call this once from the component that
 * renders the theme scope root — not from individual scrollable components.
 */
export const useScrollbarBehavior = (): void => {
  useEffect(() => {
    applyScrollbarBehavior();
  }, []);
};
