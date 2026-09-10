import { describe, expect, it } from "vitest";

import { hirExprSchema, hirFunctionSchema } from "./hir-schema";
import { lowerTypeScriptToHir } from "./lower-typescript";

const lower = (code: string, surface: "metric" | "scenario-expression") => {
  const lowered = lowerTypeScriptToHir(code, surface);
  if (!lowered.ok) {
    throw new Error(JSON.stringify(lowered.diagnostics));
  }
  return lowered.fn;
};

describe("hirFunctionSchema", () => {
  it("accepts what the lowering produces, node for node", () => {
    const samples = [
      lower(
        "scenario.min_load < scenario.max_load && parameters.rate > 0",
        "scenario-expression",
      ),
      lower(
        "Math.max(1, scenario.n) ** 2 % 3 !== 0 ? -1 : +Math.PI",
        "scenario-expression",
      ),
      lower(
        'range(1, scenario.n).map((x) => x * 2).length > 0 && "a".startsWith("a")',
        "scenario-expression",
      ),
      lower(
        `const counts = state.places.Queue.tokens.map((token, index) => token.weight + index);
         const total = counts.reduce((acc, value) => acc + value, 0);
         return total <= 10 && [1, 2].concat([3])[0] === 1 && ({ a: 1 }).a === 1;`,
        "metric",
      ),
    ];
    for (const fn of samples) {
      const parsed = hirFunctionSchema.safeParse(
        JSON.parse(JSON.stringify(fn)),
      );
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
      // Parsing is the identity on well-formed HIR: nothing is dropped or coerced.
      expect(parsed.data).toEqual(JSON.parse(JSON.stringify(fn)));
    }
  });

  it("rejects an unknown node kind", () => {
    const fn = lower("scenario.n > 0", "scenario-expression");
    const forged = { ...fn, body: { ...fn.body, kind: "eval" } };
    expect(hirFunctionSchema.safeParse(forged).success).toBe(false);
  });

  it("rejects a node missing a field the grammar requires", () => {
    const fn = lower("scenario.n > 0", "scenario-expression");
    const body = fn.body as { kind: "binary"; right: unknown };
    const { right: _dropped, ...withoutRight } = body;
    expect(hirExprSchema.safeParse(withoutRight).success).toBe(false);
  });

  it("rejects fields the grammar does not declare", () => {
    const fn = lower("scenario.n > 0", "scenario-expression");
    expect(hirExprSchema.safeParse({ ...fn.body, extra: 1 }).success).toBe(
      false,
    );
  });

  it("rejects a foreign HIR version", () => {
    const fn = lower("scenario.n > 0", "scenario-expression");
    expect(hirFunctionSchema.safeParse({ ...fn, hirVersion: 2 }).success).toBe(
      false,
    );
  });
});
