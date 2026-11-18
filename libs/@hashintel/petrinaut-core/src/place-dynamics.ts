import type { ID, Place } from "./types/sdcpn";

/**
 * The differential equations a place composes, in application order.
 * Ignores `dynamicsEnabled`; callers that run the equations check it
 * themselves.
 */
export const getPlaceDynamicsEquationIds = (
  place: Pick<Place, "dynamics">,
): ID[] => (place.dynamics ?? []).map((term) => term.differentialEquationId);

/** Whether the place composes `equationId` anywhere in its dynamics. */
export const placeUsesDifferentialEquation = (
  place: Pick<Place, "dynamics">,
  equationId: ID,
): boolean => getPlaceDynamicsEquationIds(place).includes(equationId);

/**
 * The place without the terms that referenced any of `equationIds`. Returns
 * the same object when nothing referenced them, and never adds a `dynamics`
 * key.
 */
export const withoutDifferentialEquations = <P extends Place>(
  place: P,
  equationIds: ReadonlySet<ID>,
): P => {
  const kept = place.dynamics?.filter(
    (term) => !equationIds.has(term.differentialEquationId),
  );
  return kept === undefined || kept.length === place.dynamics?.length
    ? place
    : { ...place, dynamics: kept };
};

/**
 * The place's `dynamics` with every equation id passed through `mapId`, to
 * spread into a copy of the place. Empty for a place without the key, so the
 * copy never gains one.
 */
export const remapPlaceDynamics = (
  place: Pick<Place, "dynamics">,
  mapId: (equationId: ID) => ID,
): Pick<Place, "dynamics"> =>
  place.dynamics === undefined
    ? {}
    : {
        dynamics: place.dynamics.map((term) => ({
          differentialEquationId: mapId(term.differentialEquationId),
        })),
      };
