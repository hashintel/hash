/**
 * The arcs of a scene as shapes to draw: each with the curve between its two
 * ends, and the path data of everything drawn along it.
 *
 * A scene is rebuilt for every hover, selection and drag frame, with every
 * arc a new object. `arcShapes` takes the shapes of the scene before and
 * returns the same object for each arc that draws the same, and the same
 * list when every arc does. So a frame computes the curves of the arcs whose
 * ends moved, and the layer renders the arcs whose shape is a new object.
 */

import { arcHeadPath } from "../arc-head";
import { joinedPairs } from "../shared/joined-pairs";
import {
  type ArcEnd,
  curvePath,
  type FixedEndpoint,
  getOutlineNode,
  type OutlineNode,
} from "../shared/outline-arcs";
import { type ArcGeometry, arcGeometry } from "./arc-shapes/arc-geometry";

import type {
  CanvasArc,
  CanvasNode,
  CanvasScene,
} from "../../../../canvas-scene";

/**
 * Where an arc that ends at a component port meets the port's pin. An end
 * that is no port is `null`, and so is a pin that is not measured yet.
 */
export type PortEnd = {
  source: FixedEndpoint | null;
  target: FixedEndpoint | null;
};

/** The arcs that end at a component port, by arc id. */
export type PortEnds = ReadonlyMap<string, PortEnd>;

export type ArcShape = Pick<
  CanvasArc,
  | "id"
  | "kind"
  | "weight"
  | "color"
  | "selected"
  | "focus"
  | "transitionId"
  | "sourceId"
  | "targetId"
> & {
  /** What the arc ends at. Unchanged ends are the same objects. */
  source: ArcEnd;
  target: ArcEnd;
  /** Whether an arc runs the other way between the same two nodes. */
  hasReverseArc: boolean;
  geometry: ArcGeometry;
  /** The whole curve, the curve up to the arrowhead, and the arrowhead. */
  paths: { curve: string; shaft: string; head: string };
  /**
   * Whether the arc draws its own strokes. An arc at rest does not: the arcs
   * at rest of one colour are drawn together, in the paths of their run.
   */
  alone: boolean;
};

export type ArcShapes = {
  /** One shape per arc that has both its ends, in the order of the scene. */
  list: ArcShape[];
  byId: ReadonlyMap<string, ArcShape>;
  /** The outline of each node that has one, by node id. */
  outlines: ReadonlyMap<string, OutlineNode>;
};

const sameOutline = (left: OutlineNode, right: OutlineNode): boolean =>
  left.position.x === right.position.x &&
  left.position.y === right.position.y &&
  left.width === right.width &&
  left.height === right.height &&
  left.cornerRadius === right.cornerRadius;

/** The outline of each node that has one, the previous object where it is the same. */
const outlinesOf = (
  nodes: readonly CanvasNode[],
  previous: ReadonlyMap<string, OutlineNode> | undefined,
): Map<string, OutlineNode> => {
  const outlines = new Map<string, OutlineNode>();
  for (const node of nodes) {
    const outline = getOutlineNode(node);
    if (outline) {
      const was = previous?.get(node.id);
      outlines.set(node.id, was && sameOutline(was, outline) ? was : outline);
    }
  }
  return outlines;
};

const sameEnd = (left: ArcEnd, right: ArcEnd): boolean =>
  left === right ||
  ("point" in left &&
    "point" in right &&
    left.point.x === right.point.x &&
    left.point.y === right.point.y &&
    left.normal.x === right.normal.x &&
    left.normal.y === right.normal.y);

/** What a shape has of its curve alone: an arc that only changes colour keeps it. */
type ArcCurveShape = Pick<
  ArcShape,
  "source" | "target" | "hasReverseArc" | "geometry" | "paths"
>;

const curveOf = (
  source: ArcEnd,
  target: ArcEnd,
  hasReverseArc: boolean,
): ArcCurveShape => {
  const geometry = arcGeometry(source, target, hasReverseArc);
  return {
    source,
    target,
    hasReverseArc,
    geometry,
    paths: {
      curve: curvePath(geometry.curve),
      shaft: curvePath(geometry.shaft),
      head: arcHeadPath(geometry.curve.end, geometry.arrival),
    },
  };
};

const toShape = (
  arc: CanvasArc,
  { source, target, hasReverseArc, geometry, paths }: ArcCurveShape,
  alone: boolean,
): ArcShape => ({
  id: arc.id,
  kind: arc.kind,
  weight: arc.weight,
  color: arc.color,
  selected: arc.selected,
  focus: arc.focus,
  transitionId: arc.transitionId,
  sourceId: arc.sourceId,
  targetId: arc.targetId,
  source,
  target,
  hasReverseArc,
  geometry,
  paths,
  alone,
});

/**
 * The shapes of a scene's arcs. `leavingFocus` names the arcs that had a
 * focus role until a moment ago.
 *
 * An arc draws its own strokes while it is not like the arcs at rest:
 *
 * - it has a focus role or is selected, so it wears a casing or a band and
 *   never fades;
 * - it just lost its role, and is fading on its own;
 * - a node at one of its ends is being dragged, so its curve changes on
 *   every frame, and a merged path would be written again for each;
 * - it is a read or an inhibitor arc, whose marks lie on its line;
 * - it ends at a component port, whose pin moves while its card opens or
 *   closes.
 */
export const arcShapes = (
  scene: Pick<CanvasScene, "nodes" | "arcs">,
  portEnds: PortEnds,
  leavingFocus: ReadonlySet<string>,
  previous?: ArcShapes,
): ArcShapes => {
  const outlines = outlinesOf(scene.nodes, previous?.outlines);
  const dragged = new Set<string>();
  for (const node of scene.nodes) {
    if (node.dragging) {
      dragged.add(node.id);
    }
  }
  const hasArc = joinedPairs(scene.arcs);
  const byId = new Map<string, ArcShape>();
  const list: ArcShape[] = [];

  for (const arc of scene.arcs) {
    const source = arc.sourcePortId
      ? portEnds.get(arc.id)?.source
      : outlines.get(arc.sourceId);
    const target = arc.targetPortId
      ? portEnds.get(arc.id)?.target
      : outlines.get(arc.targetId);
    // An arc whose node is missing, or whose pin is not measured yet.
    if (!source || !target) {
      continue;
    }
    const hasReverseArc = hasArc(arc.targetId, arc.sourceId);
    const alone =
      arc.kind !== "standard" ||
      arc.focus !== "none" ||
      arc.selected ||
      arc.sourcePortId !== null ||
      arc.targetPortId !== null ||
      leavingFocus.has(arc.id) ||
      dragged.has(arc.sourceId) ||
      dragged.has(arc.targetId);
    const was = previous?.byId.get(arc.id);
    const sameCurve =
      was !== undefined &&
      sameEnd(was.source, source) &&
      sameEnd(was.target, target) &&
      was.hasReverseArc === hasReverseArc;
    const kept =
      sameCurve &&
      was.kind === arc.kind &&
      was.weight === arc.weight &&
      was.color === arc.color &&
      was.selected === arc.selected &&
      was.focus === arc.focus &&
      was.alone === alone;

    const shape = kept
      ? was
      : toShape(
          arc,
          sameCurve ? was : curveOf(source, target, hasReverseArc),
          alone,
        );
    byId.set(arc.id, shape);
    list.push(shape);
  }

  const sameList =
    previous !== undefined &&
    previous.list.length === list.length &&
    list.every((shape, index) => shape === previous.list[index]);

  return { list: sameList ? previous.list : list, byId, outlines };
};
