import { animateCube } from "../shared/cube-projection";
import { petriconHints } from "../shared/petricon-hints";

import type { ExperimentalIconName } from "../../experimental-icons";

export const iconControlSelector =
  'button, a[href], [role="button"], [role="tab"], [role="menuitem"], [data-scope="segment-group"][data-part="item"], label[data-scope="checkbox"]';
export const isIconControlDisabled = (control: Element) =>
  Boolean(
    control.closest(':disabled, [aria-disabled="true"], [data-disabled]'),
  );

const translations: Record<string, string> = {
  right: "translateX(2px)",
  left: "translateX(-2px)",
  up: "translateY(-2px)",
  lift: "translateY(-2px)",
  down: "translateY(2px)",
  out: "translate(1.4px, -1.4px)",
  grow: "scale(1.12)",
  shrink: "scale(.88)",
  tilt: "rotate(-9deg)",
  turn: "rotate(25deg)",
  rewind: "rotate(-25deg)",
};

const detailTransforms: Record<string, string> = {
  "rewind-ring": "rotate(-18deg)",
  "rewind-hand": "rotate(-100deg)",
  "derivative-top": "translateY(-1px)",
  "derivative-bottom": "translateY(1px)",
  "dial-needle": "rotate(40deg)",
  "range-left": "translateX(2px)",
  "range-right": "translateX(-2px)",
  "range-value": "scaleX(1.4)",
  "variable-left": "skewX(7deg)",
  "variable-right": "skewX(-7deg)",
  "variable-value": "translateY(-1px) scale(.9)",
  "value-cursor": "scaleY(.5)",
  "token-top": "translateY(1px)",
  "token-left": "translate(-.8px, -.5px)",
  "token-right": "translate(.8px, -.5px)",
  "token-stack-top": "translateY(-1.5px)",
  "token-stack-middle": "translateY(-.7px)",
  "tag-token": "scale(.78)",
  "subnet-node": "translateY(-.8px)",
  "module-front": "translate(-1px, 1px)",
  "slope-field": "skewY(-7deg)",
  "open-left": "translateX(-1.2px)",
  "open-right": "translateX(1.2px)",
  notation: "translate(1px, -.5px)",
  "type-mark": "translateY(-1px)",
  bounds: "scaleY(1.12)",
  row: "translateX(1px)",
  cells: "scale(.88)",
  node: "scale(.85)",
  connection: "scaleY(.92)",
  "test-result": "scale(1.15)",
  distribution: "skewX(-6deg)",
  "liquid-level": "rotate(-8deg)",
  orbit: "rotate(30deg)",
  antenna: "rotate(12deg)",
  eyes: "scaleY(.15)",
  "scan-bar": "scaleY(.6)",
  lid: "translateY(-2px) rotate(-12deg)",
  sheet: "translate(1.5px, 1.5px)",
  down: "translateY(2px)",
  right: "translateX(2px)",
  out: "translate(1.2px, -1.2px)",
  dot: "scale(1.35)",
  shackle: "translateY(-1.5px)",
  pupil: "translateX(.7px)",
  "clock-hand": "rotate(-45deg)",
  bars: "scaleY(1.15)",
  "line-chart": "translateY(-1px)",
  lines: "translateX(1px)",
  target: "scale(.8)",
  sparkle: "scale(1.15) rotate(8deg)",
  wave: "scaleY(.6)",
  "bell-clapper": "translateX(1.2px)",
  "calendar-day": "scale(1.2)",
  "calendar-hand": "rotate(-30deg)",
  filament: "translateY(-1px)",
};

export const playIconAction = (
  root: SVGGElement,
  name: ExperimentalIconName,
  duration: number,
  loop = false,
  cancelPrevious: () => void = () => {},
) => {
  const details = root.querySelectorAll<SVGElement>("[data-icon-detail]");
  const previous = new Map(
    Array.from(details, (detail) => [
      detail,
      {
        transform: getComputedStyle(detail).transform,
        path: getComputedStyle(detail).getPropertyValue("d"),
      },
    ]),
  );
  cancelPrevious();
  const cube = root.querySelector("[data-icon-cube]");
  if (cube) {
    let cancel = () => {};
    let timer: ReturnType<typeof setInterval> | undefined;
    const turn = () => {
      cancel();
      cancel = animateCube(
        cube,
        Number(cube.getAttribute("data-cube-angle") ?? 35) + 90,
        duration,
      );
    };
    turn();
    if (loop) timer = setInterval(turn, duration);
    return () => {
      cancel();
      if (timer) clearInterval(timer);
    };
  }
  const animations: Animation[] = [];
  const animate = (target: SVGElement, frames: Keyframe[], delay = 0) => {
    if (typeof target.animate !== "function") return;
    animations.push(
      target.animate(frames, {
        duration,
        delay,
        iterations: loop ? Infinity : 1,
        easing: "cubic-bezier(.2, .7, .25, 1)",
        fill: "none",
      }),
    );
  };
  for (const detail of details) {
    const part = detail.getAttribute("data-icon-detail") ?? "";
    const resting = getComputedStyle(detail).transform;
    if (part === "equation-curve" || part === "equation-solution") {
      const original = detail.getAttribute("d");
      const wave =
        part === "equation-curve"
          ? "M6 17C9 12 15 15 19 6"
          : "M3 17C10 11 14 16 21 8";
      animate(detail, [
        { d: previous.get(detail)?.path || `path('${original}')` },
        { d: `path('${wave}')`, offset: 0.4 },
        { d: `path('${original}')` },
      ]);
    } else if (part === "subnet-link") {
      animate(detail, [
        { strokeDasharray: "1 1", strokeDashoffset: 1, opacity: 0.25 },
        { strokeDasharray: "1 1", strokeDashoffset: 0, opacity: 1 },
      ]);
    } else if (part === "curve-sample") {
      animate(detail, [
        { transform: "translate(0, 0)" },
        { transform: "translate(3px, -3.7px)", offset: 0.45 },
        { transform: "translate(0, 0)" },
      ]);
    } else {
      const transform =
        part === "slider"
          ? `translateX(${detail.getAttribute("data-slider") === "bottom" ? -3 : 3}px)`
          : detailTransforms[part];
      if (!transform) continue;
      const origin =
        part === "dial-needle"
          ? "12px 14px"
          : getComputedStyle(detail).transformOrigin;
      animate(detail, [
        {
          transform: previous.get(detail)?.transform ?? resting,
          transformOrigin: origin,
        },
        { transform, transformOrigin: origin, offset: 0.38 },
        { transform: resting, transformOrigin: origin },
      ]);
    }
  }
  if (animations.length === 0 && petriconHints[name] !== "state") {
    const target = root.querySelector<SVGElement>("[data-icon-feedback]");
    if (target)
      animate(target, [
        { transform: "none" },
        {
          transform: translations[petriconHints[name]] ?? "scale(.92)",
          offset: 0.35,
        },
        { transform: "none" },
      ]);
  }
  let cancelled = false;
  return () => {
    if (cancelled) return;
    cancelled = true;
    animations.forEach((animation) => animation.cancel());
  };
};
