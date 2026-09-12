/**
 * The form state a saved scenario edits through. The scenario form is the
 * one scenario editor, so a scenario stored in any format must open in it:
 * an `adhoc` scenario as its stored definition minus the overrides, places
 * and place blocks the net no longer matches, a `per_place` scenario
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
  /** The stored definition, minus the overrides, places and place blocks the net no longer matches. */
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
 * The ids of the parameters the net has. An override for any other id (or
 * every override, when the context carries no net parameters) is dropped on
 * the way into the form: compilation skips such an override, but synthesis
 * rejects it and the form has no row to clear it from.
 */
const knownParameterIds = (context: AdHocSynthesisContext): Set<string> =>
  new Set(context.netParameters.map((parameter) => parameter.id));

/**
 * One net-parameter entry per override key in `knownIds`, expression
 * verbatim.
 */
const netParameterEntries = (
  scenario: Scenario,
  knownIds: ReadonlySet<string>,
): AdHocNetParameter[] =>
  Object.entries(scenario.parameterOverrides)
    .filter(([parameterId]) => knownIds.has(parameterId))
    .map(([parameterId, expression]) => ({
      parameterId,
      expression,
      optimize: null,
    }));

/**
 * Whether a stored place block still fits its place as the net has it: an
 * uncoloured block on a place without a colour, a coloured block on a place
 * whose colour the net knows.
 */
const matchesPlace = (
  place: Place,
  block: AdHocPlaceState,
  types: readonly Color[],
): boolean =>
  block.kind === "uncoloured"
    ? place.colorId === null
    : types.some((type) => type.id === place.colorId);

/**
 * The stored form state minus the entries the net no longer matches: an
 * override for a parameter it lacks, a block for a place it lacks, and a
 * block whose kind no longer fits its place (coloured on a place without a
 * colour the net knows, uncoloured on one that gained a colour). Synthesis
 * rejects the first three and the form would show the last as a count on a
 * coloured place, with nowhere to clear any of them from: its rows and place
 * blocks come from the net. A dropped place reads back as the empty block
 * of the net's kind, so dropping is the reset.
 */
const storedAdHocState = (
  content: AdHocScenarioState,
  context: AdHocSynthesisContext,
): AdHocScenarioState => {
  const parameterIds = knownParameterIds(context);
  const placeById = new Map(context.places.map((place) => [place.id, place]));
  return {
    ...content,
    netParameters: content.netParameters.filter(({ parameterId }) =>
      parameterIds.has(parameterId),
    ),
    places: Object.fromEntries(
      Object.entries(content.places).filter(([placeId, block]) => {
        const place = placeById.get(placeId);
        return place !== undefined && matchesPlace(place, block, context.types);
      }),
    ),
  };
};

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
 * An `adhoc` scenario keeps its stored definition, minus the overrides,
 * places and place blocks the net no longer matches
 * ({@link storedAdHocState}). In the other formats, scenario parameters
 * become exposed top-level Variables named by their identifier verbatim
 * (schema identifiers are snake_case, so `adHocExposedParameterIdentifier`
 * is the identity) with the default as a literal (`true`/`false` for
 * booleans); parameter overrides become one net-parameter entry per key the
 * net knows, expression verbatim ({@link netParameterEntries}); per-place
 * content converts through {@link perPlaceStates}. Places absent from the
 * content stay absent: in both formats an absent place keeps the canvas
 * marking.
 */
export const adHocStateFromScenario = (
  scenario: Scenario,
  context: AdHocSynthesisContext,
): AdHocStateFromScenario => {
  const { initialState } = scenario;
  if (initialState.type === "adhoc") {
    return {
      kind: "adhoc",
      state: storedAdHocState(initialState.content, context),
    };
  }
  const knownIds = knownParameterIds(context);
  const variables = classicRunVariables(scenario, {});
  const netParameters = netParameterEntries(scenario, knownIds);
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
