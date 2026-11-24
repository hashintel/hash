/**
 * Watches the slide inside `canvas` and reports how far its content runs
 * past it, in CSS pixels, while `enabled`. It measures again whenever a box
 * in the slide changes size, which covers fonts loading, a step that moves
 * the layout and the window resizing, and whenever the slide is replaced.
 */

import { useEffect, useState } from "react";

import { contains, overflowOf, scrolls, spillOf } from "./overflow";

import type { BoxRect } from "./overflow";
import type { RefObject } from "react";

export const useSlideOverflow = (
  canvas: RefObject<HTMLElement | null>,
  enabled: boolean,
): number => {
  const [overflow, setOverflow] = useState(0);

  useEffect(() => {
    const root = canvas.current;
    if (!enabled || root === null) {
      return;
    }
    const measure = () => {
      const slide = root.querySelector<HTMLElement>(".slide");
      if (slide === null) {
        return;
      }
      const drawn: BoxRect[] = [];
      const scrollers: HTMLElement[] = [slide];
      // A box that keeps its content inside it is measured, its content not:
      // what it hides cannot reach past the slide. An SVG is one box.
      const walk = (parent: Element): void => {
        for (const child of parent.children) {
          drawn.push(child.getBoundingClientRect());
          const style = getComputedStyle(child);
          if (
            child instanceof HTMLElement &&
            scrolls(style.overflowX, style.overflowY)
          ) {
            scrollers.push(child);
          }
          if (
            !(child instanceof SVGElement) &&
            !contains(style.overflowX, style.overflowY)
          ) {
            walk(child);
          }
        }
      };
      walk(slide);
      const frame = slide.getBoundingClientRect();
      setOverflow(
        Math.max(
          overflowOf(scrollers),
          spillOf(frame, drawn, frame.width / slide.offsetWidth),
        ),
      );
    };
    // A new observation reports every observed box once, so observing is
    // also the first measurement.
    const sizes = new ResizeObserver(measure);
    const observeAll = () => {
      sizes.disconnect();
      sizes.observe(root);
      for (const element of root.querySelectorAll("*")) {
        sizes.observe(element);
      }
    };
    const children = new MutationObserver(observeAll);
    children.observe(root, { childList: true, subtree: true });
    observeAll();
    return () => {
      sizes.disconnect();
      children.disconnect();
    };
  }, [canvas, enabled]);

  return enabled ? overflow : 0;
};
