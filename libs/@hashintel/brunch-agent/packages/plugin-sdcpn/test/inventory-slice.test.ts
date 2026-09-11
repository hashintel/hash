import { readFileSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";
import { describe, expect, test } from "vitest";

import {
  createJsonDocHandle,
  createPetrinaut,
} from "@hashintel/petrinaut-core";
import { checkDefinition } from "@hashintel/petrinaut-core/diagnostics";

import {
  mutatePetrinetInputSchema,
  type MutatePetrinetOperation,
} from "../src/mutate-petrinet";

/**
 * The frozen Inventory-derived slice: the smallest code-bearing region the
 * batched carrier must express before the full worked model depends on it.
 * The fixture is the model-facing input as the model would emit it, so the
 * schema, canonical application and compiler are all exercised on one file.
 */
const fixture = JSON.parse(
  readFileSync(
    join(import.meta.dirname, "fixtures/inventory-slice/batch.json"),
    "utf8",
  ),
) as unknown;

const applyOperation = (
  mutations: ReturnType<typeof createPetrinaut>["mutations"],
  operation: MutatePetrinetOperation,
) => {
  switch (operation.type) {
    case "addType":
      return mutations.addType(operation.input);
    case "addParameter":
      return mutations.addParameter(operation.input);
    case "addDifferentialEquation":
      return mutations.addDifferentialEquation(operation.input);
    case "updateDifferentialEquation":
      return mutations.updateDifferentialEquation(operation.input);
    case "addPlace":
      return mutations.addPlace(operation.input);
    case "addTransition":
      return mutations.addTransition(operation.input);
    case "addArc":
      return mutations.addArc(operation.input);
    case "removePlace":
      return mutations.removePlace(operation.input);
    case "removeTransition":
      return mutations.removeTransition(operation.input);
    case "removeArc":
      return mutations.removeArc(operation.input);
    case "updatePlace":
      return mutations.updatePlace(operation.input);
    case "updateTransition":
      return mutations.updateTransition(operation.input);
    case "updateArcWeight":
      return mutations.updateArcWeight(operation.input);
    case "updateArcType":
      return mutations.updateArcType(operation.input);
    case "updateType":
      return mutations.updateType(operation.input);
    case "addTypeElement":
      return mutations.addTypeElement(operation.input);
    case "updateTypeElement":
      return mutations.updateTypeElement(operation.input);
    case "updateParameter":
      return mutations.updateParameter(operation.input);
    case "removeType":
      return mutations.removeType(operation.input);
    case "removeTypeElement":
      return mutations.removeTypeElement(operation.input);
    case "removeParameter":
      return mutations.removeParameter(operation.input);
    case "removeDifferentialEquation":
      return mutations.removeDifferentialEquation(operation.input);
  }
};

describe("frozen Inventory-derived slice on the batched carrier", () => {
  const batch = mutatePetrinetInputSchema.parse(fixture);

  test("names one coloured type, parameters, places, arcs, a stochastic transition and one differential equation", () => {
    const kinds = new Map<string, number>();
    for (const operation of batch.operations)
      kinds.set(operation.type, (kinds.get(operation.type) ?? 0) + 1);
    expect(kinds.get("addType")).toBe(1);
    expect(kinds.get("addParameter")).toBe(3);
    expect(kinds.get("addDifferentialEquation")).toBe(1);
    expect(kinds.get("addPlace")).toBe(2);
    expect(kinds.get("addTransition")).toBe(2);
    expect(kinds.get("addArc")).toBe(4);
    const stochastic = batch.operations.filter(
      (operation) =>
        operation.type === "addTransition" &&
        operation.input.lambdaType === "stochastic",
    );
    expect(stochastic).toHaveLength(1);
  });

  test("applies in order through the canonical mutations and compiles clean", () => {
    const instance = createPetrinaut({
      document: createJsonDocHandle({
        initial: {
          types: [],
          places: [],
          transitions: [],
          differentialEquations: [],
          parameters: [],
        },
        capabilities: { disabledExtensions: [] },
      }),
    });
    for (const operation of batch.operations)
      applyOperation(instance.mutations, operation);
    const definition = instance.definition.get();
    instance.dispose();

    expect(definition.places.map((place) => place.name)).toEqual([
      "OnOrder",
      "OnHand",
    ]);
    expect(
      definition.transitions.map((transition) => [
        transition.id,
        transition.inputArcs.length,
        transition.outputArcs.length,
      ]),
    ).toEqual([
      ["receive_delivery", 1, 1],
      ["place_order", 1, 1],
    ]);

    const result = checkDefinition(definition);
    const errors = result.itemDiagnostics.flatMap((item) =>
      item.diagnostics
        .filter((diag) => diag.category === ts.DiagnosticCategory.Error)
        .map(
          (diag) =>
            `${item.itemType} ${item.itemId}: ${ts.flattenDiagnosticMessageText(
              diag.messageText,
              " ",
            )}`,
        ),
    );
    expect(errors).toEqual([]);
    expect(result.isValid).toBe(true);
  });

  test("a dependency change in a later batch dirties the untouched slice", () => {
    const instance = createPetrinaut({
      document: createJsonDocHandle({
        initial: {
          types: [],
          places: [],
          transitions: [],
          differentialEquations: [],
          parameters: [],
        },
        capabilities: { disabledExtensions: [] },
      }),
    });
    for (const operation of batch.operations)
      applyOperation(instance.mutations, operation);
    instance.mutations.updateParameter({
      parameterId: "daily_demand",
      update: { variableName: "picks_per_day" },
    });
    const result = checkDefinition(instance.definition.get());
    instance.dispose();
    expect(result.isValid).toBe(false);
    expect(
      result.itemDiagnostics.map((item) => [item.itemType, item.itemId]),
    ).toEqual([["differential-equation", "on_hand_drawdown"]]);
  });
});
