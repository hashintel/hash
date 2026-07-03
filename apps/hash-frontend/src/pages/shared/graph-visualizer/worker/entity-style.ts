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
import type { TypeId } from "../ids";
import type { TypeRegistry } from "./store/type-registry";

/** Hue step between successive colour slots (degrees). */
const GOLDEN_ANGLE_DEG = 137.508;

const NEUTRAL: Color = [...graphColors.fallbackEntity];
const EDGE_NEUTRAL: Color = [...graphColors.fallbackEntity];

/** Colour for a frontier node (fetched link endpoint, not itself a query root). */
export const FRONTIER_COLOR: Color = [...graphColors.frontier];

/**
 * Visual style of entity dots and flat-tier edges (colour by type hierarchy,
 * size by degree), including the hub-link fading applied by
 * {@link "./entity-graph/flat/edges"}.
 */
export interface EntityStyleConfig {
  /** OKLCH chroma of entity dots. @defaultValue 0.13. */
  readonly nodeChroma: number;
  /** OKLCH lightness of a root type's dots. @defaultValue 0.55. */
  readonly rootLightness: number;
  /** Lightness added per `allOf` depth step, shading subtypes. @defaultValue 0.04. */
  readonly lightnessPerDepth: number;
  /** Hash-jitter half-range separating same-depth sibling types. @defaultValue 0.035. */
  readonly siblingJitter: number;
  /** Lightness clamp floor. @defaultValue 0.4. */
  readonly minLightness: number;
  /** Lightness clamp ceiling. @defaultValue 0.78. */
  readonly maxLightness: number;
  /** Depth beyond which shading stops darkening. @defaultValue 4. */
  readonly maxShadeDepth: number;
  /** Dot alpha (0-255). @defaultValue 220. */
  readonly dotAlpha: number;
  /** Base dot radius in world units. @defaultValue 4. */
  readonly dotBaseRadius: number;
  /** Degree factor: radius = base × (1 + ln(1 + degree) × this). @defaultValue 0.35. */
  readonly dotDegreeScale: number;
  /** OKLCH chroma of typed edges. @defaultValue 0.09. */
  readonly edgeChroma: number;
  /** OKLCH lightness of typed edges. @defaultValue 0.58. */
  readonly edgeLightness: number;
  /** Edge alpha (0-255). @defaultValue 180. */
  readonly edgeAlpha: number;
  /** Flat-tier edge stroke width in world units (the layer scales it with zoom). @defaultValue 1.2. */
  readonly flatEdgeWidth: number;
  /** Endpoint degree at which hub-link fading starts. @defaultValue 8. */
  readonly hubLinkFadeStartDegree: number;
  /** Endpoint degree at which hub-link fading saturates. @defaultValue 128. */
  readonly hubLinkFadeEndDegree: number;
  /** Alpha-scale floor for fully-faded hub links. @defaultValue 0.3. */
  readonly hubLinkFadeMinScale: number;
}

export const defaultEntityStyleConfig: EntityStyleConfig = {
  nodeChroma: 0.13,
  rootLightness: 0.55,
  lightnessPerDepth: 0.04,
  siblingJitter: 0.035,
  minLightness: 0.4,
  maxLightness: 0.78,
  maxShadeDepth: 4,
  dotAlpha: 220,
  dotBaseRadius: 4,
  dotDegreeScale: 0.35,
  edgeChroma: 0.09,
  edgeLightness: 0.58,
  edgeAlpha: 180,
  flatEdgeWidth: 1.2,
  hubLinkFadeStartDegree: 8,
  hubLinkFadeEndDegree: 128,
  hubLinkFadeMinScale: 0.3,
};

/**
 * The active style, read by the colour/radius functions below. Module state
 * rather than a threaded parameter because these run in per-node hot loops on
 * both threads (worker commit passes, main-thread hub labels); each thread
 * calls {@link configureEntityStyle} once at init with the live config.
 */
let style: EntityStyleConfig = defaultEntityStyleConfig;

/** Install the live style on this thread (worker init / visualizer mount). */
export function configureEntityStyle(config: EntityStyleConfig): void {
  style = config;
}

/** The active {@link EntityStyleConfig} on this thread. */
export function entityStyle(): EntityStyleConfig {
  return style;
}

function slotHue(
  typeIdx: TypeId | undefined,
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
  typeIdxs: Iterable<TypeId>,
  types: TypeRegistry,
): TypeId | undefined {
  let best: TypeId | undefined;
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

/**
 * Maps a type to an OKLCH RGBA dot colour from its root hue slot, depth
 * shading, and sibling jitter; returns neutral grey when the type or root
 * slot is missing.
 */
export function colorForType(
  typeIdx: TypeId | undefined,
  types: TypeRegistry,
): Color {
  if (typeIdx === undefined) {
    return NEUTRAL;
  }
  const info = types.get(typeIdx);
  if (info === undefined) {
    return NEUTRAL;
  }
  const hue = slotHue(info.rootIds[0], types);
  if (hue === undefined) {
    return NEUTRAL;
  }
  const depth = Math.min(info.depth, style.maxShadeDepth);

  const fraction = murmur3StringUnit(extractBaseUrl(info.url));

  const jitter = (fraction - 0.5) * 2 * style.siblingJitter;
  const lightness = Math.min(
    style.maxLightness,
    Math.max(
      style.minLightness,
      style.rootLightness + depth * style.lightnessPerDepth + jitter,
    ),
  );
  const [red, green, blue] = oklchToRgb(lightness, style.nodeChroma, hue);
  return [red, green, blue, style.dotAlpha];
}

/**
 * Colour for an edge by its link type.
 *
 * Uses the link type's own colour slot rather than its root's, because
 * all link types share a single root.
 */
export function edgeColorForType(
  typeIdx: TypeId | undefined,
  types: TypeRegistry,
): Color {
  const hue = slotHue(typeIdx, types);
  if (hue === undefined) {
    return EDGE_NEUTRAL;
  }
  const [red, green, blue] = oklchToRgb(
    style.edgeLightness,
    style.edgeChroma,
    hue,
  );
  return [red, green, blue, style.edgeAlpha];
}

/** By-degree dot radius in world units: `base * (1 + ln(1 + deg) * k)`. */
export function radiusForDegree(degree: number): number {
  return (
    style.dotBaseRadius * (1 + Math.log(1 + degree) * style.dotDegreeScale)
  );
}
