/**
 * Every arc of the scene sampled to a polyline, shared by the mesh that draws
 * them and the hit testing that finds the arc under the pointer.
 */

import { sampleArcPath, type ArcPolyline } from "./arc-paths";
import { arcEndpointsOf } from "./node-geometry";

import type { ArcRendering } from "../../../../../../react/state/user-settings-context";
import type {
  CanvasArc,
  CanvasPoint,
  CanvasScene,
} from "../../../canvas-scene";

export type ArcPolylines = Map<string, ArcPolyline>;

export const buildArcPolylines = (
  scene: CanvasScene,
  style: ArcRendering,
): ArcPolylines => {
  const nodeById = new Map(scene.nodes.map((node) => [node.id, node]));
  const polylines: ArcPolylines = new Map();
  for (const arc of scene.arcs) {
    const source = nodeById.get(arc.sourceId);
    const target = nodeById.get(arc.targetId);
    if (!source || !target) continue;
    polylines.set(
      arc.id,
      sampleArcPath(
        style,
        arcEndpointsOf(source, arc.sourcePortId, target, arc.targetPortId),
      ),
    );
  }
  return polylines;
};

const distanceToSegment = (
  point: CanvasPoint,
  from: CanvasPoint,
  to: CanvasPoint,
): number => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared,
          ),
        );
  return Math.hypot(point.x - (from.x + dx * t), point.y - (from.y + dy * t));
};

/** The arc whose polyline passes within `tolerance` of a point; later arcs win. */
export const arcAtPoint = (
  scene: CanvasScene,
  polylines: ArcPolylines,
  point: CanvasPoint,
  tolerance: number,
): CanvasArc | null => {
  for (let index = scene.arcs.length - 1; index >= 0; index--) {
    const arc = scene.arcs[index]!;
    const points = polylines.get(arc.id)?.points;
    if (!points) continue;
    for (let segment = 1; segment < points.length; segment++) {
      if (
        distanceToSegment(point, points[segment - 1]!, points[segment]!) <=
        tolerance
      ) {
        return arc;
      }
    }
  }
  return null;
};
