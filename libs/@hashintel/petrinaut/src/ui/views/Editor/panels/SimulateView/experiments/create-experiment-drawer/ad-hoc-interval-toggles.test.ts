import { describe, expect, it } from "vitest";

import { EMPTY_AD_HOC_STATE, type AdHocValue } from "@hashintel/petrinaut-core";

import { hasAdHocIntervalToggle } from "./ad-hoc-interval-toggles";

const plain: AdHocValue = { expression: "1", optimize: null };
const toggled: AdHocValue = {
  expression: "1",
  optimize: { min: "0", max: "2", scale: "linear" },
};

describe("hasAdHocIntervalToggle", () => {
  it("is false for the empty form and for values whose toggles are off", () => {
    expect(hasAdHocIntervalToggle(EMPTY_AD_HOC_STATE)).toBe(false);
    expect(
      hasAdHocIntervalToggle({
        variables: [{ ...plain, name: "n", type: "integer" }],
        netParameters: [{ ...plain, parameterId: "param" }],
        places: {
          debris: { kind: "uncoloured", count: plain },
          space: {
            kind: "coloured",
            variables: [],
            rows: [{ kind: "template", count: plain, cells: [plain] }],
            sharedColumns: { x: plain },
          },
        },
      }),
    ).toBe(false);
  });

  it("is true for a toggle on any slot: a Variable, a net parameter, a count, a cell or a shared column", () => {
    expect(
      hasAdHocIntervalToggle({
        ...EMPTY_AD_HOC_STATE,
        variables: [{ ...toggled, name: "n", type: "integer" }],
      }),
    ).toBe(true);
    expect(
      hasAdHocIntervalToggle({
        ...EMPTY_AD_HOC_STATE,
        netParameters: [{ ...toggled, parameterId: "param" }],
      }),
    ).toBe(true);
    expect(
      hasAdHocIntervalToggle({
        ...EMPTY_AD_HOC_STATE,
        places: { debris: { kind: "uncoloured", count: toggled } },
      }),
    ).toBe(true);
    expect(
      hasAdHocIntervalToggle({
        ...EMPTY_AD_HOC_STATE,
        places: {
          space: {
            kind: "coloured",
            variables: [],
            rows: [{ kind: "fixed", cells: [plain, toggled] }],
            sharedColumns: {},
          },
        },
      }),
    ).toBe(true);
    expect(
      hasAdHocIntervalToggle({
        ...EMPTY_AD_HOC_STATE,
        places: {
          space: {
            kind: "coloured",
            variables: [],
            rows: [{ kind: "template", count: toggled, cells: [] }],
            sharedColumns: {},
          },
        },
      }),
    ).toBe(true);
    expect(
      hasAdHocIntervalToggle({
        ...EMPTY_AD_HOC_STATE,
        places: {
          space: {
            kind: "coloured",
            variables: [],
            rows: [],
            sharedColumns: { velocity: toggled },
          },
        },
      }),
    ).toBe(true);
  });

  it("ignores retained settings, which only restore the next toggle", () => {
    expect(
      hasAdHocIntervalToggle({
        ...EMPTY_AD_HOC_STATE,
        variables: [
          {
            ...plain,
            name: "n",
            type: "integer",
            retainedOptimize: toggled.optimize ?? undefined,
          },
        ],
      }),
    ).toBe(false);
  });
});
