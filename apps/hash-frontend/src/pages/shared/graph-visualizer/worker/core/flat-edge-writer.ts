/**
 * The shared straight-edge writer for flat pipelines: turns one edge between
 * two placed disks into a clipped straight cubic (inset off both node rims)
 * plus a packed endpoint arrow. Both flat lifecycles use it — the entity
 * tier's per-link pipeline ({@link "../entity-graph/flat/edges"}) and the
 * type graph's edge table — so the inset/arrow geometry cannot drift between
 * them. Per-tick hot path: scalar sink writes only, no allocation.
 */
import type { Color } from "../../frames";
import type {
  BezierSegmentSink,
  EndpointArrowSink,
} from "../geometry/edge-geometry";

/**
 * Write one straight edge from disk A (`ax`, `ay`, radius `aRadius`) to disk
 * B, clipped off both rims, as a degenerate cubic plus an endpoint arrow at
 * the target. Skips degenerate edges (coincident nodes, or a visible chord
 * shorter than the stroke width). `id` is the segment's pick identity
 * (`beziers.ids[i]`): the caller decides what it indexes (the entity tier
 * writes the link's EntityIdx, the type graph an edge-table index).
 */
export function writeStraightFlatEdge(
  sink: BezierSegmentSink,
  arrows: EndpointArrowSink,
  ax: number,
  ay: number,
  aRadius: number,
  bx: number,
  by: number,
  bRadius: number,
  color: Color,
  edgeWidth: number,
  id: number,
): void {
  const dx = bx - ax;
  const dy = by - ay;
  const chord = Math.hypot(dx, dy);

  if (chord <= 0.001) {
    return;
  }

  const startDistance = aRadius + edgeWidth;
  const endDistance = bRadius + edgeWidth;
  const visibleChord = chord - startDistance - endDistance;
  if (visibleChord <= edgeWidth) {
    return;
  }

  const ux = dx / chord;
  const uy = dy / chord;
  const sx = ax + ux * startDistance;
  const sy = ay + uy * startDistance;
  const tx = bx - ux * endDistance;
  const ty = by - uy * endDistance;
  const edgeEndInset = Math.min(edgeWidth * 0.9, visibleChord * 0.35);
  const edgeTx = tx - ux * edgeEndInset;
  const edgeTy = ty - uy * edgeEndInset;
  const visibleDx = edgeTx - sx;
  const visibleDy = edgeTy - sy;

  sink.pushUnclipped(
    sx,
    sy,
    sx + visibleDx / 3,
    sy + visibleDy / 3,
    sx + (2 * visibleDx) / 3,
    sy + (2 * visibleDy) / 3,
    edgeTx,
    edgeTy,
    color,
    edgeWidth,
    id,
  );

  const arrowInset = Math.min(edgeWidth * 0.45, visibleChord * 0.2);
  arrows.push(
    tx + ux * arrowInset,
    ty + uy * arrowInset,
    Math.atan2(dy, dx),
    edgeWidth,
    visibleChord,
    color,
  );
}
