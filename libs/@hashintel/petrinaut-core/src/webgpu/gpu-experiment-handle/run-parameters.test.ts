import { describe, expect, it } from "vitest";

import { deriveRunParameters } from "./run-parameters";

describe("deriveRunParameters", () => {
  it("packs a run plan into an f32 buffer as-is", () => {
    const result = deriveRunParameters(
      { ids: ["a", "b"], values: Float64Array.from([1, 2, 3, 4]) },
      2,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.runParameters.ids).toEqual(["a", "b"]);
    expect([...result.runParameters.values!]).toEqual([1, 2, 3, 4]);
  });

  it("carries no buffer when nothing varies per run", () => {
    expect(deriveRunParameters(undefined, 3)).toEqual({
      ok: true,
      runParameters: { ids: [] },
    });
    expect(
      deriveRunParameters({ ids: [], values: new Float64Array(0) }, 2),
    ).toEqual({
      ok: true,
      runParameters: { ids: [] },
    });
  });

  it("refuses a plan whose value count does not match the runs", () => {
    const result = deriveRunParameters(
      { ids: ["a"], values: Float64Array.from([1, 2, 3]) },
      2,
    );

    expect(result).toEqual({
      ok: false,
      reason:
        "The per-run draws carry 3 values but 2 runs × 1 parameters needs 2.",
    });
  });

  it("refuses a non-finite value, naming it", () => {
    const result = deriveRunParameters(
      { ids: ["a"], values: Float64Array.from([1, Number.NaN]) },
      2,
    );

    expect(result).toEqual({
      ok: false,
      reason:
        "Per-run value `NaN` for `a` is not a finite number, which is all the GPU's f32 buffer can carry.",
    });
  });

  it("refuses a value that narrows to an infinity in f32", () => {
    const result = deriveRunParameters(
      { ids: ["a"], values: Float64Array.from([1, 1e300]) },
      2,
    );

    expect(result).toEqual({
      ok: false,
      reason:
        "Per-run value `1e+300` for `a` overflows f32, the widest float WGSL has.",
    });
  });
});
