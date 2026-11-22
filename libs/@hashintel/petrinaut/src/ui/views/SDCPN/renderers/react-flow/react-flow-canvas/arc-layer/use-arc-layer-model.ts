import { useRef } from "react";

import {
  type ArcShape,
  type ArcShapes,
  arcShapes,
  type PortEnds,
} from "./arc-shapes";

import type { CanvasScene } from "../../../../canvas-scene";

/**
 * What the arc layer draws for a scene: one shape per arc, the same object
 * for as long as the arc draws the same.
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
): { shapes: ArcShape[] } => {
  "use no memo";

  const memory = useRef<{
    scene: CanvasScene;
    portEnds: PortEnds;
    shapes: ArcShapes;
  } | null>(null);

  /* eslint-disable react/refs -- see the function-level comment. */
  const before = memory.current;
  if (before?.scene !== scene || before.portEnds !== portEnds) {
    memory.current = {
      scene,
      portEnds,
      shapes: arcShapes(scene, portEnds, before?.shapes),
    };
  }
  return { shapes: memory.current?.shapes.list ?? [] };
  /* eslint-enable react/refs */
};
