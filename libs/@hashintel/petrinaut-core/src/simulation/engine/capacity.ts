/**
 * Optional per-place token capacity.
 *
 * A place may declare a maximum number of tokens it will hold. Capacity acts as
 * an *enablement* condition on the transitions that feed the place, mirroring
 * how an input arc's weight gates a transition on the supply side: a transition
 * whose firing would push one of its output places past capacity is not enabled,
 * exactly as a transition without enough input tokens is not enabled. Capacity
 * is therefore never exceeded, and a full place blocks its producers rather than
 * erroring.
 *
 * The condition is evaluated on the **net** change one firing makes to a place,
 * so a transition that consumes from and produces into the same place (a self
 * loop) is not blocked by a place that is already full — its net effect may be
 * zero or negative.
 *
 * Constraints are precomputed per transition at build time and only cover places
 * that both declare a capacity and gain tokens on balance. A net without
 * capacities produces empty constraint lists, so the hot path pays nothing.
 */
import { getArcEndpointPlaceId } from "../../arc-endpoints";

import type { ID, Place, Transition } from "../../types/sdcpn";

/**
 * Capacity value standing for "no limit".
 *
 * Capacities live in a `Uint32Array` for dense hot-path access, so the absence
 * of a limit is encoded as the maximum u32 rather than `null`.
 */
export const PLACE_CAPACITY_UNBOUNDED = 0xffffffff;

/**
 * A single place a transition must leave within capacity in order to fire.
 */
export type TransitionCapacityConstraint = {
  placeIndex: number;
  placeId: ID;
  /** Net tokens this place gains from one firing. Always greater than zero. */
  delta: number;
  /** The place's declared maximum token count. */
  capacity: number;
};

/**
 * Normalizes a place's declared capacity to its dense runtime representation.
 *
 * Anything other than a non-negative integer is treated as unbounded; the
 * authoring layer is responsible for rejecting bad input with a diagnostic
 * rather than having the engine guess.
 */
export function normalizePlaceCapacity(capacity: Place["capacity"]): number {
  if (capacity === undefined || capacity === null) {
    return PLACE_CAPACITY_UNBOUNDED;
  }

  return Number.isInteger(capacity) && capacity >= 0
    ? capacity
    : PLACE_CAPACITY_UNBOUNDED;
}

/**
 * Builds the dense per-place capacity table indexed by frame place index.
 */
export function createPlaceCapacities(
  places: readonly Pick<Place, "capacity">[],
): Uint32Array {
  const capacities = new Uint32Array(places.length);
  for (let index = 0; index < places.length; index++) {
    capacities[index] = normalizePlaceCapacity(places[index]!.capacity);
  }
  return capacities;
}

/** Whether any place in the table declares a limit. */
export function hasAnyPlaceCapacity(capacities: Uint32Array): boolean {
  return capacities.some((capacity) => capacity !== PLACE_CAPACITY_UNBOUNDED);
}

/**
 * Precomputes the capacity constraints one transition must satisfy to fire.
 *
 * Output arc weights are summed per place and offset by the standard input arc
 * weights on the same place, giving the net change per firing. Read and
 * inhibitor arcs consume nothing and so do not offset anything. Places that end
 * up with a non-positive net change, or that declare no capacity, cannot be
 * pushed over their limit and are omitted.
 */
export function computeTransitionCapacityConstraints({
  transition,
  placeIndexById,
  placeCapacities,
}: {
  transition: Pick<Transition, "id" | "inputArcs" | "outputArcs">;
  placeIndexById: ReadonlyMap<ID, number>;
  placeCapacities: Uint32Array;
}): TransitionCapacityConstraint[] {
  const netDeltaByPlaceId = new Map<ID, number>();

  for (const arc of transition.outputArcs) {
    const placeId = getArcEndpointPlaceId(arc);
    if (!placeId) {
      continue;
    }
    netDeltaByPlaceId.set(
      placeId,
      (netDeltaByPlaceId.get(placeId) ?? 0) + arc.weight,
    );
  }

  for (const arc of transition.inputArcs) {
    if (arc.type !== "standard") {
      continue;
    }
    const placeId = getArcEndpointPlaceId(arc);
    if (!placeId || !netDeltaByPlaceId.has(placeId)) {
      continue;
    }
    netDeltaByPlaceId.set(
      placeId,
      netDeltaByPlaceId.get(placeId)! - arc.weight,
    );
  }

  const constraints: TransitionCapacityConstraint[] = [];
  for (const [placeId, delta] of netDeltaByPlaceId) {
    if (delta <= 0) {
      continue;
    }

    const placeIndex = placeIndexById.get(placeId);
    if (placeIndex === undefined) {
      continue;
    }

    const capacity = placeCapacities[placeIndex] ?? PLACE_CAPACITY_UNBOUNDED;
    if (capacity === PLACE_CAPACITY_UNBOUNDED) {
      continue;
    }

    constraints.push({ placeIndex, placeId, delta, capacity });
  }

  return constraints;
}

/**
 * Whether every constrained output place can absorb one firing.
 *
 * `pendingCounts` carries tokens that earlier transitions in the same frame have
 * already produced but that have not been written into `placeCounts` yet.
 * Without it, several transitions feeding one place in a single frame could
 * each individually fit and collectively overflow.
 */
export function hasCapacityHeadroom(
  constraints: readonly TransitionCapacityConstraint[],
  placeCounts: Uint32Array,
  pendingCounts: Uint32Array | null,
): boolean {
  for (const constraint of constraints) {
    const pending = pendingCounts?.[constraint.placeIndex] ?? 0;
    const projected =
      (placeCounts[constraint.placeIndex] ?? 0) + pending + constraint.delta;

    if (projected > constraint.capacity) {
      return false;
    }
  }

  return true;
}
