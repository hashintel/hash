/**
 * Animates a map of boxes toward a new target. Nodes present in both maps
 * glide; nodes only in the target appear in place. The target must be
 * referentially stable between renders, or every render restarts the tween.
 */

import { useEffect, useState } from "react";

import type { PlacedNode } from "../model/layout/types";

interface Animation {
  from: Map<string, PlacedNode>;
  to: Map<string, PlacedNode>;
  startedAt: number;
}

const reducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const easeOutCubic = (progress: number): number => 1 - (1 - progress) ** 3;

const interpolate = (
  animation: Animation,
  now: number,
  duration: number,
): Map<string, PlacedNode> => {
  const progress =
    duration <= 0
      ? 1
      : Math.min(1, Math.max(0, (now - animation.startedAt) / duration));
  const eased = easeOutCubic(progress);
  if (eased >= 1) {
    return animation.to;
  }
  const result = new Map<string, PlacedNode>();
  for (const [id, target] of animation.to) {
    const source = animation.from.get(id);
    if (source === undefined) {
      result.set(id, target);
      continue;
    }
    result.set(id, {
      ...target,
      x: source.x + (target.x - source.x) * eased,
      y: source.y + (target.y - source.y) * eased,
      width: source.width + (target.width - source.width) * eased,
      height: source.height + (target.height - source.height) * eased,
    });
  }
  return result;
};

export const useTween = (
  target: Map<string, PlacedNode>,
  requestedDuration: number,
): Map<string, PlacedNode> => {
  const duration = reducedMotion() ? 0 : requestedDuration;
  const [animation, setAnimation] = useState<Animation>(() => ({
    from: target,
    to: target,
    startedAt: 0,
  }));
  const [now, setNow] = useState(0);

  if (animation.to !== target) {
    const startedAt = performance.now();
    setAnimation({
      from: interpolate(animation, now, duration),
      to: target,
      startedAt,
    });
    setNow(startedAt);
  }

  const running = now - animation.startedAt < duration;
  useEffect(() => {
    if (!running) {
      return undefined;
    }
    const frame = requestAnimationFrame(() => setNow(performance.now()));
    return () => cancelAnimationFrame(frame);
  }, [running, now]);

  return interpolate(animation, now, duration);
};
