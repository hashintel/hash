import { describe, expect, it } from "vitest";

import { checkSnapshot } from "./check-snapshot";
import { createSDCPN } from "./helper/create-sdcpn";

describe("checkSnapshot", () => {
  it("checks the supplied source even when diagnostics were unchanged", () => {
    const invalid = createSDCPN({
      transitions: [{ id: "arrival", lambdaCode: "return missingRate;" }],
    });
    const first = checkSnapshot(invalid);
    expect(
      first
        .flatMap((item) => item.diagnostics)
        .some((diagnostic) => diagnostic.severity === 1),
    ).toBe(true);
    expect(checkSnapshot(invalid)).toEqual(first);

    const valid = createSDCPN({
      transitions: [{ id: "arrival", lambdaCode: "return true;" }],
    });
    expect(
      checkSnapshot(valid)
        .flatMap((item) => item.diagnostics)
        .filter((diagnostic) => diagnostic.severity === 1),
    ).toEqual([]);
    expect(checkSnapshot(invalid)).toEqual(first);
  });
});
