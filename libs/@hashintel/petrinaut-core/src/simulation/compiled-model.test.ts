import { beforeAll, describe, expect, it } from "vitest";

import { sirModel } from "../examples";
import { compilePetrinautModel } from "./compiled-model";

import type { PetrinautCompiledModel } from "./compiled-model";

describe("compilePetrinautModel", () => {
  let model: PetrinautCompiledModel;

  beforeAll(() => {
    model = compilePetrinautModel({ sdcpn: sirModel.petriNetDefinition });
  });

  it("generates a valid seed when one is not supplied", () => {
    const result = model.run({ maxSteps: 0 });

    expect(result.seed).toBeGreaterThanOrEqual(1);
    expect(result.seed).toBeLessThanOrEqual(2_147_483_647);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects non-finite maxTime %s",
    (maxTime) => {
      expect(() => model.run({ maxTime })).toThrow(
        "Run config maxTime must be a finite non-negative number or null",
      );
    },
  );

  it("rejects negative maxTime", () => {
    expect(() => model.run({ maxTime: -1 })).toThrow(
      "Run config maxTime must be a finite non-negative number or null",
    );
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid dt %s",
    (dt) => {
      expect(() => model.run({ maxTime: 1, dt })).toThrow(
        "Run config dt must be a finite positive number",
      );
    },
  );
});
