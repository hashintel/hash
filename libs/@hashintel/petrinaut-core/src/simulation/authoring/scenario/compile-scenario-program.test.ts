import { describe, expect, it, vi } from "vitest";

import * as sandboxModule from "../sandbox";
import { compileScenario } from "./compile-scenario";
import { compileScenarioProgram } from "./compile-scenario-program";

import type { Color, Parameter, Place, Scenario } from "../../../types/sdcpn";
import type { ScenarioCompilationError } from "./compile-scenario-core";

vi.mock("../sandbox", { spy: true });

// -- Helpers ------------------------------------------------------------------

const param = (
  id: string,
  variableName: string,
  defaultValue: string,
  type: Parameter["type"] = "real",
): Parameter => ({
  id,
  name: variableName,
  variableName,
  type,
  defaultValue,
});

const scenario = (overrides: Partial<Scenario> = {}): Scenario => ({
  id: "s1",
  name: "Test",
  scenarioParameters: [],
  parameterOverrides: {},
  initialState: { type: "per_place", content: {} },
  ...overrides,
});

const place = (id: string, name: string, colorId: string | null): Place => ({
  id,
  name,
  colorId,
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: 0,
  y: 0,
});

const color = (id: string): Color => ({
  id,
  name: "Type 1",
  iconSlug: "circle",
  displayColor: "#000000",
  elements: [
    { elementId: "x", name: "x", type: "real" },
    { elementId: "y", name: "y", type: "real" },
  ],
});

function buildProgram(...args: Parameters<typeof compileScenarioProgram>) {
  const outcome = compileScenarioProgram(...args);
  if (!outcome.ok) {
    throw new Error(
      `Expected the scenario program to compile, got: ${outcome.errors
        .map(({ message }) => message)
        .join("; ")}`,
    );
  }
  return outcome.program;
}

function compileErrors(
  ...args: Parameters<typeof compileScenarioProgram>
): ScenarioCompilationError[] {
  const outcome = compileScenarioProgram(...args);
  if (outcome.ok) {
    throw new Error("Expected scenario program compilation to fail");
  }
  return outcome.errors;
}

/** Runs `action` with the global `Function` constructor instrumented,
 * capturing every constructed source body. */
function captureFunctionSources<T>(action: () => T): {
  value: T;
  sources: string[];
} {
  const sources: string[] = [];
  const capture = (args: unknown[]) => {
    const body = args.at(-1);
    if (typeof body === "string") {
      sources.push(body);
    }
  };
  const original = globalThis.Function;
  globalThis.Function = new Proxy(original, {
    apply(target, thisArg, args) {
      capture(args);
      return Reflect.apply(target, thisArg, args) as unknown;
    },
    construct(target, args, newTarget) {
      capture(args);
      return Reflect.construct(target, args, newTarget) as object;
    },
  }) as FunctionConstructor;
  try {
    return { value: action(), sources };
  } finally {
    globalThis.Function = original;
  }
}

// -- Tests --------------------------------------------------------------------

describe("compileScenarioProgram", () => {
  describe("happy paths", () => {
    it("evaluates arithmetic, Math builtins and conditionals over parameters and scenario", () => {
      const program = buildProgram(
        scenario({
          scenarioParameters: [
            { type: "real", identifier: "surge", default: 2 },
            { type: "boolean", identifier: "enabled", default: 1 },
          ],
          parameterOverrides: {
            p1: "Math.sqrt(parameters.base * scenario.surge * 8)",
            p2: "scenario.enabled ? 10 : -10",
          },
          initialState: {
            type: "per_place",
            content: { place1: "Math.max(0, parameters.base - 5) * 2" },
          },
        }),
        [
          param("p1", "rate", "0"),
          param("p2", "offset", "0"),
          param("base", "base", "9"),
        ],
      );

      const outcome = program.evaluate();
      expect(outcome).toEqual({
        ok: true,
        result: {
          parameterValues: { rate: "12", offset: "10", base: "9" },
          initialState: { place1: 8 },
        },
      });
    });

    it("applies injected scenario parameter values per evaluation without leaking state", () => {
      const program = buildProgram(
        scenario({
          scenarioParameters: [
            { type: "integer", identifier: "count", default: 50 },
          ],
          parameterOverrides: { p1: "scenario.count * 2" },
          initialState: {
            type: "per_place",
            content: { place1: "scenario.count" },
          },
        }),
        [param("p1", "x", "0")],
      );

      const injected = program.evaluate({ count: 75 });
      expect(injected).toMatchObject({
        ok: true,
        result: {
          parameterValues: { x: "150" },
          initialState: { place1: 75 },
        },
      });

      const defaults = program.evaluate();
      expect(defaults).toMatchObject({
        ok: true,
        result: { parameterValues: { x: "100" }, initialState: { place1: 50 } },
      });
    });

    it("lets initial state expressions observe overridden parameter values", () => {
      const program = buildProgram(
        scenario({
          parameterOverrides: { p1: "99" },
          initialState: {
            type: "per_place",
            content: { place1: "parameters.x" },
          },
        }),
        [param("p1", "x", "1")],
      );

      const outcome = program.evaluate();
      expect(outcome).toMatchObject({
        ok: true,
        result: { initialState: { place1: 99 } },
      });
    });
  });

  describe("parity with compileScenario", () => {
    it("matches the sandboxed compiler on a representative per-place scenario", () => {
      const testScenario = scenario({
        scenarioParameters: [
          { type: "real", identifier: "demand", default: 1.5 },
          { type: "integer", identifier: "machines", default: 4 },
          { type: "ratio", identifier: "fraction", default: 0.25 },
          { type: "boolean", identifier: "boosted", default: 0 },
        ],
        parameterOverrides: {
          p1: "parameters.base * scenario.demand",
          p2: "scenario.boosted ? scenario.machines * 2 : scenario.machines",
          p3: "scenario.boosted",
          p4: "", // empty: keeps the default
          missing: "1 + 1", // unknown parameter: skipped
        },
        initialState: {
          type: "per_place",
          content: {
            place1: "Math.round(scenario.demand * 10) - 3",
            place2: "-5", // clamped to 0
            place3: "", // empty: 0 tokens
            colored: [
              [1, 2],
              [4, 5],
            ],
          },
        },
      });
      const parameters = [
        param("base", "base", "2"),
        param("p1", "rate", "2"),
        param("p2", "machines", "1", "integer"),
        param("p3", "boosted", "false", "boolean"),
        param("p4", "kept", "7"),
      ];
      const places = [place("colored", "Colored", "type1")];
      const types = [color("type1")];
      const options = { scenarioParameterValues: { demand: 2.5, boosted: 1 } };

      const sandboxed = compileScenario(
        testScenario,
        parameters,
        places,
        types,
        options,
      );
      const program = buildProgram(testScenario, parameters, places, types);

      expect(sandboxed.ok).toBe(true);
      expect(program.evaluate(options.scenarioParameterValues)).toEqual(
        sandboxed,
      );
    });

    it("matches the sandboxed compiler on code-mode initial state, including the quirks", () => {
      const testScenario = scenario({
        scenarioParameters: [
          { type: "integer", identifier: "count", default: 3 },
        ],
        initialState: {
          type: "code",
          content: `const damaged = { x: scenario.count, y: 0.5 };
return {
  Uncolored: scenario.count * 2 + 0.4,
  Colored: [damaged, { x: 1, y: 2 }, 42],
  UnknownPlace: 99,
};`,
        },
      });
      const places = [
        place("place1", "Uncolored", null),
        place("place2", "Colored", "type1"),
      ];
      const types = [color("type1")];

      const sandboxed = compileScenario(testScenario, [], places, types);
      const program = buildProgram(testScenario, [], places, types);
      const outcome = program.evaluate();

      expect(outcome).toEqual(sandboxed);
      expect(outcome).toEqual({
        ok: true,
        result: {
          parameterValues: {},
          initialState: {
            // Fractional counts are rounded; the unknown place name and the
            // non-object token (42) are silently skipped by design.
            place1: 6,
            place2: [
              { x: 3, y: 0.5 },
              { x: 1, y: 2 },
            ],
          },
        },
      });
    });

    it("matches the sandboxed compiler's evaluation-time validation errors", () => {
      const testScenario = scenario({
        scenarioParameters: [
          { type: "boolean", identifier: "enabled", default: 1 },
        ],
        parameterOverrides: {
          count: "1.5", // integer parameter: rejected
          flag: "1 + 1", // boolean parameter: rejected
        },
        initialState: {
          type: "per_place",
          content: {
            place1: "0 / 0", // NaN: rejected
            place2: "scenario.enabled", // boolean count: rejected
          },
        },
      });
      const parameters = [
        param("count", "count", "1", "integer"),
        param("flag", "flag", "true", "boolean"),
      ];

      const sandboxed = compileScenario(testScenario, parameters);
      const program = buildProgram(testScenario, parameters);

      expect(sandboxed.ok).toBe(false);
      expect(program.evaluate()).toEqual(sandboxed);
    });

    it("matches the sandboxed compiler on non-finite injected scenario parameters", () => {
      const testScenario = scenario({
        scenarioParameters: [{ type: "real", identifier: "rate", default: 1 }],
      });
      const options = { scenarioParameterValues: { rate: Number.NaN } };

      const sandboxed = compileScenario(testScenario, [], [], [], options);
      const program = buildProgram(testScenario, []);

      expect(sandboxed).toEqual({
        ok: false,
        errors: [
          {
            source: "scenarioParameter",
            itemId: "rate",
            message: 'Scenario parameter "rate" must be a finite number.',
          },
        ],
      });
      expect(program.evaluate(options.scenarioParameterValues)).toEqual(
        sandboxed,
      );
    });
  });

  describe("rejections", () => {
    it.each([
      ["dynamic import", 'import("node:fs")'],
      ["process access", "process.exit(1)"],
      ["globalThis access", 'globalThis.fetch("https://example.com")'],
      ["fetch call", 'fetch("https://example.com")'],
      ["Function constructor", '(Function("return 1"))()'],
      // eslint-disable-next-line no-template-curly-in-string -- deliberately testing template-literal rejection
      ["template-literal substitution", "`${1 + 1}`"],
      ["assignment to a global", "(Math.max = 1)"],
      ["statement sequences", "1; 2"],
    ])("rejects %s in a parameter override", (_label, expression) => {
      const errors = compileErrors(
        scenario({ parameterOverrides: { p1: expression } }),
        [param("p1", "x", "0")],
      );

      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({
        source: "parameterOverride",
        itemId: "p1",
      });
      expect(errors[0]!.message).toContain('Parameter "x"');
    });

    it("rejects loops and helper factories in code-mode initial state", () => {
      const loopErrors = compileErrors(
        scenario({
          initialState: {
            type: "code",
            content: "while (true) {}\nreturn {};",
          },
        }),
        [],
      );
      expect(loopErrors).toEqual([
        {
          source: "initialState",
          itemId: "__code__",
          // eslint-disable-next-line typescript-eslint/no-unsafe-assignment -- expect.stringContaining is typed as any
          message: expect.stringContaining("Loops are not supported"),
        },
      ]);

      const factoryErrors = compileErrors(
        scenario({
          initialState: {
            type: "code",
            content:
              "return { Colored: Array.from({ length: 3 }, () => ({ x: 1, y: 2 })) };",
          },
        }),
        [],
      );
      expect(factoryErrors[0]!.message).toContain("Initial state code:");
    });

    it("rejects redeclaring the scenario/parameters inputs, matching the sandbox", () => {
      // The sandbox declares `scenario`/`parameters` as function parameters,
      // so a `const` of the same name is a `SyntaxError` there. The HIR path
      // must reject it too instead of silently accepting a shadow.
      for (const name of ["scenario", "parameters"]) {
        const codeScenario = scenario({
          initialState: {
            type: "code",
            content: `const ${name} = 5;\nreturn { Pool: ${name} };`,
          },
        });
        const places = [place("place1", "Pool", null)];

        const programErrors = compileErrors(codeScenario, [], places);
        expect(programErrors).toHaveLength(1);
        expect(programErrors[0]).toMatchObject({
          source: "initialState",
          itemId: "__code__",
        });
        expect(programErrors[0]!.message).toContain(
          "is already declared as a scenario input",
        );

        // Parity: the sandboxed editor path rejects the same code (as a
        // thrown SyntaxError), so neither path materializes it.
        expect(compileScenario(codeScenario, [], places).ok).toBe(false);
      }
    });

    it("rejects a callback parameter that shadows an input", () => {
      const errors = compileErrors(
        scenario({
          parameterOverrides: { p1: "[1, 2].map((scenario) => scenario)[0]" },
        }),
        [param("p1", "x", "0")],
      );
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain(
        "is already declared as a scenario input",
      );
    });

    it("rejects Math.random() for determinism", () => {
      const errors = compileErrors(
        scenario({
          initialState: {
            type: "per_place",
            content: { place1: "Math.random() * 10" },
          },
        }),
        [],
      );

      expect(errors).toEqual([
        {
          source: "initialState",
          itemId: "place1",
          // eslint-disable-next-line typescript-eslint/no-unsafe-assignment -- expect.stringContaining is typed as any
          message: expect.stringContaining(
            "`Math.random()` is not available in scenario code",
          ),
        },
      ]);
    });

    it("rejects references to unknown scenario and net parameters", () => {
      const errors = compileErrors(
        scenario({
          scenarioParameters: [
            { type: "real", identifier: "known", default: 1 },
          ],
          parameterOverrides: {
            p1: "scenario.unknown_param",
            p2: "parameters.unknown",
          },
        }),
        [param("p1", "x", "0"), param("p2", "y", "0")],
      );

      expect(errors).toHaveLength(2);
      expect(errors[0]!.message).toContain("`unknown_param` does not exist");
      expect(errors[1]!.message).toContain("Unknown parameter `unknown`");
    });

    it("rejects non-scalar expression results and non-object initial state code", () => {
      const recordErrors = compileErrors(
        scenario({ parameterOverrides: { p1: "({ a: 1 })" } }),
        [param("p1", "x", "0")],
      );
      expect(recordErrors[0]!.message).toContain(
        "Scenario expressions must evaluate to a number or boolean",
      );

      const initErrors = compileErrors(
        scenario({ initialState: { type: "code", content: "return 5;" } }),
        [],
      );
      expect(initErrors[0]!.message).toContain(
        "Initial state code must return an object",
      );
    });

    it("collects one error per offending surface", () => {
      const errors = compileErrors(
        scenario({
          parameterOverrides: { p1: "process.pid", p2: "2 * 2" },
          initialState: {
            type: "per_place",
            content: { place1: "fetch()", place2: "1" },
          },
        }),
        [param("p1", "x", "0"), param("p2", "y", "0")],
      );

      expect(errors).toHaveLength(2);
      expect(errors.map(({ source, itemId }) => ({ source, itemId }))).toEqual([
        { source: "parameterOverride", itemId: "p1" },
        { source: "initialState", itemId: "place1" },
      ]);
    });
  });

  describe("security and compile-once", () => {
    it("never passes raw user text to Function — only compiler-emitted source", () => {
      const expression = "1 + 1 /* __PETRINAUT_RAW_MARKER__ */";
      const netParameters = [param("p1", "x", "0")];

      const { value: outcome, sources } = captureFunctionSources(() =>
        compileScenarioProgram(
          scenario({ parameterOverrides: { p1: expression } }),
          netParameters,
        ),
      );
      if (!outcome.ok) {
        throw new Error("Expected the scenario program to compile");
      }
      // Instantiation went through Function, but only with emitted source —
      // the raw text (identifiable by its comment) never did.
      expect(sources.length).toBeGreaterThan(0);
      expect(
        sources.some((source) => source.includes("__PETRINAUT_RAW_MARKER__")),
      ).toBe(false);
      expect(outcome.program.evaluate()).toMatchObject({
        ok: true,
        result: { parameterValues: { x: "2" } },
      });

      // Sanity check on the instrumentation: the sandboxed editor path DOES
      // receive the raw text.
      const sandboxSources = captureFunctionSources(() =>
        compileScenario(
          scenario({ parameterOverrides: { p1: expression } }),
          netParameters,
        ),
      ).sources;
      expect(
        sandboxSources.some((source) =>
          source.includes("__PETRINAUT_RAW_MARKER__"),
        ),
      ).toBe(true);
    });

    it("performs no dynamic evaluation per trial once the program is built", () => {
      const program = buildProgram(
        scenario({
          scenarioParameters: [
            { type: "integer", identifier: "count", default: 2 },
          ],
          parameterOverrides: { p1: "scenario.count * 3" },
          initialState: {
            type: "code",
            content: "return { Place: scenario.count };",
          },
        }),
        [param("p1", "x", "0")],
        [place("place1", "Place", null)],
      );

      const { sources } = captureFunctionSources(() => {
        expect(program.evaluate()).toMatchObject({ ok: true });
        expect(program.evaluate({ count: 5 })).toMatchObject({
          ok: true,
          result: { parameterValues: { x: "15" }, initialState: { place1: 5 } },
        });
      });
      expect(sources).toEqual([]);
    });

    it("never invokes the sandbox", () => {
      vi.mocked(sandboxModule.runSandboxed).mockClear();

      const program = buildProgram(
        scenario({
          parameterOverrides: { p1: "parameters.x + 1" },
          initialState: { type: "per_place", content: { place1: "2" } },
        }),
        [param("p1", "x", "0")],
      );
      expect(program.evaluate()).toMatchObject({ ok: true });
      expect(sandboxModule.runSandboxed).not.toHaveBeenCalled();

      // Sanity check: the editor path does go through the sandbox.
      compileScenario(scenario({ parameterOverrides: { p1: "1" } }), [
        param("p1", "x", "0"),
      ]);
      expect(sandboxModule.runSandboxed).toHaveBeenCalled();
    });
  });
});
