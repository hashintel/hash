import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { usePetrinautNavigation } from "../../../../../react/navigation";

import type { SubView } from "../../types";

type Bounds = { top: number; left: number; width: number; height: number };
type Maximization = {
  id: string;
  restoring: boolean;
  animated: boolean;
  from: Bounds | null;
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
    const from = relativeBounds(section, container);
    // eslint-disable-next-line react-hooks-js/set-state-in-effect -- Measure the current DOM bounds before moving a routed section; the destination guard prevents repeated updates.
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
        focusHeader(restoreFocusRef.current, "[data-expand-subview]");
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
