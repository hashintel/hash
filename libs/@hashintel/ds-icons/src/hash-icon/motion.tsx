/**
 * @layerRoot ui.petricon
 * @role HashIcon SVG geometry, configurable effects, and state transitions
 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from "react";

import {
  iconControlSelector,
  isIconControlDisabled,
  playIconAction,
} from "./motion/action-motion";
import { animateCube, paintCube } from "./shared/cube-projection";

import type { HashIconName } from "../hash-icon";

export const hashIconEffects = [
  "action",
  "bounce",
  "pulse",
  "rotate",
  "draw",
] as const;
export type HashIconEffect = (typeof hashIconEffects)[number];
export type HashIconTransition = "none" | "smooth" | "spring";
export type HashIconMotion = "auto" | "none";
export type HashIconAnimationMode = "once" | "continuous";
export type HashIconChoreography = "together" | "stagger" | "sequential";

export type IconMotionProps = {
  effect?: HashIconEffect | readonly HashIconEffect[];
  hoverEffect?: HashIconEffect;
  animationMode?: HashIconAnimationMode;
  trigger?: string | number;
  active?: boolean;
  duration?: number;
  choreography?: HashIconChoreography;
  drawProgress?: number;
};

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";
const getMotionMedia = (): MediaQueryList | undefined =>
  typeof window.matchMedia === "function"
    ? window.matchMedia(reducedMotionQuery)
    : undefined;
const subscribeToReducedMotion = (onChange: () => void) => {
  const media = getMotionMedia();
  media?.addEventListener("change", onChange);
  return () => media?.removeEventListener("change", onChange);
};
const getReducedMotion = () => getMotionMedia()?.matches ?? false;
const getServerReducedMotion = () => true;

export const useIconMotionAllowed = (motion: HashIconMotion) => {
  const reducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotion,
    getServerReducedMotion,
  );
  return motion !== "none" && !reducedMotion;
};

export const resolveIconDuration = (duration: number) =>
  Number.isFinite(duration) ? Math.min(10000, Math.max(100, duration)) : 600;

export const getIconTransition = (
  allowed: boolean,
  transition: HashIconTransition,
  duration: number,
) => {
  if (!allowed || transition === "none") {
    return "none";
  }
  const easing =
    transition === "spring"
      ? "cubic-bezier(0.22, 1.35, 0.36, 1)"
      : "cubic-bezier(0.2, 0, 0.2, 1)";
  return [
    "transform",
    "opacity",
    "rx",
    "stroke-dashoffset",
    "stroke-dasharray",
    "color",
  ]
    .map((property) => `${property} ${duration}ms ${easing}`)
    .join(", ");
};

const effectKeyframes: Record<
  Exclude<HashIconEffect, "draw" | "action">,
  Keyframe[]
> = {
  bounce: [
    { transform: "translateY(0px) scale(1)" },
    { transform: "translateY(1px) scale(0.88)", offset: 0.2 },
    { transform: "translateY(-1.5px) scale(1.08)", offset: 0.5 },
    { transform: "translateY(0px) scale(1)" },
  ],
  pulse: [{ opacity: 1 }, { opacity: 0.3 }, { opacity: 1 }],
  rotate: [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
};

const playIconEffects = ({
  root,
  effectKey,
  name,
  duration,
  choreography,
  drawProgress,
  animationMode,
  cancelPrevious,
  onComplete,
}: {
  root: SVGGElement;
  effectKey: string;
  name: HashIconName;
  duration: number;
  choreography: HashIconChoreography;
  drawProgress?: number;
  animationMode: HashIconAnimationMode;
  cancelPrevious: () => void;
  onComplete?: () => void;
}) => {
  const animations: Animation[] = [];
  const completions: Promise<unknown>[] = [];
  let cancelAction = () => {};
  let finishAction = () => {};
  const actionFinished = new Promise<void>((resolve) => {
    finishAction = resolve;
  });
  const totalDuration = resolveIconDuration(duration);
  const effects = hashIconEffects.filter((candidate) =>
    effectKey.split(",").includes(candidate),
  );
  for (const currentEffect of effects) {
    if (currentEffect === "action") {
      cancelAction = playIconAction(
        root,
        name,
        totalDuration,
        animationMode === "continuous",
        cancelPrevious,
        finishAction,
      );
      completions.push(actionFinished);
      continue;
    }
    if (currentEffect === "draw" && drawProgress !== undefined) continue;
    const targets = root.querySelectorAll<SVGElement>(
      currentEffect === "draw"
        ? '[data-icon-draw]:not([visibility="hidden"])'
        : `[data-icon-effect="${currentEffect}"]`,
    );
    const layerNames = Array.from(
      new Set(
        Array.from(targets, (target) =>
          currentEffect === "draw"
            ? target.getAttribute("data-icon-draw")
            : target
                .closest("[data-icon-layer]")
                ?.getAttribute("data-icon-layer"),
        ),
      ),
    );
    if (currentEffect !== "draw") {
      layerNames.sort((left, right) =>
        left === "frame" ? -1 : right === "frame" ? 1 : 0,
      );
    }
    const stagger =
      choreography === "together" ? 0 : choreography === "stagger" ? 0.15 : 1;
    const segmentDuration =
      totalDuration / (1 + Math.max(0, layerNames.length - 1) * stagger);
    targets.forEach((target) => {
      const layerName =
        currentEffect === "draw"
          ? target.getAttribute("data-icon-draw")
          : target
              .closest("[data-icon-layer]")
              ?.getAttribute("data-icon-layer");
      const index = layerNames.indexOf(layerName);
      if (typeof target.animate !== "function") {
        return;
      }
      const keyframes =
        currentEffect === "draw"
          ? [
              { strokeDasharray: "1 1", strokeDashoffset: 1, fillOpacity: 0 },
              { strokeDasharray: "1 1", strokeDashoffset: 0, fillOpacity: 1 },
            ]
          : effectKeyframes[currentEffect];
      // Keep each layer on the same loop period, including its staggered hold.
      const delay = index * stagger * segmentDuration;
      const frames = keyframes.map((keyframe, keyframeIndex) => ({
        ...keyframe,
        offset: Math.min(
          1,
          Math.max(
            0,
            (delay +
              (keyframe.offset ?? keyframeIndex / (keyframes.length - 1)) *
                segmentDuration) /
              totalDuration,
          ),
        ),
      }));
      const animation = target.animate(
        [
          { ...keyframes.at(0), offset: 0 },
          ...frames,
          { ...keyframes.at(-1), offset: 1 },
        ],
        {
          duration: totalDuration,
          iterations: animationMode === "continuous" ? Infinity : 1,
          easing: currentEffect === "rotate" ? "linear" : "ease-in-out",
          fill: "none",
        },
      );
      animations.push(animation);
    });
  }
  let cancelled = false;
  if (animationMode === "once" && onComplete) {
    void Promise.all([
      ...completions,
      ...animations.map((animation) => animation.finished),
    ]).then(
      () => {
        if (!cancelled) onComplete();
      },
      () => {},
    );
  }
  return () => {
    if (cancelled) return;
    cancelled = true;
    cancelAction();

    animations.forEach((animation) => animation.cancel());
  };
};

export const useIconEffects = ({
  effect,
  hoverEffect,
  animationMode = "once",
  trigger,
  active,
  duration = 600,
  choreography = "stagger",
  allowed,
  identity,
  name,
  interactive,
  authoredHover,
  drawProgress,
}: IconMotionProps & {
  allowed: boolean;
  identity: string;
  name: HashIconName;
  interactive: boolean;
  authoredHover: boolean;
}) => {
  const ref = useRef<SVGGElement>(null);
  const previousTrigger = useRef(trigger);
  const cancelInteraction = useRef<() => void>(() => {});
  const cancelHoverInteraction = useRef<() => void>(() => {});
  const explicitPlayback = useRef(false);
  const cubeActionInProgress = useRef(false);
  const effectKey = (
    typeof effect === "string" ? [effect] : (effect ?? [])
  ).join(",");
  const hoverEnabled =
    authoredHover &&
    !(active === true && effectKey.split(",").includes("action"));

  useLayoutEffect(() => {
    const targets =
      ref.current?.querySelectorAll<SVGElement>("[data-icon-draw]");
    if (drawProgress === undefined || !targets) return;
    const progress = Number.isFinite(drawProgress)
      ? Math.max(0, Math.min(1, drawProgress))
      : 1;
    for (const target of targets) {
      target.style.strokeDasharray = "1 1";
      target.style.strokeDashoffset = String(1 - progress);
      target.style.opacity = progress === 0 ? "0" : "";
      target.style.fillOpacity = String(progress);
    }
    return () => {
      for (const target of targets) {
        target.style.strokeDasharray = "";
        target.style.strokeDashoffset = "";
        target.style.opacity = "";
        target.style.fillOpacity = "";
      }
    };
  }, [drawProgress, identity]);

  useEffect(() => {
    const root = ref.current;
    const control = root?.closest<HTMLElement>(iconControlSelector);
    if (!root || !control || !allowed) return;
    const cube = root.querySelector("[data-icon-cube]");
    const play = () => {
      if (isIconControlDisabled(control)) return;
      cancelHoverInteraction.current();
      cancelInteraction.current = playIconAction(
        root,
        name,
        Math.min(duration, 420),
        false,
        cancelInteraction.current,
        () => {
          cubeActionInProgress.current = false;
        },
      );
      cubeActionInProgress.current = Boolean(cube);
    };
    let pointerInside = false;
    let focused = control.contains(document.activeElement);
    const enter = () => {
      if (
        explicitPlayback.current ||
        (!hoverEnabled && !hoverEffect) ||
        cubeActionInProgress.current ||
        isIconControlDisabled(control)
      )
        return;
      if (hoverEffect) {
        cancelHoverInteraction.current();
        cancelHoverInteraction.current = playIconEffects({
          root,
          effectKey: hoverEffect,
          name,
          duration,
          choreography,
          drawProgress,
          animationMode,
          cancelPrevious: cancelInteraction.current,
        });
      } else if (cube && animationMode === "once") {
        cancelInteraction.current();
        const angle = Number(cube.getAttribute("data-cube-angle") ?? 35);
        const rest = 35 + Math.round((angle - 35) / 90) * 90;
        cancelInteraction.current = animateCube(
          cube,
          rest + 20,
          Math.min(duration, 240),
        );
      } else
        cancelInteraction.current = playIconAction(
          root,
          name,
          Math.min(duration, 360),
          animationMode === "continuous",
          cancelInteraction.current,
        );
    };
    const leave = () => {
      if (explicitPlayback.current) return;
      if (hoverEffect) {
        cancelHoverInteraction.current();
        return;
      }
      if (
        hoverEnabled &&
        animationMode === "continuous" &&
        !cubeActionInProgress.current
      ) {
        cancelInteraction.current();
      }
      if (!cube || !hoverEnabled || cubeActionInProgress.current) return;
      cancelInteraction.current();
      const angle = Number(cube.getAttribute("data-cube-angle") ?? 35);
      cancelInteraction.current = animateCube(
        cube,
        35 + Math.round((angle - 35) / 90) * 90,
        Math.min(duration, 220),
      );
    };
    const pointerEnter = () => {
      pointerInside = true;
      if (!focused) enter();
    };
    const focus = (event: FocusEvent) => {
      if (
        event.relatedTarget instanceof Node &&
        control.contains(event.relatedTarget)
      )
        return;
      focused = true;
      if (!pointerInside) enter();
    };
    const pointerLeave = () => {
      pointerInside = false;
      if (!focused) leave();
    };
    const blur = (event: FocusEvent) => {
      if (
        event.relatedTarget instanceof Node &&
        control.contains(event.relatedTarget)
      )
        return;
      focused = false;
      if (!pointerInside) leave();
    };
    if (interactive && !effectKey) control.addEventListener("click", play);
    control.addEventListener("pointerenter", pointerEnter);
    control.addEventListener("pointerleave", pointerLeave);
    control.addEventListener("focus", focus, true);
    control.addEventListener("blur", blur, true);
    return () => {
      cancelHoverInteraction.current();
      cancelInteraction.current();
      cubeActionInProgress.current = false;
      if (cube) paintCube(cube, 35);
      control.removeEventListener("click", play);
      control.removeEventListener("pointerenter", pointerEnter);
      control.removeEventListener("pointerleave", pointerLeave);
      control.removeEventListener("focus", focus, true);
      control.removeEventListener("blur", blur, true);
    };
  }, [
    allowed,
    hoverEnabled,
    hoverEffect,
    animationMode,
    interactive,
    effectKey,
    identity,
    name,
    duration,
    choreography,
    drawProgress,
  ]);

  useEffect(() => {
    const triggered = previousTrigger.current !== trigger;
    previousTrigger.current = trigger;
    const root = ref.current;
    if (
      !root ||
      !allowed ||
      active === false ||
      (active !== true && trigger !== undefined && !triggered)
    ) {
      return;
    }

    if (!effectKey) return;
    cancelHoverInteraction.current();
    cancelInteraction.current();
    explicitPlayback.current = true;
    const cancelEffects = playIconEffects({
      root,
      effectKey,
      name,
      duration,
      choreography,
      drawProgress,
      animationMode,
      cancelPrevious: cancelInteraction.current,
      onComplete: () => {
        explicitPlayback.current = false;
      },
    });
    return () => {
      cancelEffects();
      explicitPlayback.current = false;
    };
  }, [
    effectKey,
    trigger,
    active,
    duration,
    choreography,
    allowed,
    identity,
    name,
    drawProgress,
    animationMode,
  ]);

  return ref;
};
