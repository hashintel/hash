/**
 * Per-entity visual encoding for the individual-entity (flat) tiers: colour by
 * type and size by degree (see `LAYOUT-MODES.md` "Cross-cutting features").
 *
 * Colour is hierarchy-aware: the hue comes from the entity's root type and the
 * shade from how specific its actual type is (its depth in the `allOf` tree), so
 * the type tree reads at a glance (every Company-rooted entity is a shade of one
 * hue, a Customer a lighter shade than a bare Company) instead of N arbitrary
 * palette colours.
 *
 * Hue is keyed off a STABLE colour slot the type registry assigns each type
 * (sorted-batch by base URL, append-only), spread around the wheel by the golden
 * angle. The slot -- not an arrival-order intern index -- is what makes a type's
 * colour identical across reloads: it depends on the URL, not on the order types
 * stream in.
 *
 * Size is by degree, subtly: a hub reads as a slightly larger dot. The radius is
 * also the layout's non-overlap box, so hubs claim a little more room.
 */
import { extractBaseUrl } from "@blockprotocol/type-system";

import { graphColors, hslToRgb } from "../visual-style";

import type { Color } from "../frames";
import type { TypeIdx } from "../ids";
import type { TypeRegistry } from "./stores/type-registry";

/** Hue step between successive colour slots (degrees); well-separated, stable. */
const GOLDEN_ANGLE_DEG = 137.508;
const HUE_SATURATION = 0.62;
/**
 * Lightness encodes the type's place in its root's family: a depth gradient
 * (deeper subtype -> lighter) plus a small per-type jitter so siblings at the
 * same depth (Customer vs Supplier under Company) stay distinguishable. The hue
 * is shared across the family, so the tree still reads at a glance.
 */
const ROOT_LIGHTNESS = 0.42;
const LIGHTNESS_PER_DEPTH = 0.045;
const SIBLING_JITTER = 0.045;
const MIN_LIGHTNESS = 0.32;
const MAX_LIGHTNESS = 0.68;
const MAX_SHADE_DEPTH = 4;
const DOT_ALPHA = 220;

/** Base dot radius (world units) and the (subtle) per-degree growth factor. */
const DOT_BASE_RADIUS = 4;
const DOT_DEGREE_K = 0.35;

/** Fallback for an entity whose type/root can't be resolved (untyped, unsent). */
const NEUTRAL: Color = [...graphColors.fallbackEntity];

/**
 * Edges share the nodes' stable slot hues but with lower saturation and mid
 * lightness, so a link reads as related to its type yet sits behind the dots.
 */
const EDGE_SATURATION = 0.58;
const EDGE_LIGHTNESS = 0.46;
const EDGE_ALPHA = 180;
const EDGE_NEUTRAL: Color = [...graphColors.fallbackEntity];

/**
 * Colour for a FRONTIER node: a fetched entity that is a link endpoint of a query root but not
 * itself a root. A cool, desaturated, semi-transparent grey so it reads as "ghosted -- click to
 * expand", receding behind the fully-coloured roots and staying distinct from both the type hues
 * and the focus dim.
 */
export const FRONTIER_COLOR: Color = [...graphColors.frontier];

/**
 * Deterministic FNV-1a 32-bit hash of a string mapped to the unit interval
 * [0, 1). Stable across reloads and sessions, so a value derived from a type's
 * URL is identical every time, unlike an arrival-order intern index whose value
 * depends on the order types stream in.
 */
/* eslint-disable no-bitwise */
function hashUnit(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0x100000000;
}
/* eslint-enable no-bitwise */

/**
 * Golden-angle hue (degrees) for a type's stable colour slot, or undefined when
 * the type has no slot yet (its schema hasn't been registered).
 */
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
 * The most specific type in a set: greatest `allOf` depth, ties broken by the
 * smallest idx (deterministic). This is the type whose shade/icon best
 * represents the entity (a `Customer`, not its `Company` ancestor).
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

/**
 * Hierarchy-aware colour for a (primary) type: hue from its root's colour slot,
 * lightness shade from its depth. Falls back to a neutral grey when the type or
 * its root is unknown.
 */
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
  // Per-type jitter from the type's own base URL: separates same-depth siblings
  // within the shared family hue. Hash-based, so it is stable across reloads.
  const fraction = hashUnit(extractBaseUrl(info.url));
  const jitter = (fraction - 0.5) * 2 * SIBLING_JITTER;
  const lightness = Math.min(
    MAX_LIGHTNESS,
    Math.max(
      MIN_LIGHTNESS,
      ROOT_LIGHTNESS + depth * LIGHTNESS_PER_DEPTH + jitter,
    ),
  );
  const [red, green, blue] = hslToRgb(hue, HUE_SATURATION, lightness);
  return [red, green, blue, DOT_ALPHA];
}

/**
 * Stable colour for an edge of a given (primary link) type: golden-angle hue
 * from the LINK type's OWN colour slot. Link types all share the `Link` root, so
 * keying off the root would collapse every edge to one colour; the own-type slot
 * gives each link type a distinct hue, identical across reloads. Lower
 * saturation / mid lightness than nodes so edges sit behind them.
 */
export function edgeColorForType(
  typeIdx: TypeIdx | undefined,
  types: TypeRegistry,
): Color {
  const hue = slotHue(typeIdx, types);
  if (hue === undefined) {
    return EDGE_NEUTRAL;
  }
  const [red, green, blue] = hslToRgb(hue, EDGE_SATURATION, EDGE_LIGHTNESS);
  return [red, green, blue, EDGE_ALPHA];
}

/** Subtle by-degree dot radius in world units: r = base·(1 + ln(1+deg)·k). */
export function radiusForDegree(degree: number): number {
  return DOT_BASE_RADIUS * (1 + Math.log(1 + degree) * DOT_DEGREE_K);
}
