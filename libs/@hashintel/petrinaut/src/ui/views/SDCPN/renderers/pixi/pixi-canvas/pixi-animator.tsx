/**
 * Simulation feedback on the Pixi canvas: token badges, transition flashes
 * and arc pulses. Frames arrive through the frame store, and everything
 * animates by mutating Pixi objects in one tick callback, so a playback frame
 * never re-renders a node.
 */

import { useTick } from "@pixi/react";
import { use, useEffect, useRef, type FC } from "react";

import { useLatest } from "../../../../../../react/hooks/use-latest";
import {
  baseStrokeWidth,
  setArcWidth,
  uploadArcWidths,
  type ArcBatch,
} from "./pixi-arcs";
import { NodeRegistryContext } from "./pixi-nodes";
import { lerpColor, transitionFlash } from "./pixi-theme";

import type { CanvasScene } from "../../../canvas-scene";
import type { FrameStore } from "./frame-store";

const pulseDurationMs = 500;
const flashDurationMs = 300;
const boltDurationMs = flashDurationMs * 3;
const maxPulseWidth = 65;
const white = 0xffffff;

type Pulse = { start: number; transitionsAnimating: number; weight: number };

const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

/** The flash colour as it appears over a white card. */
const flashTint = lerpColor(
  white,
  transitionFlash.color,
  transitionFlash.alpha,
);

/** Stroke width at the start of a pulse, growing with the log of the firings and the weight. */
const peakWidth = (transitions: number, weight: number) =>
  Math.min(
    maxPulseWidth,
    baseStrokeWidth + Math.log(1 + transitions) * Math.min(6 * weight, 25),
  );

export const PixiAnimator: FC<{
  scene: CanvasScene;
  frames: FrameStore;
  batchRef: React.RefObject<ArcBatch | null>;
}> = ({ scene, frames, batchRef }) => {
  const registry = use(NodeRegistryContext);
  const firingCounts = useRef(new Map<string, number>());
  const pulses = useRef(new Map<number, Pulse>());
  const flashes = useRef(new Map<string, number>());
  const latestScene = useLatest(scene);

  useEffect(() => {
    return frames.subscribe(() => {
      const { frameReader, tokenCountOf } = frames.get();
      const now = performance.now();
      const current = latestScene.current;

      for (const node of current.nodes) {
        if (node.kind === "place") {
          const handles = registry?.get(node.id);
          const count = tokenCountOf(node.id);
          if (handles?.badgeGroup) handles.badgeGroup.visible = count !== null;
          if (handles?.badge && count !== null) {
            handles.badge.text = String(count);
          }
          continue;
        }
        if (node.kind !== "transition") continue;

        // A firing is a rise in the count between two observed frames. The
        // first observation and drops (scrubbing back, a new run) start no
        // animation, matching the React Flow nodes.
        const count =
          frameReader?.getTransitionState(node.id)?.firingCount ?? null;
        if (count === null) continue;
        const previous = firingCounts.current.get(node.id);
        firingCounts.current.set(node.id, count);
        if (previous === undefined || count <= previous) continue;
        const delta = count - previous;

        flashes.current.set(node.id, now);
        const batch = batchRef.current;
        if (!batch) continue;
        for (const arc of current.arcs) {
          if (arc.transitionId !== node.id) continue;
          const arcIndex = batch.indexOf.get(arc.id);
          if (arcIndex === undefined) continue;
          // A pulse landing on a running one carries the remaining width forward.
          const running = pulses.current.get(arcIndex);
          const remaining = running
            ? running.transitionsAnimating *
              (1 - Math.min(1, (now - running.start) / pulseDurationMs))
            : 0;
          pulses.current.set(arcIndex, {
            start: now,
            transitionsAnimating: delta + remaining,
            weight: arc.weight,
          });
        }
      }
    });
  }, [frames, registry, batchRef, latestScene]);

  useTick(() => {
    const now = performance.now();

    const batch = batchRef.current;
    if (batch && pulses.current.size > 0) {
      for (const [arcIndex, pulse] of pulses.current) {
        const progress = Math.min(1, (now - pulse.start) / pulseDurationMs);
        const peak = peakWidth(pulse.transitionsAnimating, pulse.weight);
        setArcWidth(
          batch,
          arcIndex,
          baseStrokeWidth + (peak - baseStrokeWidth) * (1 - easeOut(progress)),
        );
        if (progress >= 1) pulses.current.delete(arcIndex);
      }
      uploadArcWidths(batch, pulses.current.keys());
    }

    for (const [nodeId, start] of flashes.current) {
      const handles = registry?.get(nodeId);
      const elapsed = now - start;
      const flashProgress = Math.min(1, elapsed / flashDurationMs);
      const boltProgress = Math.min(1, elapsed / boltDurationMs);
      if (handles?.fill) {
        handles.fill.tint = lerpColor(flashTint, white, easeOut(flashProgress));
      }
      if (handles?.bolt) {
        handles.bolt.alpha = 1 - easeOut(boltProgress);
        handles.bolt.scale.set(1 - 0.5 * easeOut(boltProgress));
      }
      if (boltProgress >= 1) flashes.current.delete(nodeId);
    }
  });

  return null;
};
