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
import { PLACE_CAPACITY_UNBOUNDED } from "../simulation/engine/capacity";

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
    | "colored-place-without-capacity"
    | "unsupported-attribute-type"
    | "colored-input-arc-weight"
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
  places: {
    id: string;
    name: string;
    /** Maximum tokens; equals 0 for uncoloured places, which store only a count. */
    capacity: number;
    /** Names of `real` attributes, in declaration order. These are integrated. */
    realFields: string[];
    /** Names of `integer`/`boolean` attributes, carried but not integrated. */
    discreteFields: string[];
    colored: boolean;
  }[];
  /** Whether every place is uncoloured, so per-run state is just counts. */
  uncolouredOnly: boolean;
  /** Per-run state size in bytes, which bounds how many runs fit in a buffer. */
  bytesPerRun: number;
};

/**
 * Attribute types the GPU backend can hold.
 *
 * `string` is a 64-bit pool id and `uuid` is 128-bit; WGSL integers are 32-bit,
 * so neither can be represented. See `emit-wgsl.ts`.
 */
const SUPPORTED_ATTRIBUTE_TYPES = new Set(["real", "integer", "boolean"]);

/** Storage words per token: one f32 per real field, one u32 per discrete field. */
function wordsPerToken(realCount: number, discreteCount: number): number {
  return realCount + discreteCount;
}

/**
 * Decides whether `sdcpn` can run on the GPU backend.
 *
 * `maxBytesPerRun` guards against a net whose bounded state is technically
 * finite but too large to hold for a useful number of runs — a place with a
 * capacity of ten million is expressible but not schedulable.
 */
export function assessGpuEligibility(
  sdcpn: SDCPN,
  { maxBytesPerRun = 4096 }: { maxBytesPerRun?: number } = {},
): GpuEligibility {
  const reasons: GpuIneligibilityReason[] = [];
  const typeById = new Map(sdcpn.types.map((type) => [type.id, type]));
  const places: GpuNetProfile["places"] = [];

  // Per-run state always carries: one u32 count per place, one u32 elapsed-frame
  // counter and one u32 firing count per transition, plus an RNG word and status.
  let stateWords = sdcpn.places.length + sdcpn.transitions.length * 2 + 2;

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
      const capacity = place.capacity;
      if (capacity === undefined || capacity === null) {
        reasons.push({
          code: "colored-place-without-capacity",
          itemId: place.id,
          message: `Place \`${place.name}\` holds typed tokens but has no token capacity. The GPU backend needs a fixed upper bound to size its buffers — set a capacity on this place.`,
        });
        continue;
      }

      stateWords +=
        capacity * wordsPerToken(realFields.length, discreteFields.length);
      places.push({
        id: place.id,
        name: place.name,
        capacity,
        realFields,
        discreteFields,
        colored: true,
      });
    } else {
      places.push({
        id: place.id,
        name: place.name,
        capacity: 0,
        realFields: [],
        discreteFields: [],
        colored: false,
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
  const coloredPlaceIds = new Set(
    places.filter((place) => place.colored).map((place) => place.id),
  );
  for (const transition of sdcpn.transitions) {
    for (const arc of transition.inputArcs) {
      const placeId = getArcEndpointPlaceId(arc);
      if (
        arc.type !== "inhibitor" &&
        arc.weight > MAX_COLORED_INPUT_ARC_WEIGHT &&
        placeId !== null &&
        coloredPlaceIds.has(placeId)
      ) {
        reasons.push({
          code: "colored-input-arc-weight",
          itemId: transition.id,
          message: `Transition \`${transition.name}\` consumes ${arc.weight} typed tokens from one place. The GPU backend supports at most ${MAX_COLORED_INPUT_ARC_WEIGHT} per place: a wider arc means choosing among \`C(n, w)\` combinations, and only the pair case has an unranking that keeps the engine's ordering.`,
        });
      }
    }
  }

  const bytesPerRun = stateWords * 4;
  if (bytesPerRun > maxBytesPerRun) {
    reasons.push({
      code: "state-too-large",
      message: `One run needs ${bytesPerRun} bytes of GPU state, above the ${maxBytesPerRun}-byte limit. Lower the token capacities to fit more runs on the device.`,
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

export { PLACE_CAPACITY_UNBOUNDED };
