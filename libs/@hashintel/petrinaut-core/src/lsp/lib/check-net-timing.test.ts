import { describe, expect, it } from "vitest";

import { DEFAULT_PETRINAUT_EXTENSIONS } from "../../extensions";
import { SOURCE_PREDICATE_IN_TIMED_NET_CODE } from "./check-net-timing";
import { checkSDCPN } from "./checker";
import { createSDCPN } from "./helper/create-sdcpn";
import { createLanguageServers, syncLanguageServers } from "./language-servers";

import type { PetrinautExtensionSettings } from "../../extensions";
import type { SDCPN } from "../../types/sdcpn";

const check = (sdcpn: SDCPN, extensions?: PetrinautExtensionSettings) => {
  const servers = createLanguageServers();
  syncLanguageServers(servers, sdcpn, extensions);
  return checkSDCPN(sdcpn, servers, extensions);
};

const sourcePredicateErrors = (result: ReturnType<typeof check>) =>
  result.itemDiagnostics.flatMap((item) =>
    item.diagnostics
      .filter(
        (diagnostic) => diagnostic.code === SOURCE_PREDICATE_IN_TIMED_NET_CODE,
      )
      .map((diagnostic) => ({
        itemId: item.itemId,
        itemType: item.itemType,
        start: diagnostic.start,
        length: diagnostic.length,
        message: diagnostic.messageText,
      })),
  );

const places = [
  { id: "a", name: "A" },
  { id: "b", name: "B" },
];
const emit = {
  id: "emit",
  name: "Emit",
  lambdaType: "predicate" as const,
  lambdaCode: "return true;\n// Always.",
  inputArcs: [],
  outputArcs: [{ placeId: "a", weight: 1 }],
};
const rated = {
  id: "decay",
  name: "Decay",
  lambdaType: "stochastic" as const,
  lambdaCode: "return 1;",
  inputArcs: [{ placeId: "a", weight: 1, type: "standard" as const }],
  outputArcs: [{ placeId: "b", weight: 1 }],
};

describe("a predicate with no input place", () => {
  it("is an error in a timed net, on the first line of its firing code", () => {
    const result = check(createSDCPN({ places, transitions: [emit, rated] }));

    expect(sourcePredicateErrors(result)).toEqual([
      {
        itemId: "emit",
        itemType: "transition-lambda",
        start: 0,
        length: "return true;".length,
        message:
          "Predicate `Emit` has no input place. In a timed net nothing ever disables it, so it would fire without end at one instant. Connect an input place, or give it a stochastic rate.",
      },
    ]);
    expect(result.isValid).toBe(false);
  });

  it("is allowed in an untimed net, where it fires once per step", () => {
    const result = check(
      createSDCPN({
        places,
        transitions: [
          emit,
          { ...rated, lambdaType: "predicate", lambdaCode: "" },
        ],
      }),
    );

    expect(sourcePredicateErrors(result)).toEqual([]);
    expect(result.isValid).toBe(true);
  });

  it("is allowed once any place feeds it", () => {
    const result = check(
      createSDCPN({
        places,
        transitions: [
          {
            ...emit,
            inputArcs: [{ placeId: "b", weight: 1, type: "inhibitor" }],
          },
          rated,
        ],
      }),
    );

    expect(sourcePredicateErrors(result)).toEqual([]);
  });

  it("is reported when the net is timed by dynamics and the firing code is not shown", () => {
    const extensions = {
      ...DEFAULT_PETRINAUT_EXTENSIONS,
      stochasticity: false,
    };
    const result = check(
      createSDCPN({
        types: [{ id: "type", elements: [{ name: "x", type: "real" }] }],
        differentialEquations: [
          { id: "drift", colorId: "type", arity: 1, code: "return { x: 1 };" },
        ],
        places: [
          {
            id: "a",
            name: "A",
            colorId: "type",
            dynamicsEnabled: true,
            dynamics: [{ differentialEquationId: "drift" }],
          },
        ],
        transitions: [{ ...emit, lambdaCode: "" }],
      }),
      extensions,
    );

    expect(sourcePredicateErrors(result)).toMatchObject([
      { itemId: "emit", start: 0, length: 0 },
    ]);
    expect(result.isValid).toBe(false);
  });
});
