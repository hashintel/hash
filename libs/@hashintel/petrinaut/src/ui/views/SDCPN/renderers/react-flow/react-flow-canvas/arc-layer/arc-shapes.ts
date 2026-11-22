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
import {
  type ArcEnd,
  curvePath,
  type FixedEndpoint,
  getOutlineNode,
  type OutlineNode,
} from "../shared/outline-arcs";
import { type ArcGeometry, arcGeometry } from "./arc-geometry";

import type {
  CanvasArc,
  CanvasLinkEnds,
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
};

export type ArcShapes = {
  /** One shape per arc that has both its ends, in the order of the scene. */
  list: ArcShape[];
  byId: ReadonlyMap<string, ArcShape>;
  /** The outline of each node that has one, by node id. */
  outlines: ReadonlyMap<string, OutlineNode>;
};

/**
 * Whether a line already runs from one node to another, among `links`. Node
 * pairs only, ports aside: an arc into a component port and one out of the
 * same component would otherwise meet the transition at one point.
 */
export const joinedPairs = (
  links: readonly Pick<CanvasLinkEnds, "sourceId" | "targetId">[],
): ((sourceId: string, targetId: string) => boolean) => {
  const targetsBySource = new Map<string, Set<string>>();
  for (const { sourceId, targetId } of links) {
    const targets = targetsBySource.get(sourceId);
    if (targets) {
      targets.add(targetId);
    } else {
      targetsBySource.set(sourceId, new Set([targetId]));
    }
  }
  return (sourceId, targetId) =>
    targetsBySource.get(sourceId)?.has(targetId) ?? false;
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
});

export const arcShapes = (
  scene: Pick<CanvasScene, "nodes" | "arcs">,
  portEnds: PortEnds,
  previous?: ArcShapes,
): ArcShapes => {
  const outlines = outlinesOf(scene.nodes, previous?.outlines);
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
      was.focus === arc.focus;

    const shape = kept
      ? was
      : toShape(arc, sameCurve ? was : curveOf(source, target, hasReverseArc));
    byId.set(arc.id, shape);
    list.push(shape);
  }

  const sameList =
    previous !== undefined &&
    previous.list.length === list.length &&
    list.every((shape, index) => shape === previous.list[index]);

  return { list: sameList ? previous.list : list, byId, outlines };
};
