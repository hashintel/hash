import { describe, expect, it } from "vitest";

import { expandLogValue, safeStringify } from "./logger.js";

describe("expandLogValue / Error handling", () => {
  it("rebuilds Error fields that JSON.stringify would otherwise drop", () => {
    const err = new Error("boom");
    const expanded = expandLogValue(err) as Record<string, unknown>;

    expect(expanded.name).toBe("Error");
    expect(expanded.message).toBe("boom");
    expect(typeof expanded.stack).toBe("string");
    expect("cause" in expanded).toBe(false);
  });

  it("expands nested Error.cause chains", () => {
    const inner = new Error("inner");
    const outer = new Error("outer", { cause: inner });
    const expanded = expandLogValue(outer) as Record<string, unknown>;

    expect(expanded.message).toBe("outer");
    const cause = expanded.cause as Record<string, unknown>;
    expect(cause.name).toBe("Error");
    expect(cause.message).toBe("inner");
  });

  it("breaks self-referential Error.cause cycles with [Circular]", () => {
    const err = new Error("self") as Error & { cause: unknown };
    err.cause = err;

    // Without cycle detection on Error this would blow the stack.
    const expanded = expandLogValue(err) as Record<string, unknown>;

    expect(expanded.message).toBe("self");
    expect(expanded.cause).toBe("[Circular]");
  });

  it("breaks A → B → A Error.cause cycles", () => {
    const a = new Error("a") as Error & { cause: unknown };
    const b = new Error("b") as Error & { cause: unknown };
    a.cause = b;
    b.cause = a;

    const expanded = expandLogValue(a) as Record<string, unknown>;

    expect(expanded.message).toBe("a");
    const causeOfA = expanded.cause as Record<string, unknown>;
    expect(causeOfA.message).toBe("b");
    expect(causeOfA.cause).toBe("[Circular]");
  });

  it("preserves enumerable own properties on Error subclasses", () => {
    class APIError extends Error {
      constructor(
        message: string,
        public status: number,
        public code: string,
      ) {
        super(message);
        this.name = "APIError";
      }
    }
    const err = new APIError("rate limit", 429, "rate_limit_exceeded");

    const expanded = expandLogValue(err) as Record<string, unknown>;

    expect(expanded.name).toBe("APIError");
    expect(expanded.message).toBe("rate limit");
    expect(expanded.status).toBe(429);
    expect(expanded.code).toBe("rate_limit_exceeded");
  });
});

describe("expandLogValue / cycles in plain objects", () => {
  it("collapses self-references in objects", () => {
    type Loop = { name: string; self?: Loop };
    const loop: Loop = { name: "x" };
    loop.self = loop;

    const expanded = expandLogValue(loop) as Record<string, unknown>;

    expect(expanded.name).toBe("x");
    expect(expanded.self).toBe("[Circular]");
  });

  it("does not flag legitimate sibling references as circular", () => {
    const shared = { id: 1 };
    const payload = { left: shared, right: shared };

    const expanded = expandLogValue(payload) as Record<
      string,
      Record<string, unknown>
    >;

    expect(expanded.left).toEqual({ id: 1 });
    expect(expanded.right).toEqual({ id: 1 });
  });
});

describe("expandLogValue / non-JSON values", () => {
  it("converts BigInt to its string form", () => {
    expect(expandLogValue(42n)).toBe("42");
    expect(expandLogValue({ size: 9007199254740993n })).toEqual({
      size: "9007199254740993",
    });
  });

  it("preserves toJSON values like Date untouched", () => {
    const date = new Date("2026-01-01T00:00:00.000Z");
    expect(expandLogValue(date)).toBe(date);
    // ...so JSON.stringify still calls toJSON on them.
    expect(safeStringify({ at: date })).toBe(
      '{"at":"2026-01-01T00:00:00.000Z"}',
    );
  });
});

describe("safeStringify", () => {
  it("survives Errors with circular cause without throwing", () => {
    const err = new Error("loop") as Error & { cause: unknown };
    err.cause = err;

    const out = safeStringify({ error: err });

    expect(out).toContain('"message":"loop"');
    expect(out).toContain('"[Circular]"');
  });

  it("falls back to a marker string on unexpected serialisation failure", () => {
    // BigInts inside `toJSON`-bearing objects bypass `expandLogValue`'s
    // BigInt branch and would throw inside JSON.stringify; the catch
    // converts that into the marker rather than propagating.
    const sneaky = {
      toJSON() {
        return { n: 1n };
      },
    };

    const out = safeStringify(sneaky);

    expect(out).toMatch(/^\[unserializable: /);
  });
});
