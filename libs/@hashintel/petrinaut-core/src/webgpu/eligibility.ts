/**
 * Whether a net can run on the WebGPU backend.
 *
 * The GPU backend is deliberately a *subset* engine. It exists because a
 * restricted shape — bounded state, 32-bit numbers, no per-frame host
 * round-trip — is thousands of times faster than the general CPU path, and that
 * restriction is only safe if it is checked up front and reported honestly.
 *
 * Eligibility is computed before any shader is generated, so an ineligible net
 * falls back to the CPU with a reason the UI can show, rather than failing at
 * shader-compile time where the cause would be opaque.
 */
import { getArcEndpointPlaceId } from "../arc-endpoints";
import {
  normalizePlaceCapacity,
  PLACE_CAPACITY_UNBOUNDED,
} from "../simulation/engine/capacity";
import { PAIR_EXACT_TOKEN_LIMIT } from "./compile-net-shader/pair-selection";

import type { SDCPN } from "../types/sdcpn";

/**
 * Most typed tokens one arc may consume from a place.
 *
 * Two, because the shader picks the combination by unranking — mapping a flat
 * index to the k-th combination in the engine's own order, which the pair case
 * has in closed form (`pair-selection.ts`). Wider arcs would need the general
 * greedy unranking and a deeper scan.
 */
const MAX_COLORED_INPUT_ARC_WEIGHT = 2;

/** Why a net cannot use the GPU backend. */
export type GpuIneligibilityReason = {
  /** Stable code, for tests and for grouping in the UI. */
  code:
    | "unsupported-attribute-type"
    | "colored-input-arc-weight"
    | "colored-pair-capacity"
    | "no-transitions"
    | "state-too-large";
  message: string;
  /** The net item responsible, when one can be identified. */
  itemId?: string;
};

export type GpuEligibility =
  | { eligible: true; profile: GpuNetProfile }
  | { eligible: false; reasons: GpuIneligibilityReason[] };

/**
 * Static facts about an eligible net that the shader generator needs.
 */
export type GpuNetProfile = {
  /** Places in frame order, with their GPU storage shape. */
  places: GpuPlaceProfile[];
  /** Whether every place is uncoloured, so per-run state is just counts. */
  uncolouredOnly: boolean;
  /**
   * Per-run state size in bytes from *declared* capacities only — derived
   * slabs are measured later by the probe, so this understates a
   * derived-capacity net's real footprint.
   */
  bytesPerRun: number;
};

export type GpuPlaceProfile = {
  id: string;
  name: string;
  /** Token *slots* to allocate; 0 for uncoloured places, which store only a count. */
  capacity: number;
  /**
   * Where the slot count comes from. A declared capacity is the modeler's
   * own bound, enforced as blocking semantics on both backends. A derived
   * capacity is a buffer size the backend measures by probing — the
   * shader detects overflow and the handle grows it, never blocking a
   * firing the CPU would allow.
   */
  capacitySource: "declared" | "derived";
  /**
   * The place's declared token limit in its dense runtime form
   * (`PLACE_CAPACITY_UNBOUNDED` when absent). Distinct from `capacity`:
   * an uncoloured place allocates no slots but may still be capped, and
   * dropping that cap would let the GPU run past a limit the CPU enforces.
   */
  declaredCapacity: number;
  /** Names of `real` attributes, in declaration order. These are integrated. */
  realFields: string[];
  /** Names of `integer`/`boolean` attributes, carried but not integrated. */
  discreteFields: string[];
  colored: boolean;
  /**
   * Whether a weight-2 typed arc consumes from this place. The shader
   * unranks pairs in f32, exact only up to `PAIR_EXACT_TOKEN_LIMIT` tokens,
   * so such a place's slots are held at that bound.
   */
  pairConsumed: boolean;
};

/**
 * The largest token count `place` can reach, or null when nothing bounds it:
 * a typed place's slot capacity, else its declared capacity. A derived slab
 * bounds counts too, because the shader halts a run that outgrows it.
 */
export const placeCountCeiling = (place: GpuPlaceProfile): number | null => {
  if (place.colored) {
    return place.capacity;
  }
  return place.declaredCapacity === PLACE_CAPACITY_UNBOUNDED
    ? null
    : place.declaredCapacity;
};

/**
 * The most slots a derived-capacity place may be given: unbounded, unless a
 * pair arc consumes from it, where the f32 unranking stops being exact.
 */
export const derivedSlabCeiling = (
  place: Pick<GpuPlaceProfile, "pairConsumed">,
): number =>
  place.pairConsumed ? PAIR_EXACT_TOKEN_LIMIT : Number.POSITIVE_INFINITY;

/** Storage words per token: one f32 per real field, one u32 per discrete field. */
export const tokenWordCount = (
  place: Pick<GpuPlaceProfile, "realFields" | "discreteFields">,
): number => place.realFields.length + place.discreteFields.length;

/**
 * Attribute types the GPU backend can hold.
 *
 * `string` is a 64-bit pool id and `uuid` is 128-bit; WGSL integers are 32-bit,
 * so neither can be represented. See `emit-wgsl.ts`.
 */
const SUPPORTED_ATTRIBUTE_TYPES = new Set(["real", "integer", "boolean"]);

/**
 * Decides whether `sdcpn` can run on the GPU backend.
 *
 * `maxBytesPerRun` guards against a net whose bounded state is technically
 * finite but absurd — a declared capacity of ten million. Run tiling absorbs
 * large per-run state by running fewer runs per tile, so the limit is a
 * megabyte per run (≥128 runs per tile at the 128 MiB default binding), not
 * a parallelism target.
 */
export function assessGpuEligibility(
  sdcpn: SDCPN,
  { maxBytesPerRun = 1024 * 1024 }: { maxBytesPerRun?: number } = {},
): GpuEligibility {
  const reasons: GpuIneligibilityReason[] = [];
  const typeById = new Map(sdcpn.types.map((type) => [type.id, type]));
  const places: GpuNetProfile["places"] = [];

  // Per-run state always carries: one u32 count per place and one u32 firing
  // count per transition, plus an RNG word and status.
  let stateWords = sdcpn.places.length + sdcpn.transitions.length + 2;

  const pairConsumedPlaceIds = new Set(
    sdcpn.transitions.flatMap((transition) =>
      transition.inputArcs
        .filter((arc) => arc.type !== "inhibitor" && arc.weight === 2)
        .flatMap((arc) => getArcEndpointPlaceId(arc) ?? []),
    ),
  );

  for (const place of sdcpn.places) {
    const colored = place.colorId !== null;
    const realFields: string[] = [];
    const discreteFields: string[] = [];

    if (colored) {
      const color = typeById.get(place.colorId!);
      for (const element of color?.elements ?? []) {
        if (!SUPPORTED_ATTRIBUTE_TYPES.has(element.type)) {
          reasons.push({
            code: "unsupported-attribute-type",
            itemId: place.id,
            message: `Place \`${place.name}\` carries a \`${element.type}\` attribute (\`${element.name}\`). WebGPU integers are 32-bit, so string and uuid attributes cannot be represented.`,
          });
          continue;
        }
        if (element.type === "real") {
          realFields.push(element.name);
        } else {
          discreteFields.push(element.name);
        }
      }

      // A coloured place needs a fixed token slot count to live in a buffer.
      // A declared capacity supplies it; without one the backend derives it
      // by probing (`gpu-experiment-handle.ts`), so the place is eligible
      // with a placeholder the compile substitutes.
      const capacity = place.capacity;
      const derived = capacity === undefined || capacity === null;
      if (!derived) {
        stateWords += capacity * tokenWordCount({ realFields, discreteFields });
      }
      places.push({
        id: place.id,
        name: place.name,
        capacity: derived ? 0 : capacity,
        capacitySource: derived ? "derived" : "declared",
        declaredCapacity: normalizePlaceCapacity(place.capacity),
        realFields,
        discreteFields,
        colored: true,
        pairConsumed: pairConsumedPlaceIds.has(place.id),
      });
    } else {
      places.push({
        id: place.id,
        name: place.name,
        capacity: 0,
        capacitySource: "declared",
        declaredCapacity: normalizePlaceCapacity(place.capacity),
        realFields: [],
        discreteFields: [],
        colored: false,
        pairConsumed: false,
      });
    }
  }

  if (sdcpn.transitions.length === 0) {
    reasons.push({
      code: "no-transitions",
      message: "The net has no transitions, so there is nothing to simulate.",
    });
  }

  // Enumerating token combinations for a weighted arc over typed tokens is
  // combinatorial (a product of binomials) with a data-dependent trip count,
  // which is exactly what a SIMT execution model handles worst. Weight-1 arcs
  // need no enumeration at all.
  const profileById = new Map(places.map((place) => [place.id, place]));
  for (const transition of sdcpn.transitions) {
    for (const arc of transition.inputArcs) {
      const placeId = getArcEndpointPlaceId(arc);
      const place = placeId === null ? undefined : profileById.get(placeId);
      if (arc.type === "inhibitor" || place === undefined || !place.colored) {
        continue;
      }
      if (arc.weight > MAX_COLORED_INPUT_ARC_WEIGHT) {
        reasons.push({
          code: "colored-input-arc-weight",
          itemId: transition.id,
          message: `Transition \`${transition.name}\` consumes ${arc.weight} typed tokens from one place. The GPU backend supports at most ${MAX_COLORED_INPUT_ARC_WEIGHT} per place: a wider arc means choosing among \`C(n, w)\` combinations, and only the pair case has an unranking that keeps the engine's ordering.`,
        });
      }
      if (
        arc.weight === 2 &&
        place.capacitySource === "declared" &&
        place.declaredCapacity > PAIR_EXACT_TOKEN_LIMIT
      ) {
        reasons.push({
          code: "colored-pair-capacity",
          itemId: transition.id,
          message: `Transition \`${transition.name}\` consumes a pair of typed tokens from \`${place.name}\`, which declares a capacity of ${place.declaredCapacity}. The GPU picks pairs by unranking in f32 arithmetic, which is exact only up to ${PAIR_EXACT_TOKEN_LIMIT} tokens; lower the capacity or run on the CPU.`,
        });
      }
    }
  }

  const bytesPerRun = stateWords * 4;
  if (bytesPerRun > maxBytesPerRun) {
    reasons.push({
      code: "state-too-large",
      message: `One run needs ${bytesPerRun} bytes of GPU state, above the ${maxBytesPerRun}-byte gate the backend schedules within. Lower the declared token capacities.`,
    });
  }

  if (reasons.length > 0) {
    return { eligible: false, reasons };
  }

  return {
    eligible: true,
    profile: {
      places,
      uncolouredOnly: places.every((place) => !place.colored),
      bytesPerRun,
    },
  };
}

/** Human-readable one-liner for why the GPU backend was not used. */
export function formatGpuIneligibility(
  reasons: readonly GpuIneligibilityReason[],
): string {
  if (reasons.length === 1) {
    return reasons[0]!.message;
  }
  return `${reasons.length} reasons: ${reasons.map((reason) => reason.message).join(" ")}`;
}
