import { useLayoutEffect, useRef, useState } from "react";

import type { SubView } from "../../types";

type Bounds = { top: number; left: number; width: number; height: number };
type Maximization = {
  id: string;
  restoring: boolean;
  animated: boolean;
  from: Bounds;
};

const relativeBounds = (element: Element, container: Element): Bounds => {
  const bounds = element.getBoundingClientRect();
  const containerBounds = container.getBoundingClientRect();
  return {
    top: bounds.top - containerBounds.top,
    left: bounds.left - containerBounds.left,
    width: bounds.width,
    height: bounds.height,
  };
};

const keyframe = (bounds: Bounds) => ({
  top: `${bounds.top}px`,
  left: `${bounds.left}px`,
  width: `${bounds.width}px`,
  height: `${bounds.height}px`,
});

const focusHeader = (section: HTMLElement, selector: string) => {
  requestAnimationFrame(() =>
    section.querySelector<HTMLButtonElement>(selector)?.focus(),
  );
};

const animationOptions = {
  duration: 240,
  easing: "cubic-bezier(0.22, 1, 0.36, 1)",
};

export const useSubViewMaximization = (
  subViews: SubView[],
  showAnimations: boolean,
) => {
  const [maximization, setMaximization] = useState<Maximization | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);

  if (
    maximization &&
    !subViews.some(
      (subView) => subView.id === maximization.id && subView.canMaximize,
    )
  ) {
    setMaximization(null);
  }

  const canAnimate = (section: HTMLElement) =>
    showAnimations &&
    typeof section.animate === "function" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const maximize = (id: string, button: HTMLButtonElement) => {
    const section = button.closest<HTMLElement>("[data-subview-section]");
    const container = section?.closest("[data-group]");
    if (!section || !container) return;
    sectionRef.current = section;
    setMaximization({
      id,
      restoring: false,
      animated: canAnimate(section),
      from: relativeBounds(section, container),
    });
  };

  const restore = () => {
    const section = sectionRef.current;
    const container = section?.closest("[data-group]");
    if (!section || !container || !maximization) return;
    if (canAnimate(section)) {
      setMaximization({
        ...maximization,
        restoring: true,
        animated: true,
        from: relativeBounds(section, container),
      });
    } else {
      setMaximization(null);
    }
  };

  useLayoutEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    if (!maximization) {
      focusHeader(section, "[data-expand-subview]");
      return;
    }
    if (!maximization.restoring) {
      focusHeader(section, "[data-restore-subview]");
    }
    const container = section.closest("[data-group]");
    const panel = section.closest("[data-panel]");
    if (!maximization.animated || !container || !panel) return;
    const target = maximization.restoring
      ? relativeBounds(panel, container)
      : relativeBounds(container, container);
    const animation = section.animate(
      [keyframe(maximization.from), keyframe(target)],
      animationOptions,
    );
    const title = section.querySelector<HTMLElement>("[data-subview-title]");
    const titleAnimation = title?.animate(
      maximization.restoring
        ? [{ opacity: 1 }, { opacity: 0 }]
        : [
            { opacity: 0, transform: "translateX(6px)" },
            { opacity: 1, transform: "translateX(0)" },
          ],
      { ...animationOptions, duration: maximization.restoring ? 240 : 180 },
    );
    void animation.finished
      .then(() => {
        if (maximization.restoring) {
          setMaximization(null);
        }
      })
      .catch(() => {});
    return () => {
      animation.cancel();
      titleAnimation?.cancel();
    };
  }, [maximization]);

  return {
    maximizedId: maximization?.id ?? null,
    isRestoring: maximization?.restoring ?? false,
    maximize,
    restore,
  };
};
