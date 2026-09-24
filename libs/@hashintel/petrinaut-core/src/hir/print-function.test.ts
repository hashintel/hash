import { describe, expect, it } from "vitest";

import { walkHir } from "./hir";
import { lowerTypeScriptToHir } from "./lower-typescript";
import { printHirFunction, substituteHirParameters } from "./print-function";

import type { HirFunction, HirSurfaceKind } from "./hir";

function lower(code: string, surface: HirSurfaceKind): HirFunction {
  const result = lowerTypeScriptToHir(code, surface);
  if (!result.ok) {
    throw new Error(
      `Expected the ${surface} code to lower, got: ${result.diagnostics
        .map((diagnostic) => diagnostic.message)
        .join("; ")}`,
    );
  }
  return result.fn;
}

/** Ids and spans differ between lowerings of different source texts; the
 * printer's contract is over the remaining structure. */
const LOCATION_KEYS = new Set([
  "id",
  "span",
  "fieldSpan",
  "keySpan",
  "nameSpan",
]);

function stripLocations(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripLocations);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !LOCATION_KEYS.has(key))
        .map(([key, entry]) => [key, stripLocations(entry)]),
    );
  }
  return value;
}

type Fixture = {
  name: string;
  surface: Extract<HirSurfaceKind, "lambda" | "kernel" | "dynamics">;
  code: string;
  printed: string;
};

/**
 * Every fixture must satisfy the printer's contract: the printed text lowers
 * (as a bare body of the same surface) to a tree structurally identical to
 * the original, and printing that tree gives the same text.
 */
const FIXTURES: Fixture[] = [
  {
    name: "a bare-body lambda",
    surface: "lambda",
    code: "return parameters.rate * 2;",
    printed: "return parameters.rate * 2;",
  },
  {
    name: "a module-form lambda",
    surface: "lambda",
    code: "export default Lambda((input, parameters) => input.A[0].x > parameters.limit)",
    printed: "return input.A[0].x > parameters.limit;",
  },
  {
    name: "a kernel with root consts and a multi-field record (order_v1, abridged)",
    surface: "kernel",
    code: `export default TransitionKernel((input, parameters) => {
  const px = input["RawPriceIndex"][0];
  const p = input["InventoryPosition_Sonaflozin"][0];
  const q = Math.max(parameters.moq_chinese, Math.ceil((parameters.target_sonaflozin - p.position) / parameters.round_chinese) * parameters.round_chinese);
  const price = 89.43 * Math.max(px.level, 0.1);
  return {
    "RawPriceIndex": [{ level: px.level, diffusion_clock: px.diffusion_clock }],
    "AtVendor": [{ material: "Sonaflozin", vendor: "Chinese supplier", qty: q, remaining_life: parameters.shelf_life_sonaflozin, holding_eur: 0, unit_price: price, dispatch_clock: parameters.dispatch_time, transit_clock: Distribution.Gaussian(3.0286, 0.4714) }],
    "InventoryPosition_Sonaflozin": [{ position: p.position + q }],
  };
});`,
    printed: `const px = input.RawPriceIndex[0];
const p = input.InventoryPosition_Sonaflozin[0];
const q = Math.max(parameters.moq_chinese, Math.ceil((parameters.target_sonaflozin - p.position) / parameters.round_chinese) * parameters.round_chinese);
const price = 89.43 * Math.max(px.level, 0.1);
return {
  RawPriceIndex: [{ level: px.level, diffusion_clock: px.diffusion_clock }],
  AtVendor: [
    {
      material: "Sonaflozin",
      vendor: "Chinese supplier",
      qty: q,
      remaining_life: parameters.shelf_life_sonaflozin,
      holding_eur: 0,
      unit_price: price,
      dispatch_clock: parameters.dispatch_time,
      transit_clock: Distribution.Gaussian(3.0286, 0.4714),
    },
  ],
  InventoryPosition_Sonaflozin: [{ position: p.position + q }],
};`,
  },
  {
    name: "a kernel merging two tokens (merge_1)",
    surface: "kernel",
    code: `export default TransitionKernel((input, parameters) => {
  const a = input["SonaflozinStock"][0];
  const b = input["SonaflozinStock"][1];
  return {
    "SonaflozinStock": [{ material: a.material, vendor: a.vendor, qty: a.qty + b.qty, remaining_life: Math.min(a.remaining_life, b.remaining_life), holding_eur: a.holding_eur + b.holding_eur, unit_price: (a.qty * a.unit_price + b.qty * b.unit_price) / (a.qty + b.qty), dispatch_clock: 0, transit_clock: 0 }],
  };
});`,
    printed: `const a = input.SonaflozinStock[0];
const b = input.SonaflozinStock[1];
return {
  SonaflozinStock: [
    {
      material: a.material,
      vendor: a.vendor,
      qty: a.qty + b.qty,
      remaining_life: Math.min(a.remaining_life, b.remaining_life),
      holding_eur: a.holding_eur + b.holding_eur,
      unit_price: (a.qty * a.unit_price + b.qty * b.unit_price) / (a.qty + b.qty),
      dispatch_clock: 0,
      transit_clock: 0,
    },
  ],
};`,
  },
  {
    name: "a kernel drawing a distribution and clamping it with .map",
    surface: "kernel",
    code: `export default TransitionKernel((input, parameters) => {
  const m = input["DemandOutlook"][0];
  return {
    "DemandOutlook": [{ rate: m.rate, diffusion_clock: m.diffusion_clock }],
    "Backlog": [{ kind: "contract", waited: 0, patience: 0, qty: Distribution.Gaussian(parameters.small_qty_mean, parameters.small_qty_sd).map((v) => Math.max(v, 5)) }],
  };
});`,
    printed: `const m = input.DemandOutlook[0];
return {
  DemandOutlook: [{ rate: m.rate, diffusion_clock: m.diffusion_clock }],
  Backlog: [
    {
      kind: "contract",
      waited: 0,
      patience: 0,
      qty: Distribution.Gaussian(parameters.small_qty_mean, parameters.small_qty_sd).map((v) => Math.max(v, 5)),
    },
  ],
};`,
  },
  {
    name: "a kernel passing a whole input array through",
    surface: "kernel",
    code: `return {
  MachinesToRepair: input.BrokenMachines,
  TechniciansComing: [
    { distance_to_site: 10 }
  ],
};`,
    printed: `return {
  MachinesToRepair: input.BrokenMachines,
  TechniciansComing: [{ distance_to_site: 10 }],
};`,
  },
  {
    name: "a dynamics body destructuring the token",
    surface: "dynamics",
    code: "return tokens.map(({ eta }) => ({ eta: eta > 0 ? -1 : 0 }));",
    printed: "return tokens.map(({ eta }) => ({ eta: eta > 0 ? -1 : 0 }));",
  },
  {
    name: "a dynamics body with an outer const",
    surface: "dynamics",
    code: `const drain = parameters.drain_rate * 2;
return tokens.map(({ battery }) => ({ battery: -drain * battery }));`,
    printed: `const drain = parameters.drain_rate * 2;
return tokens.map(({ battery }) => ({ battery: -drain * battery }));`,
  },
  {
    name: "a dynamics module whose callback ignores the token",
    surface: "dynamics",
    code: `export default Dynamics((tokens) => {
  return tokens.map(() => ({ waited: 1, patience: 0, qty: 0 }));
});`,
    printed: "return tokens.map(() => ({ waited: 1, patience: 0, qty: 0 }));",
  },
  {
    name: "a dynamics module whose record overflows the line",
    surface: "dynamics",
    code: `export default Dynamics((tokens, parameters) => {
  return tokens.map((c) => ({
    qty: 0,
    remaining_life: -1,
    holding_eur: c.qty * parameters.holding_cost_rate,
    unit_price: 0,
    dispatch_clock: 0,
    transit_clock: 0,
  }));
});`,
    printed: `return tokens.map((c) => ({
  qty: 0,
  remaining_life: -1,
  holding_eur: c.qty * parameters.holding_cost_rate,
  unit_price: 0,
  dispatch_clock: 0,
  transit_clock: 0,
}));`,
  },
  {
    name: "a kernel whose if branch binds a const",
    surface: "kernel",
    code: `const m = input.Backlog[0];
if (m.kind === "spot") {
  const loss = m.qty * parameters.unit_margin;
  return { LostSales: [{ kind: "spot", value: loss }] };
}
return { Kept: [{ kind: m.kind, value: m.qty }] };`,
    printed: `const m = input.Backlog[0];
if (m.kind === "spot") {
  const loss = m.qty * parameters.unit_margin;
  return { LostSales: [{ kind: "spot", value: loss }] };
} else {
  return { Kept: [{ kind: m.kind, value: m.qty }] };
}`,
  },
  {
    name: "a kernel with a guard clause before a const",
    surface: "kernel",
    code: `const m = input.Backlog[0];
if (m.kind === "spot") {
  return { LostSales: [{ kind: "spot", value: m.qty }] };
}
const kept = m.qty;
return { Kept: [{ kind: m.kind, value: kept }] };`,
    printed: `const m = input.Backlog[0];
if (m.kind === "spot") {
  return { LostSales: [{ kind: "spot", value: m.qty }] };
}
const kept = m.qty;
return { Kept: [{ kind: m.kind, value: kept }] };`,
  },
  {
    name: "a dynamics body with a const inside the callback",
    surface: "dynamics",
    code: "return tokens.map((t) => { const y = t.x * 2; return { x: y }; });",
    printed:
      "return tokens.map((t) => { const y = t.x * 2; return { x: y }; });",
  },
];

describe("printHirFunction", () => {
  describe("round-trip and idempotence over the fixtures", () => {
    for (const fixture of FIXTURES) {
      it(`prints ${fixture.name} as its bare body`, () => {
        const lowered = lower(fixture.code, fixture.surface);
        const printed = printHirFunction(lowered);
        expect(printed).toBe(fixture.printed);

        const relowered = lower(printed, fixture.surface);
        expect(stripLocations(relowered.body)).toEqual(
          stripLocations(lowered.body),
        );
        expect(printHirFunction(relowered)).toBe(printed);
      });
    }
  });

  it("prints no trailing newline", () => {
    for (const fixture of FIXTURES) {
      expect(
        printHirFunction(lower(fixture.code, fixture.surface)),
      ).not.toMatch(/\n$/);
    }
  });

  it("keeps a record on one line at exactly 80 columns and breaks it at 81", () => {
    const prefix =
      "return { a: input.Alpha[0].value, b: input.Beta[0].value, cc: ";
    const suffix = " };";
    const atLimitDigits = "1".repeat(80 - prefix.length - suffix.length);
    const atLimit = `${prefix}${atLimitDigits}${suffix}`;
    expect(atLimit.length).toBe(80);
    expect(printHirFunction(lower(atLimit, "kernel"))).toBe(atLimit);

    const overLimitDigits = `${atLimitDigits}1`;
    const overLimit = `${prefix}${overLimitDigits}${suffix}`;
    expect(printHirFunction(lower(overLimit, "kernel"))).toBe(
      `return {
  a: input.Alpha[0].value,
  b: input.Beta[0].value,
  cc: ${overLimitDigits},
};`,
    );
  });

  describe("module-form functions with their own parameter names", () => {
    it("prints the body with the surface's ambient names", () => {
      const fn = lower(
        "export default Lambda((t, p) => t.A[0].x > p.limit)",
        "lambda",
      );
      const printed = printHirFunction(fn);
      expect(printed).toBe("return input.A[0].x > parameters.limit;");
      expect(printHirFunction(lower(printed, "lambda"))).toBe(printed);
    });

    it("prints a destructured input parameter through the ambient name", () => {
      const fn = lower(
        "export default Dynamics(({ Pool }, { rate }) => Pool.map((t) => ({ x: t.x * rate })))",
        "dynamics",
      );
      expect(printHirFunction(fn)).toBe(
        "return tokens.Pool.map((t) => ({ x: t.x * parameters.rate }));",
      );
    });

    it("rejects the rename when the body rebinds the input name", () => {
      const shadowing = lower(
        "export default Lambda((t) => t.A.map((input) => input.x).length > 0)",
        "lambda",
      );
      expect(() => printHirFunction(shadowing)).toThrow(/rebinds/);
    });
  });

  describe("parameter substitution", () => {
    it("inlines a parameter and folds the constant it exposes", () => {
      const fn = lower("return parameters.rate * 2;", "lambda");
      expect(printHirFunction(fn, { parameters: { rate: 1.5 } })).toBe(
        "return 3;",
      );
    });

    it("keeps parameters absent from the record symbolic", () => {
      const fn = lower(
        "return parameters.rate * parameters.scale + 1;",
        "lambda",
      );
      expect(printHirFunction(fn, { parameters: { rate: 2 } })).toBe(
        "return 2 * parameters.scale + 1;",
      );
    });

    it("inlines booleans and folds the conditionals they decide", () => {
      const fn = lower(
        "return parameters.fast ? parameters.rate : 0;",
        "lambda",
      );
      expect(printHirFunction(fn, { parameters: { fast: true } })).toBe(
        "return parameters.rate;",
      );
      expect(
        printHirFunction(fn, { parameters: { fast: false, rate: 4 } }),
      ).toBe("return 0;");
    });

    it("prints non-finite folds as the Infinity and NaN constants", () => {
      const fn = lower("return 1 / parameters.zero;", "lambda");
      expect(printHirFunction(fn, { parameters: { zero: 0 } })).toBe(
        "return Infinity;",
      );
      expect(printHirFunction(fn, { parameters: { zero: -0 } })).toBe(
        "return -Infinity;",
      );
      const nan = lower("return parameters.zero / parameters.zero;", "lambda");
      expect(printHirFunction(nan, { parameters: { zero: 0 } })).toBe(
        "return NaN;",
      );
    });

    it("substitutes inside kernels without disturbing the layout", () => {
      const fn = lower(
        `const m = input.Backlog[0];
return { Kept: [{ kind: m.kind, value: m.qty * parameters.margin }] };`,
        "kernel",
      );
      expect(printHirFunction(fn, { parameters: { margin: 0.25 } })).toBe(
        `const m = input.Backlog[0];
return { Kept: [{ kind: m.kind, value: m.qty * 0.25 }] };`,
      );
    });

    it("is pure and keeps the ids and spans of the nodes it does not replace", () => {
      const fn = lower(
        "return parameters.rate * input.A[0].x + parameters.offset;",
        "lambda",
      );
      const before = JSON.stringify(fn);
      const substituted = substituteHirParameters(fn, { rate: 3 });
      expect(JSON.stringify(fn)).toBe(before);

      const idsBefore = new Map<number, string>();
      walkHir(fn.body, (node) => {
        idsBefore.set(node.id, node.kind);
      });
      const idsAfter = new Map<number, string>();
      walkHir(substituted.body, (node) => {
        idsAfter.set(node.id, node.kind);
      });
      for (const [id, kind] of idsAfter) {
        if (kind !== "numberLit") {
          expect(idsBefore.get(id)).toBe(kind);
        }
      }
      expect(printHirFunction(substituted)).toBe(
        "return 3 * input.A[0].x + parameters.offset;",
      );
    });

    it("mints fresh ids for the extra node a negative infinity needs", () => {
      const fn = lower("return parameters.floor;", "lambda");
      const substituted = substituteHirParameters(fn, {
        floor: Number.NEGATIVE_INFINITY,
      });
      const ids: number[] = [];
      walkHir(substituted.body, (node) => {
        ids.push(node.id);
      });
      expect(new Set(ids).size).toBe(ids.length);
    });
  });
});
