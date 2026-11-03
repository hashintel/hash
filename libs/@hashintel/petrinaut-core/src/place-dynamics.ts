import type { ID, Place } from "./types/sdcpn";

/**
 * The differential equations a place composes, in application order: the
 * equation the Dynamics dropdown selects (`differentialEquationId`) first,
 * then the composed terms (`dynamics`). Ignores `dynamicsEnabled`; callers
 * that run the equations check it themselves.
 */
export const getPlaceDynamicsEquationIds = (
  place: Pick<Place, "differentialEquationId" | "dynamics">,
): ID[] => [
  ...(place.differentialEquationId === null
    ? []
    : [place.differentialEquationId]),
  ...(place.dynamics ?? []).map((term) => term.differentialEquationId),
];

/**
 * Whether the place composes `equationId` anywhere in its dynamics: as the
 * selected equation or as a composed term.
 */
export const placeUsesDifferentialEquation = (
  place: Pick<Place, "differentialEquationId" | "dynamics">,
  equationId: ID,
): boolean => getPlaceDynamicsEquationIds(place).includes(equationId);

/**
 * The place without any reference to `equationId`: the selected equation
 * cleared and the composed terms that referenced it removed. Returns the same
 * object when nothing referenced it, and never adds a `dynamics` key.
 */
export const withoutDifferentialEquation = <P extends Place>(
  place: P,
  equationId: ID,
): P => {
  if (!placeUsesDifferentialEquation(place, equationId)) {
    return place;
  }
  const next: P = {
    ...place,
    differentialEquationId:
      place.differentialEquationId === equationId
        ? null
        : place.differentialEquationId,
  };
  if (place.dynamics !== undefined) {
    next.dynamics = place.dynamics.filter(
      (term) => term.differentialEquationId !== equationId,
    );
  }
  return next;
};
