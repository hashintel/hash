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
 * The place without the terms that referenced `equationId`. Returns the same
 * object when nothing referenced it, and never adds a `dynamics` key.
 */
export const withoutDifferentialEquation = <P extends Place>(
  place: P,
  equationId: ID,
): P =>
  placeUsesDifferentialEquation(place, equationId)
    ? {
        ...place,
        dynamics: (place.dynamics ?? []).filter(
          (term) => term.differentialEquationId !== equationId,
        ),
      }
    : place;
