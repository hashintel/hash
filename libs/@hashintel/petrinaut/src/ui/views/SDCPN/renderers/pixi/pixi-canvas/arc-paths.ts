/**
 * Arc geometry for the Pixi renderer: the three path styles the settings
 * offer, sampled to polylines. The shapes match what React Flow draws, so
 * switching renderers does not move any arc.
 */

import type { ArcRendering } from "../../../../../../react/state/user-settings-context";
import type { CanvasPoint } from "../../../canvas-scene";

/** Handle centres: the arc leaves the source rightwards and enters the target from the left. */
export type ArcEndpoints = { source: CanvasPoint; target: CanvasPoint };

export type ArcPolyline = {
  points: CanvasPoint[];
  /** Where a weight label sits. */
  label: CanvasPoint;
  /** Unit direction of travel at the target end, for the arrow head. */
  endTangent: CanvasPoint;
};

const bezierSegments = 24;

const unit = ({ x, y }: CanvasPoint): CanvasPoint => {
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
};

const cubicPoint = (
  start: CanvasPoint,
  control1: CanvasPoint,
  control2: CanvasPoint,
  end: CanvasPoint,
  t: number,
): CanvasPoint => {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * start.x + b * control1.x + c * control2.x + d * end.x,
    y: a * start.y + b * control1.y + c * control2.y + d * end.y,
  };
};

const sampleCubic = (
  start: CanvasPoint,
  control1: CanvasPoint,
  control2: CanvasPoint,
  end: CanvasPoint,
): ArcPolyline => ({
  points: Array.from({ length: bezierSegments + 1 }, (_, index) =>
    cubicPoint(start, control1, control2, end, index / bezierSegments),
  ),
  label: cubicPoint(start, control1, control2, end, 0.5),
  endTangent: unit({ x: end.x - control2.x, y: end.y - control2.y }),
});

/**
 * Petrinaut's adaptive bezier: control offsets proportional to the horizontal
 * distance, so arcs stay tight between neighbours and sweep wide otherwise.
 */
const customPath = ({ source, target }: ArcEndpoints): ArcPolyline => {
  const offset = Math.max(Math.abs(target.x - source.x) * 0.7, 80);
  return sampleCubic(
    source,
    { x: source.x + offset / 2, y: source.y },
    { x: target.x - offset, y: target.y },
    target,
  );
};

const bezierCurvature = 0.25;

/** React Flow's control offset: half the distance forwards, a damped sweep backwards. */
const bezierControlOffset = (distance: number): number =>
  distance >= 0 ? 0.5 * distance : bezierCurvature * 25 * Math.sqrt(-distance);

/** React Flow's default bezier between a right-facing source and a left-facing target. */
const bezierPath = ({ source, target }: ArcEndpoints): ArcPolyline =>
  sampleCubic(
    source,
    { x: source.x + bezierControlOffset(target.x - source.x), y: source.y },
    { x: target.x - bezierControlOffset(target.x - source.x), y: target.y },
    target,
  );

const stepOffset = 20;
const stepRadius = 5;
const cornerSegments = 4;

/**
 * Replaces each interior corner of an orthogonal polyline with a small arc
 * of radius `stepRadius`, shortened when a leg is too short to fit it.
 */
const roundCorners = (corners: CanvasPoint[]): CanvasPoint[] => {
  const points: CanvasPoint[] = [corners[0]!];
  for (let index = 1; index < corners.length - 1; index++) {
    const before = corners[index - 1]!;
    const corner = corners[index]!;
    const after = corners[index + 1]!;
    const inDir = unit({ x: corner.x - before.x, y: corner.y - before.y });
    const outDir = unit({ x: after.x - corner.x, y: after.y - corner.y });
    const radius = Math.min(
      stepRadius,
      Math.hypot(corner.x - before.x, corner.y - before.y) / 2,
      Math.hypot(after.x - corner.x, after.y - corner.y) / 2,
    );
    const entry = {
      x: corner.x - inDir.x * radius,
      y: corner.y - inDir.y * radius,
    };
    const exit = {
      x: corner.x + outDir.x * radius,
      y: corner.y + outDir.y * radius,
    };
    for (let step = 0; step <= cornerSegments; step++) {
      const t = step / cornerSegments;
      // Quadratic bezier through the corner approximates the rounded bend.
      const u = 1 - t;
      points.push({
        x: u * u * entry.x + 2 * u * t * corner.x + t * t * exit.x,
        y: u * u * entry.y + 2 * u * t * corner.y + t * t * exit.y,
      });
    }
  }
  points.push(corners[corners.length - 1]!);
  return points;
};

/**
 * React Flow's smooth step between a right-facing source and a left-facing
 * target: a short lead out of each handle, then one vertical split halfway
 * when the target is ahead, or a horizontal detour around when it is behind.
 */
const smoothStepPath = ({ source, target }: ArcEndpoints): ArcPolyline => {
  const sourceGapped = { x: source.x + stepOffset, y: source.y };
  const targetGapped = { x: target.x - stepOffset, y: target.y };
  const center = {
    x: (sourceGapped.x + targetGapped.x) / 2,
    y: (sourceGapped.y + targetGapped.y) / 2,
  };
  const targetAhead = targetGapped.x >= sourceGapped.x;
  const split = targetAhead
    ? [
        { x: center.x, y: sourceGapped.y },
        { x: center.x, y: targetGapped.y },
      ]
    : [
        { x: sourceGapped.x, y: center.y },
        { x: targetGapped.x, y: center.y },
      ];
  const corners = [source, sourceGapped, ...split, targetGapped, target];
  return {
    points: roundCorners(corners),
    label: center,
    endTangent: { x: 1, y: 0 },
  };
};

export const sampleArcPath = (
  style: ArcRendering,
  endpoints: ArcEndpoints,
): ArcPolyline => {
  switch (style) {
    case "bezier":
      return bezierPath(endpoints);
    case "smoothstep":
      return smoothStepPath(endpoints);
    case "custom":
      return customPath(endpoints);
  }
};

/** Length of the polyline, for dash phases and tick spacing. */
export const polylineLength = (points: CanvasPoint[]): number => {
  let length = 0;
  for (let index = 1; index < points.length; index++) {
    length += Math.hypot(
      points[index]!.x - points[index - 1]!.x,
      points[index]!.y - points[index - 1]!.y,
    );
  }
  return length;
};

/** The point and unit tangent at `distance` along the polyline. */
export const pointAlong = (
  points: CanvasPoint[],
  distance: number,
): { point: CanvasPoint; tangent: CanvasPoint } => {
  let remaining = distance;
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1]!;
    const to = points[index]!;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (remaining <= length || index === points.length - 1) {
      const t = length === 0 ? 0 : Math.min(1, remaining / length);
      return {
        point: {
          x: from.x + (to.x - from.x) * t,
          y: from.y + (to.y - from.y) * t,
        },
        tangent: unit({ x: to.x - from.x, y: to.y - from.y }),
      };
    }
    remaining -= length;
  }
  const last = points[points.length - 1]!;
  return { point: last, tangent: { x: 1, y: 0 } };
};
