/**
 * Per-entity visual style: colour by type hierarchy, size by degree.
 *
 * Hue is assigned per root type via the golden angle. Lightness encodes
 * depth in the `allOf` tree, so subtypes within the same family are
 * distinguishable shades of one hue. A hash-based jitter separates
 * siblings at the same depth.
 */
import { extractBaseUrl } from "@blockprotocol/type-system";

import { oklchToRgb } from "../math/color";
import { murmur3StringUnit } from "../math/hash";
import { graphColors } from "../visual-style";

import type { Color } from "../frames";
import type { TypeIdx } from "../ids";
import type { TypeRegistry } from "./stores/type-registry";

/** Hue step between successive colour slots (degrees). */
const GOLDEN_ANGLE_DEG = 137.508;
const NODE_CHROMA = 0.13;
const ROOT_LIGHTNESS = 0.55;
const LIGHTNESS_PER_DEPTH = 0.04;
const SIBLING_JITTER = 0.035;
const MIN_LIGHTNESS = 0.4;
const MAX_LIGHTNESS = 0.78;
const MAX_SHADE_DEPTH = 4;
const DOT_ALPHA = 220;

const DOT_BASE_RADIUS = 4;
const DOT_DEGREE_K = 0.35;

const NEUTRAL: Color = [...graphColors.fallbackEntity];

const EDGE_CHROMA = 0.09;
const EDGE_LIGHTNESS = 0.58;
const EDGE_ALPHA = 180;
const EDGE_NEUTRAL: Color = [...graphColors.fallbackEntity];

/** Colour for a frontier node (fetched link endpoint, not itself a query root). */
export const FRONTIER_COLOR: Color = [...graphColors.frontier];

function slotHue(
  typeIdx: TypeIdx | undefined,
  types: TypeRegistry,
): number | undefined {
  if (typeIdx === undefined) {
    return undefined;
  }
  const slot = types.colorSlot(typeIdx);
  return slot === undefined ? undefined : (slot * GOLDEN_ANGLE_DEG) % 360;
}

/**
 * The most specific type in a set: greatest `allOf` depth, ties broken
 * by the smallest idx.
 */
export function primaryTypeOfSet(
  typeIdxs: Iterable<TypeIdx>,
  types: TypeRegistry,
): TypeIdx | undefined {
  let best: TypeIdx | undefined;
  let bestDepth = -1;
  for (const typeIdx of typeIdxs) {
    const depth = types.get(typeIdx)?.depth ?? 0;
    if (
      best === undefined ||
      depth > bestDepth ||
      (depth === bestDepth && typeIdx < best)
    ) {
      best = typeIdx;
      bestDepth = depth;
    }
  }
  return best;
}

/** Colour for a type. Falls back to neutral grey when the type or its root is unknown. */
export function colorForType(
  typeIdx: TypeIdx | undefined,
  types: TypeRegistry,
): Color {
  if (typeIdx === undefined) {
    return NEUTRAL;
  }
  const info = types.get(typeIdx);
  if (info === undefined) {
    return NEUTRAL;
  }
  const hue = slotHue(info.rootIdxs[0], types);
  if (hue === undefined) {
    return NEUTRAL;
  }
  const depth = Math.min(info.depth, MAX_SHADE_DEPTH);

  // Hash-based jitter separates same-depth siblings within a family hue.
  const fraction = murmur3StringUnit(extractBaseUrl(info.url));

  const jitter = (fraction - 0.5) * 2 * SIBLING_JITTER;
  const lightness = Math.min(
    MAX_LIGHTNESS,
    Math.max(
      MIN_LIGHTNESS,
      ROOT_LIGHTNESS + depth * LIGHTNESS_PER_DEPTH + jitter,
    ),
  );
  const [red, green, blue] = oklchToRgb(lightness, NODE_CHROMA, hue);
  return [red, green, blue, DOT_ALPHA];
}

/**
 * Colour for an edge by its link type.
 *
 * Uses the link type's own colour slot rather than its root's, because
 * all link types share a single root.
 */
export function edgeColorForType(
  typeIdx: TypeIdx | undefined,
  types: TypeRegistry,
): Color {
  const hue = slotHue(typeIdx, types);
  if (hue === undefined) {
    return EDGE_NEUTRAL;
  }
  const [red, green, blue] = oklchToRgb(EDGE_LIGHTNESS, EDGE_CHROMA, hue);
  return [red, green, blue, EDGE_ALPHA];
}

/** By-degree dot radius in world units: `base * (1 + ln(1 + deg) * k)`. */
export function radiusForDegree(degree: number): number {
  return DOT_BASE_RADIUS * (1 + Math.log(1 + degree) * DOT_DEGREE_K);
}
