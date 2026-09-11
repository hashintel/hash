/**
 * The form state a saved scenario edits through. The scenario form is the
 * one scenario editor, so a scenario stored in any format must open in it:
 * an `adhoc` scenario as its stored definition, a `per_place` scenario
 * converted losslessly (saving stores it as `adhoc`), a `code` scenario with
 * its Variables and Parameters only — the code body stays with the caller,
 * who shows it read-only and writes it back verbatim.
 */

import { adHocNeutralExpression } from "./ad-hoc-scenario";
import {
  classicRunVariables,
  literalExpression,
} from "./materialize-run-state";

import type {
  AdHocNetParameter,
  AdHocPlaceState,
  AdHocScenarioState,
  Color,
  Place,
  Scenario,
} from "../../../../types/sdcpn";
import type { AdHocSynthesisContext } from "./ad-hoc-scenario";

export type AdHocStateFromScenario =
  /** The stored definition, verbatim. */
  | { kind: "adhoc"; state: AdHocScenarioState }
  /** A lossless conversion; saving the form stores the scenario as `adhoc`. */
  | { kind: "per_place"; state: AdHocScenarioState }
  /** Variables and Parameters only (`places: {}`); the caller keeps the code body verbatim. */
  | { kind: "code"; state: AdHocScenarioState; code: string };

type PerPlaceContent = Extract<
  Scenario["initialState"],
  { type: "per_place" }
>["content"];

/**
 * One net-parameter entry per override key the net knows, expression
 * verbatim. A key for a parameter the net no longer has (or every key, when
 * the context carries no net parameters) is dropped: compilation skips such
 * an override, but synthesis rejects it and the form has no row to clear it
 * from.
 */
const netParameterEntries = (
  scenario: Scenario,
  netParameters: readonly { id: string }[],
): AdHocNetParameter[] =>
  Object.entries(scenario.parameterOverrides)
    .filter(([parameterId]) =>
      netParameters.some((parameter) => parameter.id === parameterId),
    )
    .map(([parameterId, expression]) => ({
      parameterId,
      expression,
      optimize: null,
    }));

/**
 * Per-place content as form blocks, walked in the net's place order so a
 * place id the net does not know is dropped. An uncoloured place's
 * expression becomes its count verbatim (empty stays empty: both compile to
 * 0). A coloured place's rows become fixed rows of literal cells in
 * colour-element order; a row shorter than the colour takes the neutral
 * expression for its missing cells, a row wider than it loses the extra
 * values. A coloured place without a colour, and content whose shape does
 * not match the place's kind, is dropped — compilation rejects both today.
 */
const perPlaceStates = (
  content: PerPlaceContent,
  context: { places: Place[]; types: Color[] },
): Record<string, AdHocPlaceState> => {
  const places: Record<string, AdHocPlaceState> = {};
  for (const place of context.places) {
    const value = Object.prototype.hasOwnProperty.call(content, place.id)
      ? content[place.id]
      : undefined;
    if (value === undefined) {
      continue;
    }
    if (typeof value === "string") {
      if (place.colorId !== null) {
        continue;
      }
      places[place.id] = {
        kind: "uncoloured",
        count: { expression: value, optimize: null },
      };
      continue;
    }
    const colour = context.types.find((type) => type.id === place.colorId);
    if (!colour) {
      continue;
    }
    places[place.id] = {
      kind: "coloured",
      variables: [],
      rows: value.map((row) => ({
        kind: "fixed",
        cells: colour.elements.map((element, index) => {
          const cell = row[index];
          return {
            expression:
              cell === undefined
                ? adHocNeutralExpression(element.type)
                : literalExpression(cell),
            optimize: null,
          };
        }),
      })),
      sharedColumns: {},
    };
  }
  return places;
};

/**
 * Scenario parameters become exposed top-level Variables named by their
 * identifier verbatim (schema identifiers are snake_case, so
 * `adHocExposedParameterIdentifier` is the identity) with the default as a
 * literal (`true`/`false` for booleans); parameter overrides become one
 * net-parameter entry per key the net knows, expression verbatim
 * ({@link netParameterEntries}); per-place content converts through
 * {@link perPlaceStates}. Places absent from the content stay absent: in
 * both formats an absent place keeps the canvas marking.
 */
export const adHocStateFromScenario = (
  scenario: Scenario,
  context: AdHocSynthesisContext,
): AdHocStateFromScenario => {
  const { initialState } = scenario;
  if (initialState.type === "adhoc") {
    return { kind: "adhoc", state: initialState.content };
  }
  const variables = classicRunVariables(scenario, {});
  const netParameters = netParameterEntries(scenario, context.netParameters);
  if (initialState.type === "code") {
    return {
      kind: "code",
      state: { variables, netParameters, places: {} },
      code: initialState.content,
    };
  }
  return {
    kind: "per_place",
    state: {
      variables,
      netParameters,
      places: perPlaceStates(initialState.content, context),
    },
  };
};
