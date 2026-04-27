import { describe, expect, it } from "vitest";

import type { Metric } from "../core/types/sdcpn";
import { compileMetric, type MetricState } from "./compile-metric";

const metric = (overrides: Partial<Metric> = {}): Metric => ({
  id: "m1",
  name: "Test",
  code: "return 0;",
  ...overrides,
});

const state = (overrides?: Partial<MetricState>): MetricState => ({
  places: {
    A: { count: 3, tokens: [] },
    B: { count: 7, tokens: [] },
  },
  ...overrides,
});

describe("compileMetric", () => {
  it("compiles a simple metric that returns a number", () => {
    const outcome = compileMetric(metric({ code: "return 42;" }));
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.fn(state())).toBe(42);
    }
  });

  it("exposes place counts via state.places.<name>.count", () => {
    const outcome = compileMetric(
      metric({ code: "return state.places.A.count + state.places.B.count;" }),
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.fn(state())).toBe(10);
    }
  });

  it("rejects empty code at compile time", () => {
    const outcome = compileMetric(metric({ code: "   " }));
    expect(outcome.ok).toBe(false);
  });

  it("returns a compile error for syntactically invalid code", () => {
    const outcome = compileMetric(metric({ code: "return (" }));
    expect(outcome.ok).toBe(false);
  });

  it("throws at runtime when the result is not a finite number", () => {
    const outcome = compileMetric(metric({ code: "return 'oops';" }));
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(() => outcome.fn(state())).toThrow(/finite number/);
    }
  });

  it("throws at runtime for NaN / Infinity", () => {
    const nanFn = compileMetric(metric({ code: "return 0/0;" }));
    expect(nanFn.ok).toBe(true);
    if (nanFn.ok) {
      expect(() => nanFn.fn(state())).toThrow(/finite number/);
    }

    const infFn = compileMetric(metric({ code: "return 1/0;" }));
    expect(infFn.ok).toBe(true);
    if (infFn.ok) {
      expect(() => infFn.fn(state())).toThrow(/finite number/);
    }
  });

  it("shadows dangerous globals so they appear undefined inside the metric", () => {
    const outcome = compileMetric(
      metric({ code: "return typeof window === 'undefined' ? 1 : 0;" }),
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.fn(state())).toBe(1);
    }

    const outcome2 = compileMetric(
      metric({ code: "return typeof Function === 'undefined' ? 1 : 0;" }),
    );
    expect(outcome2.ok).toBe(true);
    if (outcome2.ok) {
      expect(outcome2.fn(state())).toBe(1);
    }
  });

  it("blocks the .constructor escape route on literals", () => {
    // `({}).constructor.constructor("return globalThis")()` would otherwise
    // walk back to the host realm even with `Function` shadowed as a var.
    const outcome = compileMetric(
      metric({ code: "return ({}).constructor.constructor('return 1')();" }),
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(() => outcome.fn(state())).toThrow(/\.constructor/);
    }
  });

  it("freezes the state argument so metrics cannot mutate it", () => {
    const outcome = compileMetric(
      metric({
        code: `
          try { state.places.A.count = 999; } catch (_) {}
          return state.places.A.count;
        `,
      }),
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.fn(state())).toBe(3);
    }
  });
});
