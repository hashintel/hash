import { useEffect, useState } from "react";

import { focusFadeMs } from "../../../../../styles/focus";

import type { CanvasArc } from "../../../../../canvas-scene";

const noArcs: ReadonlySet<string> = new Set();

/**
 * How long an arc that lost its role keeps its own strokes: the length of
 * the pane's fade, and a little more for the frame the fade starts in.
 */
const holdTime = focusFadeMs + 50;

/** The ids of the arcs with a focus role, as one value to compare. */
const roleKeyOf = (arcs: readonly CanvasArc[]): string =>
  arcs
    .filter((arc) => arc.focus !== "none")
    .map((arc) => arc.id)
    .join("\n");

/**
 * The arcs that had a focus role until a moment ago. Each keeps its own
 * strokes until the pane's fade is over, so it does not jump to the strength
 * of the merged paths: arc-layer.mdx. Without `fades` no arc is held.
 *
 * The roles of the render before are state adjusted during render, so the
 * arcs that just lost theirs are known in the render that takes the role
 * away.
 */
export const useArcsLeavingFocus = (
  arcs: readonly CanvasArc[],
  fades: boolean,
): ReadonlySet<string> => {
  const roleKey = roleKeyOf(arcs);
  const [previousKey, setPreviousKey] = useState(roleKey);
  const [leaving, setLeaving] = useState(noArcs);

  if (roleKey !== previousKey) {
    setPreviousKey(roleKey);
    if (fades && previousKey !== "") {
      setLeaving(new Set([...leaving, ...previousKey.split("\n")]));
    }
  }

  useEffect(() => {
    if (leaving.size === 0) {
      return;
    }
    const timer = setTimeout(() => setLeaving(noArcs), holdTime);
    return () => clearTimeout(timer);
  }, [leaving]);

  return fades ? leaving : noArcs;
};
