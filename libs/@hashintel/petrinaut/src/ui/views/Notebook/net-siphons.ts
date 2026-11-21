/**
 * Which places the initial state has to seed.
 *
 * The underlying notion is a **siphon**: a set of places S where every
 * transition that produces into S also consumes from S. Nothing in the net can
 * put the first token into such a set, so an empty siphon stays empty forever
 * and every transition drawing on it is dead. A net therefore has to seed
 * every *minimal* siphon to come alive.
 *
 * This unifies the two cases that look different on the canvas:
 *
 * - a source place with no producers at all (its own singleton siphon), and
 * - a resource pool circulating inside a cycle — machines that are borrowed
 *   and returned but never manufactured.
 *
 * Places fed from outside are excluded, including places downstream of a
 * source transition (`∅ → p`), which manufactures tokens from nothing.
 */

import {
  transitionInputPlaceIds,
  transitionOutputPlaceIds,
} from "./notebook-model";

import type { ActiveNetDefinition } from "../../../react/state/active-net-context";

/**
 * A minimal set of places that the initial state must mark. Marking any one
 * member keeps the group from starting empty — the necessary condition this
 * analysis checks — which is why they are shown together.
 */
export type InitialPlaceGroup = {
  /** Stable key derived from the members, safe to use as a React key. */
  key: string;
  /** 1-based number, ordered by the document position of the first member. */
  label: number;
  placeIds: string[];
};

/**
 * Enumerating minimal siphons is exponential in the worst case. The shrink
 * below is polynomial but still cubic in the place count, so very large nets
 * skip the analysis rather than stalling a render (a dense 100-place net
 * computes in roughly 100ms).
 */
const MAX_ANALYSED_PLACES = 100;

type TransitionArcs = { inputs: string[]; outputs: string[] };

/**
 * The largest siphon contained in `candidate`.
 *
 * Any transition that produces into the set without consuming from it breaks
 * the siphon property, so its output places are dropped; repeating that to a
 * fixed point leaves the maximal siphon (possibly empty).
 */
function maximalSiphonWithin(
  candidate: ReadonlySet<string>,
  transitions: TransitionArcs[],
): Set<string> {
  const siphon = new Set(candidate);
  let changed = true;

  while (changed) {
    changed = false;
    for (const { inputs, outputs } of transitions) {
      if (!outputs.some((placeId) => siphon.has(placeId))) {
        continue;
      }
      if (inputs.some((placeId) => siphon.has(placeId))) {
        continue;
      }
      for (const placeId of outputs) {
        if (siphon.delete(placeId)) {
          changed = true;
        }
      }
    }
  }

  return siphon;
}

/**
 * The smallest siphon that still contains `placeId`, found by greedily
 * dropping other places and keeping each reduction that `placeId` survives.
 *
 * The result is minimal: for every remaining member, removing it leaves no
 * siphon containing `placeId` at all.
 */
function minimalSiphonContaining(
  placeId: string,
  allPlaceIds: string[],
  transitions: TransitionArcs[],
): Set<string> | null {
  let siphon = maximalSiphonWithin(new Set(allPlaceIds), transitions);
  if (!siphon.has(placeId)) {
    return null;
  }

  for (const candidate of allPlaceIds) {
    if (candidate === placeId || !siphon.has(candidate)) {
      continue;
    }
    const reduced = new Set(siphon);
    reduced.delete(candidate);
    const shrunk = maximalSiphonWithin(reduced, transitions);
    if (shrunk.has(placeId)) {
      siphon = shrunk;
    }
  }

  return siphon;
}

/**
 * Every minimal siphon in the net — the groups of places the initial state has
 * to mark. Groups that merely contain another group are discarded, so a place
 * downstream of a seeded pool isn't reported as needing seeding itself.
 */
export function findInitialPlaceGroups(
  net: ActiveNetDefinition,
): InitialPlaceGroup[] {
  if (net.places.length === 0 || net.places.length > MAX_ANALYSED_PLACES) {
    return [];
  }

  const allPlaceIds = net.places.map(({ id }) => id);
  const existingPlaceIds = new Set(allPlaceIds);
  // A transition whose input arc names a place that no longer exists can
  // never fire, so it produces nothing: it is excluded outright rather than
  // read as a source (`∅ → p`), which would suppress a genuine seeding
  // requirement on its output places. Stale output ids are merely dropped.
  const transitions: TransitionArcs[] = net.transitions
    .map((transition) => ({
      inputs: transitionInputPlaceIds(transition),
      outputs: transitionOutputPlaceIds(transition).filter((placeId) =>
        existingPlaceIds.has(placeId),
      ),
    }))
    .filter(({ inputs }) =>
      inputs.every((placeId) => existingPlaceIds.has(placeId)),
    );
  const documentOrder = new Map(
    allPlaceIds.map((id, position) => [id, position]),
  );

  const found: Set<string>[] = [];
  const seenKeys = new Set<string>();

  for (const placeId of allPlaceIds) {
    const siphon = minimalSiphonContaining(placeId, allPlaceIds, transitions);
    if (siphon === null || siphon.size === 0) {
      continue;
    }
    const key = [...siphon]
      .sort(
        (left, right) =>
          (documentOrder.get(left) ?? 0) - (documentOrder.get(right) ?? 0),
      )
      .join("+");
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      found.push(siphon);
    }
  }

  // Siphons overlap: the machine pool and "machines plus technicians minus one
  // place" can both be minimal. Reporting every one of them buries the answer,
  // so the smallest groups are kept and any later group sharing a place with an
  // accepted one is dropped — seeding the shared member covers both. Groups
  // that are genuinely independent never overlap, so they all survive.
  const claimed = new Set<string>();
  const representative: Set<string>[] = [];
  for (const siphon of [...found].sort(
    (left, right) => left.size - right.size,
  )) {
    if ([...siphon].some((placeId) => claimed.has(placeId))) {
      continue;
    }
    for (const placeId of siphon) {
      claimed.add(placeId);
    }
    representative.push(siphon);
  }

  return representative
    .map((siphon) =>
      [...siphon].sort(
        (left, right) =>
          (documentOrder.get(left) ?? 0) - (documentOrder.get(right) ?? 0),
      ),
    )
    .sort(
      (left, right) =>
        (documentOrder.get(left[0]!) ?? 0) -
        (documentOrder.get(right[0]!) ?? 0),
    )
    .map((placeIds, position) => ({
      key: placeIds.join("+"),
      label: position + 1,
      placeIds,
    }));
}

/** Lookup from place id to the group it seeds, for badges and ordering. */
export function buildInitialPlaceMembership(
  groups: InitialPlaceGroup[],
): Map<string, InitialPlaceGroup> {
  const membership = new Map<string, InitialPlaceGroup>();
  for (const group of groups) {
    for (const placeId of group.placeIds) {
      membership.set(placeId, group);
    }
  }
  return membership;
}
