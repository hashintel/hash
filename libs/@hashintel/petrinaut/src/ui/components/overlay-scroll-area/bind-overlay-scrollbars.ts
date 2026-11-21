/**
 * The scrollbars of an `OverlayScrollArea`, kept in step with its viewport
 * by direct writes. A resize or a scroll changes the size and the place of a
 * thumb, and each is written on the thumb itself: a custom property on the
 * root or the viewport would restyle every element of the content.
 */

/** A thumb never gets shorter than this, however long the content. */
const minThumbSize = 20;

/** The padding of a scrollbar around its thumb, as `scrollbarStyle` sets it. */
const scrollbarPadding = 2;

type Orientation = "vertical" | "horizontal";

const part = (root: HTMLElement, name: string, orientation?: Orientation) =>
  root.querySelector<HTMLElement>(
    `:scope > [data-part="${name}"]${
      orientation ? `[data-orientation="${orientation}"]` : ""
    }`,
  );

const flag = (element: HTMLElement, name: string, on: boolean) => {
  if (element.hasAttribute(name) !== on) {
    element.toggleAttribute(name, on);
  }
};

const clamp = (value: number, max: number) => Math.min(max, Math.max(0, value));

/**
 * Binds the scrollbars of the scroll area whose root is `root`. A ref
 * callback: it returns the function that unbinds them.
 */
export const bindOverlayScrollbars = (root: HTMLElement | null) => {
  const viewport = root && part(root, "viewport");
  const content = viewport?.firstElementChild;
  if (!root || !viewport || !content) {
    return undefined;
  }
  const bars = (["vertical", "horizontal"] as const).flatMap((orientation) => {
    const scrollbar = part(root, "scrollbar", orientation);
    const thumb = scrollbar?.firstElementChild;
    return scrollbar && thumb instanceof HTMLElement
      ? [{ orientation, scrollbar, thumb, size: "", place: "" }]
      : [];
  });
  type Bar = (typeof bars)[number];

  /** What a bar scrolls along: the lengths of its axis, and how far in it is. */
  const axisOf = ({ orientation }: Bar) =>
    orientation === "vertical"
      ? {
          visible: viewport.clientHeight,
          whole: viewport.scrollHeight,
          scrolled: viewport.scrollTop,
        }
      : {
          visible: viewport.clientWidth,
          whole: viewport.scrollWidth,
          // Right to left, scrollLeft runs from 0 down to minus the range.
          scrolled: Math.abs(viewport.scrollLeft),
        };

  /** The thumb's length and the farthest it can move, for the lengths of an axis. */
  const thumbOf = ({ visible, whole }: { visible: number; whole: number }) => {
    const length = Math.max(
      minThumbSize,
      ((visible - 2 * scrollbarPadding) * visible) / whole,
    );
    return { length, travel: visible - length - 2 * scrollbarPadding };
  };

  const measure = () => {
    for (const bar of bars) {
      const axis = axisOf(bar);
      const overflows = axis.whole > 0 && axis.visible < axis.whole;
      const vertical = bar.orientation === "vertical";
      flag(
        bar.scrollbar,
        vertical ? "data-overflow-y" : "data-overflow-x",
        overflows,
      );
      if (!overflows) {
        continue;
      }
      const { length, travel } = thumbOf(axis);
      const offset = clamp(
        (axis.scrolled / (axis.whole - axis.visible)) * travel,
        travel,
      );
      const size = `${length}px`;
      const place = vertical
        ? `translate3d(0,${offset}px,0)`
        : `translate3d(${viewport.scrollLeft < 0 ? -offset : offset}px,0,0)`;
      if (size !== bar.size) {
        bar.size = size;
        bar.thumb.style[vertical ? "height" : "width"] = size;
      }
      if (place !== bar.place) {
        bar.place = place;
        bar.thumb.style.transform = place;
      }
    }
  };

  const hover = (on: boolean) => {
    for (const bar of bars) {
      flag(bar.scrollbar, "data-hover", on);
    }
  };
  const enter = () => hover(true);
  const leave = () => hover(false);

  const controller = new AbortController();
  const { signal } = controller;

  /** Follows the pointer from a press on a thumb or on the track beside it. */
  const startDrag = (bar: Bar, event: PointerEvent) => {
    if (event.button !== 0) {
      return;
    }
    const vertical = bar.orientation === "vertical";
    const pointer = (pointerEvent: PointerEvent) =>
      vertical ? pointerEvent.clientY : pointerEvent.clientX;
    const rightToLeft =
      !vertical &&
      root.ownerDocument.defaultView?.getComputedStyle(viewport).direction ===
        "rtl";
    // Right to left, the thumb starts at the right and scrollLeft goes negative.
    const sign = rightToLeft ? -1 : 1;
    const scrollTo = (value: number) => {
      viewport[vertical ? "scrollTop" : "scrollLeft"] = sign * value;
    };
    const axis = axisOf(bar);
    const { length, travel } = thumbOf(axis);
    if (travel <= 0) {
      return;
    }
    const scrollPerPixel = (axis.whole - axis.visible) / travel;
    let startScroll = axis.scrolled;
    if (event.target === bar.scrollbar) {
      // A press on the track brings the middle of the thumb under the pointer.
      const track = bar.scrollbar.getBoundingClientRect();
      const fromStart = rightToLeft
        ? track.right - pointer(event)
        : pointer(event) - (vertical ? track.top : track.left);
      const offset = fromStart - length / 2 - scrollbarPadding;
      startScroll = offset * scrollPerPixel;
      scrollTo(startScroll);
    }
    event.stopPropagation();
    const start = pointer(event);
    flag(bar.scrollbar, "data-dragging", true);
    const drag = new AbortController();
    const end = () => {
      drag.abort();
      flag(bar.scrollbar, "data-dragging", false);
    };
    signal.addEventListener("abort", end, { signal: drag.signal });
    const view = root.ownerDocument.defaultView ?? window;
    view.addEventListener(
      "pointermove",
      (move) =>
        scrollTo(startScroll + sign * (pointer(move) - start) * scrollPerPixel),
      { signal: drag.signal },
    );
    view.addEventListener("pointerup", end, { signal: drag.signal });
    view.addEventListener("pointercancel", end, { signal: drag.signal });
  };

  /** A wheel over a scrollbar scrolls the viewport, as one over the content does. */
  const wheel = (bar: Bar, event: WheelEvent) => {
    const vertical = bar.orientation === "vertical";
    const delta = vertical ? event.deltaY : event.deltaX;
    const axis = axisOf(bar);
    const atStart = axis.scrolled === 0 && delta < 0;
    // A zoomed page can stop a fraction of a pixel short of the end.
    const atEnd = axis.scrolled >= axis.whole - axis.visible - 1 && delta > 0;
    if (
      event.ctrlKey ||
      delta === 0 ||
      axis.whole <= axis.visible ||
      atStart ||
      atEnd
    ) {
      return;
    }
    event.preventDefault();
    viewport[vertical ? "scrollTop" : "scrollLeft"] += delta;
  };

  viewport.addEventListener("scroll", measure, { passive: true, signal });
  root.addEventListener("pointerenter", enter, { signal });
  root.addEventListener("pointermove", enter, { signal });
  root.addEventListener("pointerleave", leave, { signal });
  for (const bar of bars) {
    bar.scrollbar.addEventListener(
      "pointerdown",
      (event) => startDrag(bar, event),
      { signal },
    );
    bar.scrollbar.addEventListener("wheel", (event) => wheel(bar, event), {
      passive: false,
      signal,
    });
  }
  // The observer's first callback measures the bars after layout and before
  // paint, so binding them reads no layout inside React's commit. jsdom has
  // no ResizeObserver: there they are measured once, at once.
  const resize =
    typeof ResizeObserver === "function"
      ? new ResizeObserver(measure)
      : undefined;
  if (resize) {
    resize.observe(root);
    resize.observe(content);
  } else {
    measure();
  }
  if (root.matches(":hover")) {
    hover(true);
  }

  return () => {
    controller.abort();
    resize?.disconnect();
  };
};
