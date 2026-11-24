import { useRef } from "react";

import { type ArcRun, arcRuns } from "./arc-runs";
import {
  type ArcShape,
  type ArcShapes,
  arcShapes,
  type PortEnds,
} from "./arc-shapes";
import { useArcsLeavingFocus } from "./use-arc-layer-model/use-arcs-leaving-focus";

import type { CanvasScene } from "../../../../canvas-scene";

type ArcLayerModel = {
  /** One shape per arc, in the order of the scene. */
  shapes: ArcShape[];
  /** The merged strokes of the arcs at rest, by runs of consecutive arcs. */
  runs: readonly ArcRun[];
};

/**
 * What the arc layer draws for a scene: one shape per arc, and the runs that
 * draw the arcs at rest together. A shape or a run is the same object for as
 * long as it draws the same. `fades` says whether the pane fades a focus in
 * and out, which an arc that lost its role waits for.
 *
 * This is a render-time memory of the render before, as `useStableItems` is:
 * the shapes of the previous scene are what the new ones are compared with,
 * so the read cannot move to an effect. It opts out of the React Compiler
 * and of the `react/refs` rule for the same reason. It is idempotent: every
 * shape it returns draws what the one it replaces drew.
 */
export const useArcLayerModel = (
  scene: CanvasScene,
  portEnds: PortEnds,
  fades: boolean,
): ArcLayerModel => {
  "use no memo";

  const leavingFocus = useArcsLeavingFocus(scene.arcs, fades);
  const memory = useRef<{
    scene: CanvasScene;
    portEnds: PortEnds;
    leavingFocus: ReadonlySet<string>;
    shapes: ArcShapes;
    model: ArcLayerModel;
  } | null>(null);

  /* eslint-disable react/refs -- see the function-level comment. */
  const before = memory.current;
  if (
    before?.scene === scene &&
    before.portEnds === portEnds &&
    before.leavingFocus === leavingFocus
  ) {
    return before.model;
  }
  const shapes = arcShapes(scene, portEnds, leavingFocus, before?.shapes);
  const runs = arcRuns(shapes.list, before?.model.runs);
  const model =
    before?.model.shapes === shapes.list && before.model.runs === runs
      ? before.model
      : { shapes: shapes.list, runs };
  memory.current = { scene, portEnds, leavingFocus, shapes, model };
  return model;
  /* eslint-enable react/refs */
};
