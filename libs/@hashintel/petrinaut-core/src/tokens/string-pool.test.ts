import { describe, expect, it } from "vitest";

import { StringPool } from "./string-pool";

describe("StringPool", () => {
  it('pre-seeds the empty string at id 0 so zeroed buffers decode to ""', () => {
    const pool = new StringPool();

    expect(pool.size).toBe(1);
    expect(pool.get(0)).toBe("");
    expect(pool.intern("")).toBe(0);
    expect(pool.size).toBe(1);
  });

  it("interns values append-only and deduplicates equal strings", () => {
    const pool = new StringPool();

    const alpha = pool.intern("alpha");
    const beta = pool.intern("beta");

    expect(alpha).toBe(1);
    expect(beta).toBe(2);
    // Interned equality: two equal strings always share an ID.
    expect(pool.intern("alpha")).toBe(alpha);
    expect(pool.intern(`al${"pha"}`)).toBe(alpha);
    expect(pool.size).toBe(3);
    expect(pool.get(alpha)).toBe("alpha");
    expect(pool.get(beta)).toBe("beta");
  });

  it('decodes out-of-range ids to "" instead of throwing', () => {
    const pool = new StringPool();
    pool.intern("alpha");

    expect(pool.get(99)).toBe("");
    expect(pool.get(-1)).toBe("");
  });

  it("returns pool entries from a starting index for protocol deltas", () => {
    const pool = new StringPool();
    pool.intern("alpha");
    pool.intern("beta");
    pool.intern("gamma");

    expect(pool.valuesFrom(0)).toEqual(["", "alpha", "beta", "gamma"]);
    expect(pool.valuesFrom(1)).toEqual(["alpha", "beta", "gamma"]);
    expect(pool.valuesFrom(3)).toEqual(["gamma"]);
    expect(pool.valuesFrom(4)).toEqual([]);
  });

  it("throws a clear error when maxSize is exceeded", () => {
    const pool = new StringPool({ maxSize: 3 });
    pool.intern("a");
    pool.intern("b");

    // Existing values still intern fine at capacity.
    expect(pool.intern("a")).toBe(1);
    expect(() => pool.intern("c")).toThrow(
      "string pool exceeded 3 distinct values — are kernels generating unbounded unique strings?",
    );
  });
});
