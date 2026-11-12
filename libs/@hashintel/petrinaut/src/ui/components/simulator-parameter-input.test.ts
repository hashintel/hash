import { describe, expect, it } from "vitest";

import { visibleSimulatorParameters } from "./simulator-parameter-input";

import type { SimulatorParameterSpecs } from "@hashintel/petrinaut-core";

const specs = {
  fast: { type: "boolean", label: "Fast", default: true },
  tolerance: {
    type: "number",
    label: "Tolerance",
    default: 0.1,
    enabledWhen: { key: "fast", in: [true] },
  },
} satisfies SimulatorParameterSpecs;

const visibleKeys = (values: Record<string, number | boolean | string>) =>
  visibleSimulatorParameters(specs, values).map(([key]) => key);

describe("visibleSimulatorParameters", () => {
  it("reads the default of a controlling parameter nobody set", () => {
    expect(visibleKeys({})).toEqual(["fast", "tolerance"]);
  });

  it("follows the stored value over the default", () => {
    expect(visibleKeys({ fast: false })).toEqual(["fast"]);
    expect(visibleKeys({ fast: true })).toEqual(["fast", "tolerance"]);
  });
});
