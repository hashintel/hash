import { describe, expect, it } from "vitest";

import { replaceDefinition } from "./replace-definition";

import type { SDCPN } from "../types/sdcpn";

const net = (overrides: Partial<SDCPN> = {}): SDCPN => ({
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
  ...overrides,
});

describe("replaceDefinition", () => {
  it("leaves the target with the definition's fields and none of its own", () => {
    const target = net({ description: "Before", metrics: [] });
    const definition = net({
      componentsOnly: true,
      places: [
        {
          id: "a",
          name: "A",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 0,
          y: 0,
        },
      ],
    });

    replaceDefinition(target, definition);

    expect(target).toEqual(definition);
    expect("description" in target).toBe(false);
    expect("metrics" in target).toBe(false);
  });
});
