import { migrateWholePlaceDynamicsCode } from "./migrate-legacy-dynamics/whole-place-code";

/**
 * A place as written before equations composed: at most one equation,
 * linked through `differentialEquationId`.
 */
export type LegacyDynamicsPlace = {
  differentialEquationId?: string | null;
  dynamics?: { differentialEquationId: string }[];
};

/**
 * An equation as written before equations had an arity: no `arity`, and
 * code that mapped over every token of the place.
 */
export type LegacyDifferentialEquation = {
  arity?: number;
  code: string;
};

/** The places and equations of a net or of one of its subnets. */
export type LegacyDynamicsItems = {
  places: object[];
  differentialEquations?: LegacyDifferentialEquation[];
};

export type LegacyDynamicsNet = LegacyDynamicsItems & {
  subnets?: LegacyDynamicsItems[];
};

/**
 * A place's one legacy equation link becomes the first term of `dynamics`,
 * and the key is dropped so the place matches the current shape.
 */
export const migratePlaceDynamicsLink = <P extends object>(place: P): P => {
  if (!("differentialEquationId" in place)) {
    return place;
  }
  const { differentialEquationId, ...rest } = place as P & LegacyDynamicsPlace;
  if (differentialEquationId === undefined || differentialEquationId === null) {
    return rest as P;
  }
  return {
    ...rest,
    dynamics: [{ differentialEquationId }, ...(rest.dynamics ?? [])],
  } as P;
};

/**
 * An equation without an arity couples one token, and whole-place code it
 * carries is rewritten to the one-token form where that is exact.
 */
export const migrateDifferentialEquation = <
  E extends LegacyDifferentialEquation,
>(
  equation: E,
): E => {
  const arity = equation.arity ?? 1;
  const code =
    arity === 1
      ? (migrateWholePlaceDynamicsCode(equation.code) ?? equation.code)
      : equation.code;
  return arity === equation.arity && code === equation.code
    ? equation
    : { ...equation, arity, code };
};

const migrateNetItems = <Items extends LegacyDynamicsItems>(
  items: Items,
): Items => ({
  ...items,
  places: items.places.map(migratePlaceDynamicsLink),
  ...(items.differentialEquations === undefined
    ? {}
    : {
        differentialEquations: items.differentialEquations.map(
          migrateDifferentialEquation,
        ),
      }),
});

/**
 * Brings a net written before equations composed with an arity to the
 * current shape: legacy place links become `dynamics` terms, equations
 * without an arity get arity 1, and whole-place `tokens.map` bodies become
 * one-token bodies. Idempotent on a current net.
 */
export const migrateLegacyDynamics = <Net extends LegacyDynamicsNet>(
  net: Net,
): Net => ({
  ...migrateNetItems(net),
  ...(net.subnets === undefined
    ? {}
    : { subnets: net.subnets.map(migrateNetItems) }),
});
