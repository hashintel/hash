/**
 * Hierarchical edge bundling over the delivered region-flow overlay.
 *
 * Every rendered ribbon is evidence: its control polygon is the exact
 * merge-tree path between two watershed regions and its weight is the
 * server-aggregated sum of semantic edge weights between them. Only the
 * smoothing (a clamped B-spline with Holten's straightening factor) is
 * cosmetic, and it never moves the ribbon's endpoints.
 */

import type { AtlasRegionFlow, DecodedAtlasFlows } from "../atlas-client";

/** One bundled flow ready for the path layer. */
export interface AtlasFlowPath {
  readonly edgeCount: number;
  /** Sampled polyline [x0, y0, x1, y1, ...] in world coordinates. */
  readonly path: Float32Array;
  readonly source: number;
  readonly target: number;
  readonly weight: number;
}

/** Bundling parameters; defaults follow Holten's recommendation. */
export interface AtlasBundlingOptions {
  /** 0 draws straight evidence lines; 1 hugs the hierarchy path fully. */
  readonly bundlingStrength?: number;
  /** Sample count per ribbon polyline. */
  readonly samplesPerPath?: number;
}

const defaultBundlingStrength = 0.85;
const defaultSamplesPerPath = 33;

/**
 * Returns the region indices from `region` up to its root, inclusive.
 *
 * The chain length is bounded by the region count, so a corrupt parent
 * cycle cannot hang the renderer; decoding already rejects self-parents.
 */
const ancestryOf = (flows: DecodedAtlasFlows, region: number): number[] => {
  const chain: number[] = [];
  let current: number | undefined = region;
  while (current !== undefined && chain.length <= flows.regions.length) {
    chain.push(current);
    current = flows.regions[current]?.parent;
  }
  return chain;
};

/**
 * Builds the merge-tree control polygon between two regions.
 *
 * The polygon walks source → ... → lowest common ancestor → ... → target.
 * Regions in separate trees simply concatenate both root paths, which is
 * the standard forest treatment for hierarchical bundling.
 */
export const atlasFlowControlPoints = (
  flows: DecodedAtlasFlows,
  flow: AtlasRegionFlow,
): number[] => {
  const sourceChain = ancestryOf(flows, flow.source);
  const targetChain = ancestryOf(flows, flow.target);
  const targetDepth = new Map<number, number>();
  for (const [depth, region] of targetChain.entries()) {
    targetDepth.set(region, depth);
  }

  const controls: number[] = [];
  let junction: number | undefined;
  for (const region of sourceChain) {
    const depth = targetDepth.get(region);
    if (depth !== undefined) {
      junction = depth;
      controls.push(region);
      break;
    }
    controls.push(region);
  }
  const descent =
    junction === undefined ? targetChain : targetChain.slice(0, junction);
  for (const region of descent.reverse()) {
    controls.push(region);
  }
  return controls;
};

/**
 * Bundles every delivered flow into a sampled ribbon polyline.
 *
 * Control points are straightened toward the source-target chord by
 * `1 - bundlingStrength` before spline evaluation, so lowering the strength
 * continuously morphs the picture into a plain flow map. Ribbon endpoints
 * always remain the two region peaks.
 */
export const bundleAtlasFlows = (
  flows: DecodedAtlasFlows,
  options: AtlasBundlingOptions = {},
): AtlasFlowPath[] => {
  const strength = options.bundlingStrength ?? defaultBundlingStrength;
  const samples = Math.max(options.samplesPerPath ?? defaultSamplesPerPath, 2);

  return flows.flows.map((flow) => {
    const controls = atlasFlowControlPoints(flows, flow);
    const points = controls.map((region) => {
      const peak = flows.regions[region];
      if (peak === undefined) {
        throw new Error(`Flow references missing region ${region}`);
      }
      return [peak.x, peak.y] as const;
    });
    const first = points[0];
    const last = points[points.length - 1];
    if (first === undefined || last === undefined) {
      throw new Error("Flow control polygon is empty");
    }
    const straightened = points.map(([x, y], index) => {
      const along = points.length === 1 ? 0 : index / (points.length - 1);
      const chordX = first[0] + (last[0] - first[0]) * along;
      const chordY = first[1] + (last[1] - first[1]) * along;
      return [
        strength * x + (1 - strength) * chordX,
        strength * y + (1 - strength) * chordY,
      ] as const;
    });
    return {
      edgeCount: flow.edgeCount,
      path: sampleClampedBSpline(straightened, samples),
      source: flow.source,
      target: flow.target,
      weight: flow.weight,
    };
  });
};

/**
 * Returns the region whose peak lies nearest to a world coordinate.
 *
 * Hover focus uses this instead of GPU picking: with at most a few dozen
 * watershed regions a linear scan is exact, deterministic, and free of
 * picking-buffer subtleties. Peaks farther than `maximumDistance` world
 * units return no focus so empty space clears the filter.
 */
export const nearestAtlasRegion = (
  flows: DecodedAtlasFlows,
  worldX: number,
  worldY: number,
  maximumDistance: number,
): number | undefined => {
  let nearest: number | undefined;
  let nearestSquared = maximumDistance * maximumDistance;
  for (const [index, region] of flows.regions.entries()) {
    const deltaX = region.x - worldX;
    const deltaY = region.y - worldY;
    const squared = deltaX * deltaX + deltaY * deltaY;
    if (squared <= nearestSquared) {
      nearest = index;
      nearestSquared = squared;
    }
  }
  return nearest;
};

/**
 * Samples a clamped uniform B-spline through the control points.
 *
 * The degree adapts down for short polygons, and clamped end knots make the
 * curve interpolate both endpoints exactly, which keeps ribbons anchored on
 * their region peaks.
 */
export const sampleClampedBSpline = (
  controls: ReadonlyArray<readonly [number, number]>,
  samples: number,
): Float32Array => {
  const path = new Float32Array(samples * 2);
  const count = controls.length;
  const first = controls[0];
  const last = controls[count - 1];
  if (first === undefined || last === undefined) {
    return path;
  }
  if (count === 1) {
    for (let sample = 0; sample < samples; sample += 1) {
      path[sample * 2] = first[0];
      path[sample * 2 + 1] = first[1];
    }
    return path;
  }

  const degree = Math.min(3, count - 1);
  const knotCount = count + degree + 1;
  const knots = new Float64Array(knotCount);
  const interior = count - degree;
  for (let index = 0; index < knotCount; index += 1) {
    if (index <= degree) {
      knots[index] = 0;
    } else if (index >= count) {
      knots[index] = interior;
    } else {
      knots[index] = index - degree;
    }
  }

  for (let sample = 0; sample < samples; sample += 1) {
    const parameter = (interior * sample) / (samples - 1);
    const [x, y] = deBoor(controls, knots, degree, parameter, interior);
    path[sample * 2] = x;
    path[sample * 2 + 1] = y;
  }
  // Clamped end knots interpolate the endpoints analytically; write them
  // explicitly so accumulated floating-point error can never detach a
  // ribbon from its region peak.
  path[0] = first[0];
  path[1] = first[1];
  path[(samples - 1) * 2] = last[0];
  path[(samples - 1) * 2 + 1] = last[1];
  return path;
};

/** Evaluates the spline at `parameter` with de Boor's algorithm. */
const deBoor = (
  controls: ReadonlyArray<readonly [number, number]>,
  knots: Float64Array,
  degree: number,
  parameter: number,
  domainEnd: number,
): readonly [number, number] => {
  const clamped = Math.min(Math.max(parameter, 0), domainEnd);
  let span = degree;
  while (
    span < controls.length - 1 &&
    (knots[span + 1] ?? domainEnd) <= clamped
  ) {
    span += 1;
  }

  const workingX: number[] = [];
  const workingY: number[] = [];
  for (let offset = 0; offset <= degree; offset += 1) {
    const control = controls[span - degree + offset];
    if (control === undefined) {
      throw new Error("B-spline span indexes a missing control point");
    }
    workingX.push(control[0]);
    workingY.push(control[1]);
  }
  for (let level = 1; level <= degree; level += 1) {
    for (let offset = degree; offset >= level; offset -= 1) {
      const index = span - degree + offset;
      const denominator =
        (knots[index + degree - level + 1] ?? 0) - (knots[index] ?? 0);
      const alpha =
        denominator === 0 ? 0 : (clamped - (knots[index] ?? 0)) / denominator;
      workingX[offset] =
        (1 - alpha) * (workingX[offset - 1] ?? 0) +
        alpha * (workingX[offset] ?? 0);
      workingY[offset] =
        (1 - alpha) * (workingY[offset - 1] ?? 0) +
        alpha * (workingY[offset] ?? 0);
    }
  }
  return [workingX[degree] ?? 0, workingY[degree] ?? 0];
};
