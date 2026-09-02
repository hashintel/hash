import { describe, expect, it } from "vitest";

import { deriveRunParameters } from "./run-parameters";

describe("deriveRunParameters", () => {
  it("packs a run plan into an f32 buffer as-is", () => {
    const result = deriveRunParameters(
      undefined,
      { ids: ["a", "b"], values: Float64Array.from([1, 2, 3, 4]) },
      2,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.runParameters.ids).toEqual(["a", "b"]);
    expect([...result.runParameters.values!]).toEqual([1, 2, 3, 4]);
  });

  it("lays per-run records out run-major over the sorted override set", () => {
    const result = deriveRunParameters(
      [
        { parameterValues: { b: "2", a: "1" } },
        { parameterValues: { a: "3", b: "4" } },
      ],
      undefined,
      2,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.runParameters.ids).toEqual(["a", "b"]);
    expect([...result.runParameters.values!]).toEqual([1, 2, 3, 4]);
  });

  it("carries no buffer when nothing varies per run", () => {
    expect(deriveRunParameters(undefined, undefined, 3)).toEqual({
      ok: true,
      runParameters: { ids: [] },
    });
    expect(
      deriveRunParameters(
        [{}, {}],
        { ids: [], values: new Float64Array(0) },
        2,
      ),
    ).toEqual({
      ok: true,
      runParameters: { ids: [] },
    });
  });

  it("refuses a plan whose value count does not match the runs", () => {
    const result = deriveRunParameters(
      undefined,
      { ids: ["a"], values: Float64Array.from([1, 2, 3]) },
      2,
    );

    expect(result).toEqual({
      ok: false,
      reason:
        "The per-run draws carry 3 values but 2 runs × 1 parameters needs 2.",
    });
  });

  it("refuses non-finite values from either form, naming the raw value", () => {
    const fromPlan = deriveRunParameters(
      undefined,
      { ids: ["a"], values: Float64Array.from([1, Number.NaN]) },
      2,
    );
    const fromRuns = deriveRunParameters(
      [{ parameterValues: { a: "1" } }, { parameterValues: { a: "abc" } }],
      undefined,
      2,
    );

    expect(fromPlan).toEqual({
      ok: false,
      reason:
        "Per-run value `NaN` for `a` is not a finite number, which is all the GPU's f32 buffer can carry.",
    });
    expect(fromRuns).toEqual({
      ok: false,
      reason:
        "Per-run value `abc` for `a` is not a finite number, which is all the GPU's f32 buffer can carry.",
    });
  });

  it("refuses per-run shapes the buffer cannot express", () => {
    expect(
      deriveRunParameters([{ seed: 1 }, { seed: 2 }], undefined, 2),
    ).toMatchObject({ ok: false, reason: /per-run seed/ });
    expect(
      deriveRunParameters(
        [{ parameterValues: { a: "1" } }, { parameterValues: { b: "1" } }],
        undefined,
        2,
      ),
    ).toMatchObject({ ok: false, reason: /same parameters/ });
    expect(
      deriveRunParameters([{ parameterValues: { a: "1" } }], undefined, 2),
    ).toMatchObject({ ok: false, reason: /declares 2 runs but supplies 1/ });
  });
});
