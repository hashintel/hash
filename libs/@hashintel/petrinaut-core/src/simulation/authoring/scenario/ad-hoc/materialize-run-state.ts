/**
 * A classic scenario shown through the ad-hoc form: Simulation Settings
 * renders every selected scenario in the form's run mode, and a scenario
 * that was not authored ad-hoc has no `AdHocScenarioState` to show — so one
 * is materialized from what the run will actually start with. The compiled
 * initial marking (`compileScenario`) becomes literal read-only token rows,
 * the scenario's parameter overrides become read-only parameter entries,
 * and its scenario parameters become the editable exposed Variables.
 *
 * Classic scenario parameter identifiers are used verbatim as the Variable
 * names, so value pushes never route through the ad-hoc snake_case name
 * mapping — a camelCase identifier must round-trip unchanged.
 */

import type { InitialMarking } from "../../../api";
import type {
  AdHocPlaceState,
  AdHocScenarioState,
  AdHocVariable,
  Color,
  Place,
  Scenario,
} from "../../../../types/sdcpn";

/** Places longer than this render only their first rows in the preview. */
export const CLASSIC_RUN_ROW_CAP = 100;

export type MaterializeContext = {
  places: Place[];
  types: Color[];
};

export type TruncatedPlace = {
  placeName: string;
  shown: number;
  total: number;
};

function literalExpression(value: number | boolean | bigint | string): string {
  switch (typeof value) {
    case "number":
      return String(value);
    case "bigint":
      return value.toString();
    case "boolean":
      return value ? "true" : "false";
    default:
      return JSON.stringify(value);
  }
}

/**
 * Converts a compiled initial marking into read-only ad-hoc place states:
 * one fixed row per token, cells ordered by the colour's elements, counts
 * as literals. Rows beyond {@link CLASSIC_RUN_ROW_CAP} are dropped and the
 * cut is reported, so the caller can say what the preview omits.
 */
export function initialMarkingToAdHocPlaces(
  marking: InitialMarking,
  context: MaterializeContext,
  rowCap: number = CLASSIC_RUN_ROW_CAP,
): { places: Record<string, AdHocPlaceState>; truncated: TruncatedPlace[] } {
  const places: Record<string, AdHocPlaceState> = {};
  const truncated: TruncatedPlace[] = [];
  for (const place of context.places) {
    const entry = Object.prototype.hasOwnProperty.call(marking, place.id)
      ? marking[place.id]
      : undefined;
    if (entry === undefined) {
      continue;
    }
    if (typeof entry === "number") {
      places[place.id] = {
        kind: "uncoloured",
        count: { expression: literalExpression(entry), optimize: null },
      };
      continue;
    }
    const colour = context.types.find((type) => type.id === place.colorId);
    if (!colour) {
      continue;
    }
    const shown = entry.slice(0, rowCap);
    if (entry.length > shown.length) {
      truncated.push({
        placeName: place.name,
        shown: shown.length,
        total: entry.length,
      });
    }
    places[place.id] = {
      kind: "coloured",
      variables: [],
      rows: shown.map((token) => ({
        kind: "fixed",
        cells: colour.elements.map((element) => ({
          expression: literalExpression(
            token[element.name] ?? (element.type === "boolean" ? false : 0),
          ),
          optimize: null,
        })),
      })),
      sharedColumns: {},
    };
  }
  return { places, truncated };
}

const variableType = (
  type: Scenario["scenarioParameters"][number]["type"],
): AdHocVariable["type"] => (type === "ratio" ? "real" : type);

/**
 * The editable half of the pseudo-state: one exposed Variable per scenario
 * parameter, named by the parameter's identifier verbatim, seeded from this
 * run's override where one exists (engine values are numeric strings;
 * booleans arrive as "1"/"0" and become literals).
 */
export function classicRunVariables(
  scenario: Scenario,
  overrides: Readonly<Record<string, string>>,
): AdHocVariable[] {
  return scenario.scenarioParameters
    .filter((parameter) => parameter.identifier.trim() !== "")
    .map((parameter) => {
      const override = Object.prototype.hasOwnProperty.call(
        overrides,
        parameter.identifier,
      )
        ? overrides[parameter.identifier]
        : undefined;
      const numeric = override ?? String(parameter.default);
      const expression =
        parameter.type === "boolean"
          ? Number(numeric) === 0
            ? "false"
            : "true"
          : numeric;
      return {
        name: parameter.identifier,
        type: variableType(parameter.type),
        expression,
        exposed: true,
        optimize: null,
      };
    });
}

/**
 * The full pseudo-state the form renders for a classic scenario: editable
 * scenario parameters, read-only parameter overrides, and the materialized
 * initial state.
 */
export function classicScenarioRunState(
  scenario: Scenario,
  marking: InitialMarking,
  context: MaterializeContext,
  overrides: Readonly<Record<string, string>>,
): { state: AdHocScenarioState; truncated: TruncatedPlace[] } {
  const { places, truncated } = initialMarkingToAdHocPlaces(marking, context);
  return {
    state: {
      variables: classicRunVariables(scenario, overrides),
      netParameters: Object.entries(scenario.parameterOverrides).map(
        ([parameterId, expression]) => ({
          parameterId,
          expression,
          optimize: null,
        }),
      ),
      places,
    },
    truncated,
  };
}

/**
 * The run values an edited pseudo-state produces, keyed by the classic
 * identifiers. Only literal values push (`12`, `0.5`, `true`) — an
 * expression mid-edit produces nothing, and the previous value stands until
 * the text is a literal again.
 */
export function classicRunParameterValues(
  state: AdHocScenarioState,
  scenario: Scenario,
): { identifier: string; value: string }[] {
  const values: { identifier: string; value: string }[] = [];
  for (const parameter of scenario.scenarioParameters) {
    const variable = state.variables.find(
      (candidate) => candidate.name === parameter.identifier,
    );
    if (!variable) {
      continue;
    }
    const text = variable.expression.trim();
    if (parameter.type === "boolean") {
      if (text === "true" || text === "false") {
        values.push({
          identifier: parameter.identifier,
          value: text === "true" ? "1" : "0",
        });
      }
      continue;
    }
    if (text !== "" && Number.isFinite(Number(text))) {
      values.push({ identifier: parameter.identifier, value: text });
    }
  }
  return values;
}
