import { synthesizeAdHocScenario } from "@hashintel/petrinaut-core";

import type {
  AdHocSynthesisContext,
  AdHocValueTarget,
  Scenario,
} from "@hashintel/petrinaut-core";

export const scenarioExpressions = (
  scenario: Scenario,
  context: AdHocSynthesisContext,
) => {
  const synthesized =
    scenario.initialState.type === "adhoc"
      ? synthesizeAdHocScenario(scenario.initialState.content, context)
      : null;
  const definition = synthesized?.ok ? synthesized.scenario : scenario;

  return (target: AdHocValueTarget): string | undefined => {
    if (target.kind === "netParameter") {
      const parameter = context.netParameters.find(
        (candidate) => candidate.id === target.parameterId,
      );
      const expression =
        scenario.initialState.type === "adhoc"
          ? scenario.initialState.content.netParameters.find(
              (entry) => entry.parameterId === target.parameterId,
            )?.expression
          : scenario.parameterOverrides[target.parameterId];
      return expression?.trim() ? expression : parameter?.defaultValue;
    }
    if (target.kind === "variable" || !target.placeId) {
      return undefined;
    }
    if (scenario.initialState.type === "adhoc") {
      const place = scenario.initialState.content.places[target.placeId];
      if (place?.kind === "uncoloured") {
        return place.count.expression;
      }
      if (place?.kind === "coloured" && target.kind === "cell") {
        const colourId = context.places.find(
          (candidate) => candidate.id === target.placeId,
        )?.colorId;
        const field = context.types.find((colour) => colour.id === colourId)
          ?.elements[target.column]?.name;
        const shared = field ? place.sharedColumns[field] : undefined;
        if (shared) {
          return shared.expression;
        }
        const row =
          place.rows.length === 1
            ? place.rows[0]
            : place.rows
                  .slice(0, target.row + 1)
                  .every((candidate) => candidate.kind === "fixed")
              ? place.rows[target.row]
              : undefined;
        if (row) {
          return row.cells[target.column]?.expression;
        }
      }
    }
    if (definition.initialState.type === "code") {
      return definition.initialState.content;
    }
    if (definition.initialState.type !== "per_place") {
      return undefined;
    }
    const expression = definition.initialState.content[target.placeId];
    return typeof expression === "string" ? expression : undefined;
  };
};
