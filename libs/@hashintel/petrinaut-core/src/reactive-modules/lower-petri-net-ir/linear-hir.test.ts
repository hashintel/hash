import { describe, expect, it } from "vitest";

import { lowerTypeScriptToHir } from "../../hir/lower-typescript";
import {
  binary,
  bool,
  ite,
  not,
  num,
  ref,
  relu,
  scale,
} from "../reactive-module-graph";
import {
  LinearHirRefusal,
  type LinearHirEnv,
  translateGuard,
  translateRate,
} from "./linear-hir";

import type { HirFunction } from "../../hir/hir";

const lower = (code: string): HirFunction => {
  const lowered = lowerTypeScriptToHir(code, "lambda");
  if (!lowered.ok) {
    throw new Error(lowered.diagnostics.map((item) => item.message).join("; "));
  }
  return lowered.fn;
};

/** One bound token of place Hangar: a Real battery and a two-valued state. */
const env: LinearHirEnv = {
  inputName: "input",
  token: (place, index) =>
    place === "Hangar" && index === 0
      ? {
          attribute: (name) =>
            name === "battery"
              ? { expr: ref("Hangar_0_battery"), sort: "number" }
              : name === "state"
                ? {
                    expr: ref("Hangar_0_state"),
                    sort: "string",
                    codes: ["idle", "flying"],
                  }
                : undefined,
        }
      : undefined,
  tokenCount: (place) => (place === "Hangar" ? 1 : undefined),
  sample: (kind, args) =>
    kind === "gaussian" && args[1]?.expr.kind === "num"
      ? binary(
          "+",
          args[0]?.expr ?? num(0),
          scale(args[1].expr.value, ref("z_0")),
        )
      : undefined,
};

const refusalOf = (code: string): string => {
  try {
    translateRate(lower(code), env);
  } catch (error) {
    if (error instanceof LinearHirRefusal) {
      return error.code;
    }
    throw error;
  }
  return "accepted";
};

describe("translateHir", () => {
  it("folds scaling by constants and division by a constant into one factor", () => {
    expect(
      translateRate(lower("return 0.5 * (input.Hangar[0].battery / 4);"), env),
    ).toEqual(scale(0.125, ref("Hangar_0_battery")));
    expect(
      translateRate(lower("return -input.Hangar[0].battery + 2;"), env),
    ).toEqual(binary("+", scale(-1, ref("Hangar_0_battery")), num(2)));
  });

  it("writes max, min and abs with relu", () => {
    expect(
      translateRate(
        lower("return Math.max(input.Hangar[0].battery, 50);"),
        env,
      ),
    ).toEqual(
      binary(
        "+",
        ref("Hangar_0_battery"),
        relu(binary("-", num(50), ref("Hangar_0_battery"))),
      ),
    );
    expect(
      translateRate(lower("return Math.abs(input.Hangar[0].battery);"), env),
    ).toEqual(
      binary(
        "+",
        relu(ref("Hangar_0_battery")),
        relu(scale(-1, ref("Hangar_0_battery"))),
      ),
    );
  });

  it("compares a string attribute with a literal by its code, and decides a value it never takes", () => {
    expect(
      translateGuard(lower('return input.Hangar[0].state === "flying";'), env),
    ).toEqual(binary("==", ref("Hangar_0_state"), num(1)));
    expect(
      translateGuard(lower('return input.Hangar[0].state !== "lost";'), env),
    ).toEqual(bool(true));
  });

  it("keeps conditionals, logic, lengths and let bindings", () => {
    expect(
      translateGuard(
        lower(
          "const drone = input.Hangar[0];\nconst low = drone.battery < 20;\nreturn low || (!low && input.Hangar.length >= 1);",
        ),
        env,
      ),
    ).toEqual(
      binary(
        "|",
        binary("<", ref("Hangar_0_battery"), num(20)),
        binary(
          "&",
          not(binary("<", ref("Hangar_0_battery"), num(20))),
          binary(">=", num(1), num(1)),
        ),
      ),
    );
    expect(
      translateRate(
        lower("return input.Hangar[0].battery > 50 ? 2 : 0.5;"),
        env,
      ),
    ).toEqual(
      ite(binary(">", ref("Hangar_0_battery"), num(50)), num(2), num(0.5)),
    );
  });

  it("draws a Gaussian with a constant spread as mean plus spread times an input", () => {
    expect(
      translateRate(
        lower(
          "return Distribution.Gaussian(input.Hangar[0].battery, 4).map((v) => v + 1);",
        ),
        env,
      ),
    ).toEqual(
      binary(
        "+",
        binary("+", ref("Hangar_0_battery"), scale(4, ref("z_0"))),
        num(1),
      ),
    );
  });

  it("refuses what the theories cannot hold, naming the reason", () => {
    expect(
      refusalOf("return input.Hangar[0].battery * input.Hangar[0].battery;"),
    ).toBe("nonlinear-product");
    expect(refusalOf("return 1 / input.Hangar[0].battery;")).toBe(
      "nonlinear-division",
    );
    expect(refusalOf("return Math.exp(input.Hangar[0].battery);")).toBe(
      "nonlinear-math",
    );
    expect(refusalOf("return input.Hangar[0].battery ** 2;")).toBe(
      "nonlinear-power",
    );
    expect(refusalOf("return Math.random();")).toBe("math-random");
    expect(
      refusalOf("return Distribution.Gaussian(1, input.Hangar[0].battery);"),
    ).toBe("distribution-unsupported");
    expect(refusalOf("return parameters.rate;")).toBe("parameter-unresolved");
  });
});
