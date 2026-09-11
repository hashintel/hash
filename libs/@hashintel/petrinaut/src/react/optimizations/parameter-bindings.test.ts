import { describe, expect, it } from "vitest";

import { partitionParameterBindings } from "./parameter-bindings";

import type { PetrinautOptimizationInput } from "@hashintel/petrinaut-core";

const inputWith = (
  bindings: PetrinautOptimizationInput["scenario"]["parameterBindings"],
): Pick<PetrinautOptimizationInput, "scenario"> => ({
  scenario: { id: "s", parameterBindings: bindings },
});

describe("partitionParameterBindings", () => {
  it("splits the bindings by kind, each half in binding order", () => {
    const { fixed, optimized } = partitionParameterBindings(
      inputWith({
        batch_size: { kind: "fixed", value: 220 },
        rate: {
          kind: "optimize",
          domain: {
            kind: "continuous",
            minimum: 0,
            maximum: 1,
            scale: "linear",
          },
        },
        express: { kind: "fixed", value: true },
        enabled: { kind: "optimize", domain: { kind: "boolean" } },
      }),
    );

    expect(fixed).toEqual({ batch_size: 220, express: true });
    expect(Object.keys(optimized)).toEqual(["rate", "enabled"]);
    expect(optimized.enabled?.domain.kind).toBe("boolean");
  });
});
