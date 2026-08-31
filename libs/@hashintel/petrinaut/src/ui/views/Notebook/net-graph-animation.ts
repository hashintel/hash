/**
 * Animates the net diagram between layouts.
 *
 * React renders the target layout exactly once. This hook then plays the
 * change back: a single `requestAnimationFrame` loop interpolates each node
 * from where it currently sits to where React has already placed it, and
 * writes the difference straight to the DOM — one `transform` per node and one
 * `d` per edge, no React re-render per frame. The offsets decay to zero, so
 * when the animation ends the DOM already matches what React rendered and
 * there is nothing to unwind.
 */

import { useLayoutEffect, useRef } from "react";

import { edgePath } from "./net-graph-layout";

import type { NetGraphLayout, Point } from "./net-graph-layout";

const DURATION_MS = 340;

/** Decelerating ease: fast off the mark, settles gently. */
export const easeOutCubic = (progress: number): number =>
  1 - (1 - progress) ** 3;

export const interpolate = (from: number, to: number, eased: number): number =>
  from + (to - from) * eased;

/**
 * Identifies a layout by where its nodes ended up, so a re-render that changes
 * only colours or labels doesn't restart the animation.
 */
export const layoutSignature = (layout: NetGraphLayout): string =>
  layout.nodes.map((node) => `${node.id}@${node.x},${node.y}`).join("|");

const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export interface NetGraphTransition {
  /** Ref callback for a node's outer group, which carries the animation offset. */
  nodeRef: (id: string) => (element: SVGGElement | null) => void;
  /** Ref callback for an edge path, whose `d` is rewritten while animating. */
  edgeRef: (key: string) => (element: SVGPathElement | null) => void;
}

/**
 * Drive the transition between the previous layout and `layout`.
 *
 * Nodes that are new to the layout appear at their final position rather than
 * flying in from nowhere, and an animation already in flight is picked up from
 * its current on-screen positions instead of snapping back.
 */
export function useNetGraphTransition(
  layout: NetGraphLayout,
  { enabled }: { enabled: boolean },
): NetGraphTransition {
  const nodeElements = useRef(new Map<string, SVGGElement>());
  const edgeElements = useRef(new Map<string, SVGPathElement>());
  /** Where each node currently is on screen, updated every frame. */
  const onScreen = useRef(new Map<string, Point>());
  const animatedSignature = useRef<string | null>(null);
  const frameHandle = useRef<number | null>(null);

  // A layout effect, not a passive one: the first offset must land before the
  // browser paints the commit, or the graph visibly snaps to the target and
  // rewinds when the animation starts.
  useLayoutEffect(() => {
    const signature = layoutSignature(layout);
    const targets = new Map<string, Point>(
      layout.nodes.map((node) => [node.id, { x: node.x, y: node.y }]),
    );

    // Every node already sitting where React put it means there is nothing to
    // play. This is checked as well as the signature because a re-render can
    // interrupt an animation mid-flight: the cleanup cancels the frame, and
    // bailing out on the signature alone would leave the offsets frozen.
    const settled = layout.nodes.every((node) => {
      const point = onScreen.current.get(node.id);
      return point !== undefined && point.x === node.x && point.y === node.y;
    });
    if (signature === animatedSignature.current && settled) {
      return;
    }
    const origins = new Map(onScreen.current);
    const isFirstLayout = animatedSignature.current === null;
    animatedSignature.current = signature;

    const moving = layout.nodes.filter((node) => {
      const origin = origins.get(node.id);
      return (
        origin !== undefined && (origin.x !== node.x || origin.y !== node.y)
      );
    });

    // Nothing to play: adopt the target and let React's own attributes stand.
    if (
      isFirstLayout ||
      !enabled ||
      moving.length === 0 ||
      prefersReducedMotion()
    ) {
      onScreen.current = targets;
      for (const [id, element] of nodeElements.current) {
        if (targets.has(id)) {
          element.removeAttribute("transform");
        }
      }
      // An interrupted animation leaves edges at interpolated positions that
      // React believes are already final, so their `d` is restored here too.
      for (const edge of layout.edges) {
        const element = edgeElements.current.get(edge.key);
        const from = targets.get(edge.from);
        const to = targets.get(edge.to);
        if (element !== undefined && from !== undefined && to !== undefined) {
          element.setAttribute("d", edgePath(from, to, edge.isBackEdge));
        }
      }
      return;
    }

    const startedAt = performance.now();

    const drawFrame = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / DURATION_MS);
      const eased = easeOutCubic(progress);
      const frame = new Map<string, Point>();

      for (const node of layout.nodes) {
        const origin = origins.get(node.id) ?? { x: node.x, y: node.y };
        const point = {
          x: interpolate(origin.x, node.x, eased),
          y: interpolate(origin.y, node.y, eased),
        };
        frame.set(node.id, point);

        const element = nodeElements.current.get(node.id);
        if (element === undefined) {
          continue;
        }
        // React already positions the inner group at the target, so the offset
        // written here is purely the remaining distance.
        if (progress === 1) {
          element.removeAttribute("transform");
        } else {
          element.setAttribute(
            "transform",
            `translate(${point.x - node.x},${point.y - node.y})`,
          );
        }
      }

      for (const edge of layout.edges) {
        const element = edgeElements.current.get(edge.key);
        const from = frame.get(edge.from);
        const to = frame.get(edge.to);
        if (element === undefined || from === undefined || to === undefined) {
          continue;
        }
        element.setAttribute("d", edgePath(from, to, edge.isBackEdge));
      }

      onScreen.current = frame;

      if (progress < 1) {
        frameHandle.current = requestAnimationFrame(drawFrame);
      } else {
        frameHandle.current = null;
        onScreen.current = targets;
      }
    };

    frameHandle.current = requestAnimationFrame(drawFrame);

    return () => {
      if (frameHandle.current !== null) {
        cancelAnimationFrame(frameHandle.current);
        frameHandle.current = null;
      }
    };
  }, [layout, enabled]);

  return {
    nodeRef: (id: string) => (element: SVGGElement | null) => {
      if (element === null) {
        nodeElements.current.delete(id);
      } else {
        nodeElements.current.set(id, element);
      }
    },
    edgeRef: (key: string) => (element: SVGPathElement | null) => {
      if (element === null) {
        edgeElements.current.delete(key);
      } else {
        edgeElements.current.set(key, element);
      }
    },
  };
}
