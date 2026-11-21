import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { usePetrinautNavigation } from "../../../../../react/navigation";

import type { SubView } from "../../types";

/** Where a section shows inside its container, top to bottom. */
type Bounds = { top: number; height: number };
type Maximization = {
  id: string;
  restoring: boolean;
  animated: boolean;
  from: Bounds | null;
};

const relativeBounds = (element: Element, container: Element): Bounds => {
  const bounds = element.getBoundingClientRect();
  const containerBounds = container.getBoundingClientRect();
  return { top: bounds.top - containerBounds.top, height: bounds.height };
};

/** What a running animation clips off the section's bottom, in pixels. */
const clippedBottom = (section: HTMLElement): number => {
  const inset = /inset\(([^)]*)\)/.exec(getComputedStyle(section).clipPath);
  if (!inset?.[1]) {
    return 0;
  }
  // `inset()` shortens like a margin: its third value is the bottom, and with
  // fewer than three the bottom equals the top.
  const values = inset[1].trim().split(/\s+/);
  return Number.parseFloat(values[2] ?? values[0] ?? "0");
};

/**
 * The part of the section that shows. During an animation the section is laid
 * out at the container's size, moved by a transform and clipped at the bottom,
 * so its box says where it is and not how much of it shows.
 */
const visibleBounds = (section: HTMLElement, container: Element): Bounds => {
  const bounds = relativeBounds(section, container);
  return { ...bounds, height: bounds.height - clippedBottom(section) };
};

/**
 * How a section that is laid out to fill a container of `fullHeight` is drawn
 * so that it shows as `bounds`: moved down to their top and clipped to their
 * height. Neither changes layout, so an animation between two of these lays
 * the section's content out once, not once per frame.
 */
const drawnAs = (bounds: Bounds, fullHeight: number): Keyframe => ({
  transform: `translateY(${bounds.top}px)`,
  clipPath: `inset(0px 0px ${Math.max(0, fullHeight - bounds.height)}px 0px)`,
});

const focusHeader = (
  section: HTMLElement,
  selector: string,
  fallbackSelector?: string,
) => {
  requestAnimationFrame(() => {
    const target =
      section.querySelector<HTMLElement>(selector) ??
      (fallbackSelector
        ? section.querySelector<HTMLElement>(fallbackSelector)
        : null);
    target?.focus();
  });
};

const animationOptions = {
  duration: 240,
  easing: "cubic-bezier(0.22, 1, 0.36, 1)",
};

export const useSubViewMaximization = (
  name: string,
  subViews: SubView[],
  showAnimations: boolean,
) => {
  const navigation = usePetrinautNavigation();
  const requestedId =
    navigation.state.expandedSubView?.container === name
      ? navigation.state.expandedSubView.id
      : null;
  const targetId = subViews.some(
    (subView) => subView.id === requestedId && subView.canMaximize,
  )
    ? requestedId
    : null;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const [maximization, setMaximization] = useState<Maximization | null>(() =>
    targetId
      ? { id: targetId, restoring: false, animated: false, from: null }
      : null,
  );
  if (
    maximization &&
    !subViews.some(
      (subView) => subView.id === maximization.id && subView.canMaximize,
    )
  ) {
    setMaximization(null);
  }

  useEffect(() => {
    if (requestedId !== null && targetId === null) {
      navigation.navigate(
        (current) =>
          current.expandedSubView?.container === name &&
          current.expandedSubView.id === requestedId
            ? { ...current, expandedSubView: null }
            : current,
        { cause: "normalization", action: "subview" },
      );
    }
  }, [name, navigation, requestedId, targetId]);

  useLayoutEffect(() => {
    const displayedId = maximization?.restoring
      ? null
      : (maximization?.id ?? null);
    if (displayedId === targetId) return;
    const container = containerRef.current;
    const sectionId = targetId ?? maximization?.id;
    const section =
      container &&
      [
        ...container.querySelectorAll<HTMLElement>("[data-subview-section]"),
      ].find((element) => element.dataset.subviewId === sectionId);
    if (!container || !section || !sectionId) {
      return;
    }
    const animated =
      showAnimations &&
      typeof section.animate === "function" &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!targetId && !animated) {
      restoreFocusRef.current = section;
    }
    const from = visibleBounds(section, container);
    // Measure the current DOM bounds before moving a routed section; the destination guard prevents repeated updates.
    setMaximization(
      !targetId && !animated
        ? null
        : { id: sectionId, restoring: targetId === null, animated, from },
    );
  }, [maximization, showAnimations, targetId]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!maximization) {
      if (restoreFocusRef.current) {
        focusHeader(
          restoreFocusRef.current,
          "[data-expand-subview]",
          "[data-toggle-subview]",
        );
        restoreFocusRef.current = null;
      }
      return;
    }
    if (!container) return;
    const section = [
      ...container.querySelectorAll<HTMLElement>("[data-subview-section]"),
    ].find((element) => element.dataset.subviewId === maximization.id);
    if (!section) return;
    if (!maximization.restoring) {
      focusHeader(section, "[data-restore-subview]");
    }
    const panel = section.closest("[data-panel]");
    if (!maximization.animated || !maximization.from || !panel) return;
    const target = maximization.restoring
      ? relativeBounds(panel, container)
      : relativeBounds(container, container);
    const options: KeyframeAnimationOptions = {
      ...animationOptions,
      // Keep the destination drawing until React restores the normal layout.
      fill: maximization.restoring ? "forwards" : "none",
    };
    // The section fills the container for the whole animation, in both
    // directions. Only how it is drawn changes from frame to frame.
    const fullHeight = container.getBoundingClientRect().height;
    const animation = section.animate(
      [drawnAs(maximization.from, fullHeight), drawnAs(target, fullHeight)],
      options,
    );
    const title = section.querySelector<HTMLElement>("[data-subview-title]");
    const titleAnimation = title?.animate(
      maximization.restoring
        ? [{ opacity: 1 }, { opacity: 0 }]
        : [
            { opacity: 0, transform: "translateX(6px)" },
            { opacity: 1, transform: "translateX(0)" },
          ],
      { ...options, duration: maximization.restoring ? 240 : 180 },
    );
    void animation.finished
      .then(() => {
        if (maximization.restoring) {
          restoreFocusRef.current = section;
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
    containerRef,
    maximizedId: maximization?.id ?? null,
    isRestoring: maximization?.restoring ?? false,
    maximize: (id: string) =>
      navigation.navigate(
        { expandedSubView: { container: name, id } },
        { cause: "user", action: "subview" },
      ),
    restore: () =>
      navigation.navigate(
        { expandedSubView: null },
        { cause: "user", action: "subview" },
      ),
  };
};
