import { describe, expect, it } from "vitest";

import { computePlaygroundTokenLayout, encodeToken } from "./physical-layout";

describe("encodeToken", () => {
  it("round-trips with product coercion", () => {
    const layout = computePlaygroundTokenLayout([
      { name: "active", type: "boolean" },
      { name: "amount", type: "real" },
      { name: "count", type: "integer" },
    ]);
    const { stored, decoded } = encodeToken(layout, {
      active: true,
      amount: 1.25,
      count: 2.7,
    });

    expect(stored).toEqual({ active: true, amount: 1.25, count: 3 });
    expect(decoded).toEqual({ active: true, amount: 1.25, count: 3 });
  });

  it("round-trips a string through its throwaway pool", () => {
    const layout = computePlaygroundTokenLayout([
      { name: "label", type: "string" },
    ]);
    const { buffer, stored, decoded } = encodeToken(layout, { label: "alpha" });

    expect(stored).toEqual({ label: "alpha" });
    expect(decoded).toEqual({ label: "alpha" });
    // The buffer holds the pool id (1 — id 0 is the pre-seeded ""), not text.
    expect(new DataView(buffer).getBigUint64(0, true)).toBe(1n);
  });
});
