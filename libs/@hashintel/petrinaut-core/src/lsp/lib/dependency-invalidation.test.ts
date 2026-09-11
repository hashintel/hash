import ts from "typescript";
import { describe, expect, it } from "vitest";

import { checkDefinition } from "../../diagnostics";
import { createJsonDocHandle } from "../../handle";
import { createPetrinaut } from "../../instance";
import { createSDCPN } from "./helper/create-sdcpn";

import type { SDCPN } from "../../types/sdcpn";

/**
 * Code that never changes can still stop compiling when something it depends
 * on changes: a token element, a parameter name, a place name an arc keys
 * input by, or the arc itself. Each case here applies one canonical mutation
 * that does not touch any code and asserts the compiler reports it.
 */

const errorsOf = (sdcpn: SDCPN) =>
  checkDefinition(sdcpn).itemDiagnostics.flatMap((item) =>
    item.diagnostics
      .filter((diag) => diag.category === ts.DiagnosticCategory.Error)
      .map((diag) => ({
        code: diag.code,
        message: ts.flattenDiagnosticMessageText(diag.messageText, "\n"),
      })),
  );

const cleanNet = () =>
  createSDCPN({
    types: [
      {
        id: "item",
        name: "Item",
        elements: [{ elementId: "level", name: "level", type: "real" }],
      },
    ],
    parameters: [
      {
        id: "decay",
        name: "Decay rate",
        variableName: "decay_rate",
        type: "real",
        defaultValue: "0.02",
      },
    ],
    differentialEquations: [
      {
        id: "decay-dynamics",
        colorId: "item",
        code: `export default Dynamics((tokens, parameters) =>
          tokens.map(({ level }) => ({ level: -parameters.decay_rate * level })),
        );`,
      },
    ],
    places: [
      {
        id: "store",
        name: "Store",
        colorId: "item",
        dynamicsEnabled: true,
        differentialEquationId: "decay-dynamics",
      },
      { id: "shipped", name: "Shipped", colorId: "item" },
    ],
    transitions: [
      {
        id: "ship",
        name: "Ship",
        lambdaType: "predicate",
        inputArcs: [{ placeId: "store", weight: 1, type: "standard" }],
        outputArcs: [{ placeId: "shipped", weight: 1 }],
        lambdaCode: `export default Lambda((input) => input.Store[0].level > 0);`,
        transitionKernelCode: `export default TransitionKernel((input) => ({
          Shipped: [{ level: input.Store[0].level }],
        }));`,
      },
    ],
  });

const mutated = (
  change: (mutations: ReturnType<typeof createPetrinaut>["mutations"]) => void,
) => {
  const instance = createPetrinaut({
    document: createJsonDocHandle({
      initial: cleanNet(),
      capabilities: { disabledExtensions: [] },
    }),
  });
  change(instance.mutations);
  const definition = instance.definition.get();
  instance.dispose();
  return definition;
};

describe("dependency changes invalidate untouched code", () => {
  it("starts compiler-clean", () => {
    expect(errorsOf(cleanNet())).toEqual([]);
  });

  it("renaming a token element dirties dynamics and transition code that read it", () => {
    const errors = errorsOf(
      mutated((mutations) =>
        mutations.updateTypeElement({
          typeId: "item",
          elementId: "level",
          update: { name: "quantity" },
        }),
      ),
    );
    expect(errors.length).toBeGreaterThanOrEqual(2);
    expect(errors.every((error) => /level/u.test(error.message))).toBe(true);
  });

  it("renaming a parameter variable dirties dynamics that read it", () => {
    const errors = errorsOf(
      mutated((mutations) =>
        mutations.updateParameter({
          parameterId: "decay",
          update: { variableName: "pick_rate" },
        }),
      ),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]?.code).toBe(2339);
    expect(errors[0]?.message).toContain("decay_rate");
  });

  it("renaming a place dirties transition code keyed by its name", () => {
    const errors = errorsOf(
      mutated((mutations) =>
        mutations.updatePlace({
          placeId: "store",
          update: { name: "Warehouse" },
        }),
      ),
    );
    expect(errors.length).toBeGreaterThanOrEqual(2);
    expect(errors.every((error) => /Store/u.test(error.message))).toBe(true);
  });

  it("removing an input arc dirties transition code that read its tokens", () => {
    const errors = errorsOf(
      mutated((mutations) =>
        mutations.removeArc({
          transitionId: "ship",
          arcDirection: "input",
          placeId: "store",
        }),
      ),
    );
    // Without the arc the input type is `Record<string, never>`, so the read
    // of `input.Store` yields `never` and the error lands on `.level`.
    expect(errors.length).toBeGreaterThanOrEqual(2);
    expect(errors.every((error) => /Store|never/u.test(error.message))).toBe(
      true,
    );
  });

  it("turning an input arc into an inhibitor removes its tokens from the input type", () => {
    const errors = errorsOf(
      mutated((mutations) =>
        mutations.updateArcType({
          transitionId: "ship",
          placeId: "store",
          type: "inhibitor",
        }),
      ),
    );
    expect(errors.length).toBeGreaterThanOrEqual(2);
    expect(errors.every((error) => /Store|never/u.test(error.message))).toBe(
      true,
    );
  });

  it("re-colouring the dynamics-bearing place to a type without the element dirties the transition, not the dynamics", () => {
    const errors = errorsOf(
      mutated((mutations) => {
        mutations.addType({
          id: "crate",
          name: "Crate",
          iconSlug: "circle",
          displayColor: "#00AA00",
          elements: [{ elementId: "count", name: "count", type: "integer" }],
        });
        mutations.updatePlace({
          placeId: "store",
          update: {
            colorId: "crate",
            dynamicsEnabled: false,
            differentialEquationId: null,
          },
        });
      }),
    );
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors.every((error) => /level/u.test(error.message))).toBe(true);
  });
});

/**
 * Removing net-level state that nothing reads leaves the model clean. Removing
 * state that code or a place still refers to must either cascade completely in
 * the canonical definition or surface as a compiler error on the code that
 * depended on it; the two cases are separated so hidden damage cannot pass as
 * a clean unused removal.
 */
describe("removing net-level state", () => {
  const withUnused = (
    mutations: ReturnType<typeof createPetrinaut>["mutations"],
  ) => {
    mutations.addType({
      id: "pallet",
      name: "Pallet",
      iconSlug: "square",
      displayColor: "#888888",
      elements: [{ elementId: "slots", name: "slots", type: "integer" }],
    });
    mutations.addParameter({
      id: "unused-rate",
      name: "Unused rate",
      variableName: "unused_rate",
      type: "real",
      defaultValue: "1",
    });
    mutations.addDifferentialEquation({
      id: "idle-dynamics",
      name: "Idle",
      colorId: "pallet",
      code: `export default Dynamics((tokens) => tokens.map(() => ({ slots: 0 })));`,
    });
  };

  it("unused type, element, parameter and equation removals stay compiler-clean", () => {
    const definition = mutated((mutations) => {
      withUnused(mutations);
      mutations.removeTypeElement({ typeId: "pallet", elementId: "slots" });
      mutations.removeDifferentialEquation({ equationId: "idle-dynamics" });
      mutations.removeParameter({ parameterId: "unused-rate" });
      mutations.removeType({ typeId: "pallet" });
    });
    expect(definition.types.map(({ id }) => id)).toEqual(["item"]);
    expect(definition.parameters.map(({ id }) => id)).toEqual(["decay"]);
    expect(definition.differentialEquations.map(({ id }) => id)).toEqual([
      "decay-dynamics",
    ]);
    expect(errorsOf(definition)).toEqual([]);
  });

  it("removing a referenced parameter dirties the dynamics that read it", () => {
    const errors = errorsOf(
      mutated((mutations) =>
        mutations.removeParameter({ parameterId: "decay" }),
      ),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]?.code).toBe(2339);
    expect(errors[0]?.message).toContain("decay_rate");
  });

  it("removing a referenced token element dirties every reader of that element", () => {
    const errors = errorsOf(
      mutated((mutations) =>
        mutations.removeTypeElement({ typeId: "item", elementId: "level" }),
      ),
    );
    // Dynamics, lambda and kernel all read `level`; the kernel's output row
    // additionally fails as `never` once the type has no elements.
    expect(errors.length).toBeGreaterThanOrEqual(3);
    expect(errors.every((error) => /level|never/u.test(error.message))).toBe(
      true,
    );
    expect(
      errors.filter((error) => /level/u.test(error.message)).length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("removing a referenced equation clears the place's dynamics reference and stays clean", () => {
    const definition = mutated((mutations) =>
      mutations.removeDifferentialEquation({ equationId: "decay-dynamics" }),
    );
    // The cascade is complete in the canonical definition: no place still
    // names the removed equation, so nothing is left half-referenced.
    expect(
      definition.places.find(({ id }) => id === "store")
        ?.differentialEquationId,
    ).toBeNull();
    expect(definition.differentialEquations).toEqual([]);
    expect(errorsOf(definition)).toEqual([]);
  });

  it("removing a referenced type uncolours its places and equation and dirties the code that read its tokens", () => {
    const definition = mutated((mutations) =>
      mutations.removeType({ typeId: "item" }),
    );
    expect(definition.types).toEqual([]);
    expect(definition.places.every(({ colorId }) => colorId === null)).toBe(
      true,
    );
    expect(
      definition.differentialEquations.every(({ colorId }) => colorId === null),
    ).toBe(true);
    const errors = errorsOf(definition);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors.every((error) => /level/u.test(error.message))).toBe(true);
  });
});
