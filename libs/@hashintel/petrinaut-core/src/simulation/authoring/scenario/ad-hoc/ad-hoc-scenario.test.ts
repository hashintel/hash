import { describe, expect, it } from "vitest";

import { walkHir } from "../../../../hir/hir";
import { lowerScenarioToHir } from "../../../../hir/scenario";
import { scenarioSchema } from "../../../../schemas/scenario-schema";
import { compileScenario } from "../compile-scenario";
import {
  adHocOptimizationBindings,
  adHocRowKindOf,
  setAdHocRowKind,
  adHocParameterName,
  adHocPlaceKey,
  adHocSlotKey,
  adHocTargetLabel,
  cycleAdHocRowKind,
  resolveAdHocPlaceTotal,
  shareAdHocColumn,
  synthesizeAdHocOptimization,
  synthesizeAdHocScenario,
  toggleAdHocOptimize,
  unshareAdHocColumn,
} from "./ad-hoc-scenario";

import type { Scenario } from "../../../../types/sdcpn";
import type {
  AdHocColouredPlace,
  AdHocRow,
  AdHocScenarioState,
  AdHocSynthesisContext,
  AdHocValue,
} from "./ad-hoc-scenario";

/**
 * Synthesis is pinned end to end: every scenario it fabricates must compile
 * through the real `compileScenario`, because the whole design is that the
 * form is the code editor's model constrained — a fabricated scenario that
 * the compiler rejects would defeat the point.
 */

const context: AdHocSynthesisContext = {
  netParameters: [
    {
      id: "param-rate",
      name: "Rate",
      variableName: "rate",
      type: "real",
      defaultValue: "1.5",
    },
    {
      id: "param-lanes",
      name: "Lanes",
      variableName: "lanes",
      type: "integer",
      defaultValue: "4",
    },
  ],
  places: [
    {
      id: "place-pumps",
      name: "Pumps",
      colorId: "colour-pump",
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    },
    {
      id: "place-queue",
      name: "Queue",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    },
  ],
  types: [
    {
      id: "colour-pump",
      name: "Pump",
      iconSlug: "circle",
      displayColor: "#000000",
      elements: [
        { elementId: "e1", name: "pressure", type: "real" },
        { elementId: "e2", name: "worn", type: "boolean" },
      ],
    },
  ],
};

const cell = (expression: string): AdHocValue => ({
  expression,
  optimize: null,
});
const fixed = (...expressions: string[]): AdHocRow => ({
  kind: "fixed",
  cells: expressions.map(cell),
});
const template = (count: string, ...expressions: string[]): AdHocRow => ({
  kind: "template",
  count: cell(count),
  cells: expressions.map(cell),
});

const baseState = (): AdHocScenarioState => ({
  variables: [
    {
      name: "basePressure",
      type: "real",
      expression: "2 * parameters.rate",
      optimize: null,
    },
  ],
  netParameters: [
    { parameterId: "param-rate", expression: "", optimize: null },
  ],
  places: {
    "place-pumps": {
      kind: "coloured",
      variables: [
        { name: "wear", type: "boolean", expression: "i > 0", optimize: null },
      ],
      rows: [
        fixed("scenario.basePressure", "false"),
        fixed("scenario.basePressure + i", "wear"),
      ],
      sharedColumns: {},
    },
    "place-queue": {
      kind: "uncoloured",
      count: cell("parameters.lanes * 2"),
    },
  },
});

const scenarioOf = (
  outcome:
    | ReturnType<typeof synthesizeAdHocScenario>
    | ReturnType<typeof synthesizeAdHocOptimization>,
): Scenario => {
  if (!outcome.ok) {
    throw new Error(JSON.stringify(outcome.errors));
  }
  return "scenario" in outcome ? outcome.scenario : outcome.output.scenario;
};

const compiled = (
  outcome:
    | ReturnType<typeof synthesizeAdHocScenario>
    | ReturnType<typeof synthesizeAdHocOptimization>,
  scenarioParameterValues?: Record<string, number>,
) => {
  const scenario = scenarioOf(outcome);
  const result = compileScenario(
    scenario,
    lowerScenarioToHir(scenario, { adHocContext: context }),
    context.netParameters,
    context.places,
    context.types,
    scenarioParameterValues ? { scenarioParameterValues } : {},
  );
  if (!result.ok) {
    throw new Error(JSON.stringify(result.errors));
  }
  return result.result;
};

describe("synthesizeAdHocScenario", () => {
  it("fabricates a code-mode scenario the real compiler accepts", () => {
    const outcome = synthesizeAdHocScenario(baseState(), context);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.scenario.initialState.type).toBe("code");
    expect(outcome.scenario.scenarioParameters).toEqual([]);

    const result = compiled(outcome);
    expect(result.initialState["place-queue"]).toBe(8);
    // Fixed rows: `i` is the row's position in the list, `count` is 1.
    expect(result.initialState["place-pumps"]).toEqual([
      { pressure: 3, worn: false },
      { pressure: 4, worn: true },
    ]);
  });

  it("mixes fixed rows and dynamic rows within one place", () => {
    const state = baseState();
    state.places["place-pumps"] = {
      kind: "coloured",
      variables: [],
      rows: [
        fixed("100", "true"),
        template("3", "10 + i", "i === count - 1"),
        fixed("200", "false"),
      ],
      sharedColumns: {},
    };

    const result = compiled(synthesizeAdHocScenario(state, context));
    expect(result.initialState["place-pumps"]).toEqual([
      { pressure: 100, worn: true },
      { pressure: 10, worn: false },
      { pressure: 11, worn: false },
      { pressure: 12, worn: true },
      { pressure: 200, worn: false },
    ]);
  });

  it("a dynamic row's count may read a top-level Variable", () => {
    const state = baseState();
    state.variables = [
      { name: "n", type: "integer", expression: "2", optimize: null },
    ];
    state.places["place-pumps"] = {
      kind: "coloured",
      variables: [],
      rows: [template("scenario.n + 1", "i", "false")],
      sharedColumns: {},
    };

    const result = compiled(synthesizeAdHocScenario(state, context));
    expect(result.initialState["place-pumps"]).toEqual([
      { pressure: 0, worn: false },
      { pressure: 1, worn: false },
      { pressure: 2, worn: false },
    ]);
  });

  it("a dynamic row's count may read the place's Variables", () => {
    const state = baseState();
    state.variables = [];
    state.places["place-pumps"] = {
      kind: "coloured",
      variables: [
        { name: "base", type: "integer", expression: "1 + 1", optimize: null },
        {
          name: "doubled",
          type: "integer",
          expression: "base * 2",
          optimize: null,
        },
      ],
      rows: [template("doubled - 1", "i", "false")],
      sharedColumns: {},
    };

    const result = compiled(synthesizeAdHocScenario(state, context));
    // doubled = (1 + 1) * 2 = 4 → three tokens; inside each row the same
    // Variables stay per-row values.
    expect(result.initialState["place-pumps"]).toEqual([
      { pressure: 0, worn: false },
      { pressure: 1, worn: false },
      { pressure: 2, worn: false },
    ]);
  });

  it("resolves the place total through count-referenced Variables", () => {
    const state = baseState();
    state.variables = [];
    state.places["place-pumps"] = {
      kind: "coloured",
      variables: [
        { name: "base", type: "integer", expression: "3", optimize: null },
      ],
      rows: [fixed("1", "false"), template("base + 1", "i", "false")],
      sharedColumns: {},
    };
    expect(resolveAdHocPlaceTotal(state, context, "place-pumps")).toEqual({
      resolved: true,
      total: 5,
    });
  });

  it("rejects a count reading a Variable whose value uses i", () => {
    const state = baseState();
    state.variables = [];
    state.places["place-pumps"] = {
      kind: "coloured",
      variables: [
        { name: "wear", type: "real", expression: "i * 2", optimize: null },
        {
          name: "viaWear",
          type: "real",
          expression: "wear + 1",
          optimize: null,
        },
      ],
      rows: [template("viaWear", "0", "false")],
      sharedColumns: {},
    };

    const outcome = synthesizeAdHocScenario(state, context);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.errors[0]?.message).toContain("cannot vary per token");
    expect(outcome.errors[0]?.slot).toEqual({
      target: { kind: "count", placeId: "place-pumps", row: 0 },
      part: "expression",
    });
  });

  it("rejects a count reading i directly", () => {
    const state = baseState();
    state.variables = [];
    state.places["place-pumps"] = {
      kind: "coloured",
      variables: [],
      rows: [template("i + 1", "0", "false")],
      sharedColumns: {},
    };

    const outcome = synthesizeAdHocScenario(state, context);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.errors[0]?.message).toContain("the count is what defines");
  });

  it("a count may read an optimized place Variable through its parameter", () => {
    const state = baseState();
    state.variables = [];
    state.places["place-pumps"] = {
      kind: "coloured",
      variables: [
        {
          name: "batch",
          type: "integer",
          expression: "2",
          optimize: { min: "1", max: "5", scale: "linear", step: "1" },
        },
      ],
      rows: [template("batch", "i", "false")],
      sharedColumns: {},
    };

    const outcome = synthesizeAdHocOptimization(state, context);
    if (!outcome.ok) {
      throw new Error(JSON.stringify(outcome.errors));
    }
    // Preview default: batch = 2 → two tokens.
    expect(compiled(outcome).initialState["place-pumps"]).toEqual([
      { pressure: 0, worn: false },
      { pressure: 1, worn: false },
    ]);
    // The optimizer's suggestion drives the count through the generated
    // parameter.
    const overridden = compiled(outcome, {
      adhoc_var_Pumps_batch: 4,
    });
    expect(overridden.initialState["place-pumps"]).toHaveLength(4);
  });

  it("a shared column supersedes every cell in the column", () => {
    const state = baseState();
    state.places["place-pumps"] = {
      kind: "coloured",
      variables: [],
      rows: [fixed("1", "false"), template("2", "2", "false")],
      sharedColumns: { pressure: cell("7 * (i + 1)") },
    };

    const result = compiled(synthesizeAdHocScenario(state, context));
    // The shared expression evaluates per row, in the row's `i` scope.
    expect(result.initialState["place-pumps"]).toEqual([
      { pressure: 7, worn: false },
      { pressure: 7, worn: false },
      { pressure: 14, worn: false },
    ]);
  });

  it("keeps net parameter overrides and defaults apart", () => {
    const state = baseState();
    state.netParameters = [
      {
        parameterId: "param-rate",
        expression: "parameters.rate * 10",
        optimize: null,
      },
    ];
    const result = compiled(synthesizeAdHocScenario(state, context));
    expect(result.parameterValues["rate"]).toBe("15");
    expect(result.parameterValues["lanes"]).toBe("4");
  });

  it("a net parameter override may read a top-level Variable", () => {
    const state = baseState();
    state.netParameters = [
      {
        parameterId: "param-rate",
        expression: "scenario.basePressure * 2",
        optimize: null,
      },
    ];
    const result = compiled(synthesizeAdHocScenario(state, context));
    // basePressure = 2 * 1.5 = 3, so the override yields 6.
    expect(result.parameterValues["rate"]).toBe("6");
  });

  it("rejects a per-place variable that shadows a top-level one", () => {
    const state = baseState();
    const place = state.places["place-pumps"];
    if (place?.kind !== "coloured") {
      throw new Error("fixture should be coloured");
    }
    place.variables.push({
      name: "basePressure",
      type: "real",
      expression: "1",
      optimize: null,
    });

    const outcome = synthesizeAdHocScenario(state, context);
    expect(outcome).toMatchObject({ ok: false });
    if (outcome.ok) {
      return;
    }
    expect(outcome.errors[0]?.message).toContain("shadows");
    expect(outcome.errors[0]?.slot).toEqual({
      target: { kind: "variable", placeId: "place-pumps", index: 1 },
      part: "name",
    });
  });

  it("an empty expression synthesizes as the slot's neutral value", () => {
    const state = baseState();
    const place = state.places["place-pumps"];
    if (place?.kind !== "coloured") {
      throw new Error("fixture should be coloured");
    }
    // Empty real cell -> 0, empty boolean cell -> false.
    place.rows[0]!.cells[0] = { expression: "  ", optimize: null };
    place.rows[0]!.cells[1] = { expression: "", optimize: null };
    // Empty dynamic-row count -> 1 token.
    place.rows[1] = template("", "1", "false");
    // Empty per-place variable -> its type's neutral (boolean false).
    place.variables[0] = {
      name: "wear",
      type: "boolean",
      expression: "",
      optimize: null,
    };
    // Empty uncoloured count -> 0.
    state.places["place-queue"] = { kind: "uncoloured", count: cell("") };

    const outcome = synthesizeAdHocScenario(state, context);
    expect(outcome.ok).toBe(true);
    const result = compiled(outcome);
    expect(result.initialState["place-queue"]).toBe(0);
    expect(result.initialState["place-pumps"]).toEqual([
      { pressure: 0, worn: false },
      { pressure: 1, worn: false },
    ]);
  });

  it("an empty net parameter override still keeps the default", () => {
    const state = baseState();
    state.netParameters = [
      { parameterId: "param-rate", expression: "", optimize: null },
    ];
    const outcome = synthesizeAdHocScenario(state, context);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.scenario.parameterOverrides).toEqual({});
    }
  });

  it("rejects two participating places sharing a name", () => {
    const twin: AdHocSynthesisContext = {
      ...context,
      places: [
        ...context.places,
        { ...context.places[1]!, id: "place-queue-b", name: "Queue" },
      ],
    };
    const state = baseState();
    state.places["place-queue-b"] = {
      kind: "uncoloured",
      count: cell("7"),
    };

    const outcome = synthesizeAdHocScenario(state, twin);
    expect(outcome).toMatchObject({ ok: false });
    if (outcome.ok) {
      return;
    }
    expect(outcome.errors[0]?.message).toContain('named "Queue"');
  });

  it("ignores a shared column whose element no longer exists", () => {
    const state = baseState();
    const place = state.places["place-pumps"];
    if (place?.kind !== "coloured") {
      throw new Error("fixture should be coloured");
    }
    place.sharedColumns["renamed_away"] = cell("1");

    const result = compiled(synthesizeAdHocScenario(state, context));
    expect(result.initialState["place-pumps"]).toEqual([
      { pressure: 3, worn: false },
      { pressure: 4, worn: true },
    ]);
  });

  it("rejects reserved and malformed variable names", () => {
    const state = baseState();
    state.variables.push(
      { name: "scenario", type: "real", expression: "1", optimize: null },
      { name: "2fast", type: "real", expression: "1", optimize: null },
      // A prototype-polluting property name never reaches generated code.
      { name: "__proto__", type: "real", expression: "1", optimize: null },
    );
    const outcome = synthesizeAdHocScenario(state, context);
    expect(outcome).toMatchObject({ ok: false });
    if (outcome.ok) {
      return;
    }
    expect(outcome.errors).toHaveLength(3);
  });
});

describe("synthesizeAdHocOptimization", () => {
  const optimizedState = (): AdHocScenarioState => {
    const state = baseState();
    const pumps = state.places["place-pumps"];
    if (pumps?.kind !== "coloured") {
      throw new Error("fixture should be coloured");
    }
    // One optimized entity of each carrier kind.
    pumps.rows[0]!.cells[0] = {
      expression: "scenario.basePressure",
      optimize: { min: "0.5", max: "parameters.lanes * 2", scale: "linear" },
    };
    pumps.rows.push({
      kind: "template",
      count: {
        expression: "2",
        optimize: { min: "0", max: "6", scale: "linear" },
      },
      cells: [cell("1"), cell("false")],
    });
    state.variables[0]!.optimize = { min: "1", max: "10", scale: "log" };
    state.netParameters[0]!.optimize = {
      min: "0.1",
      max: "2",
      scale: "linear",
    };
    state.places["place-queue"] = {
      kind: "uncoloured",
      count: {
        expression: "parameters.lanes * 2",
        optimize: { min: "0", max: "20", scale: "linear" },
      },
    };
    return state;
  };

  it("generates deterministic parameters, fields, and references", () => {
    const outcome = synthesizeAdHocOptimization(optimizedState(), context);
    expect(outcome.ok ? "ok" : JSON.stringify(outcome.errors)).toBe("ok");
    if (!outcome.ok) {
      return;
    }

    const identifiers = outcome.output.scenario.scenarioParameters
      .map((parameter) => parameter.identifier)
      .sort();
    expect(identifiers).toEqual([
      "adhoc_Pumps_r0_pressure",
      "adhoc_count_Pumps_r2",
      "adhoc_count_Queue",
      "adhoc_param_rate",
      "adhoc_var_net_basePressure",
    ]);

    const bindings = adHocOptimizationBindings(outcome.output.optimizedFields);
    expect(bindings["adhoc_count_Pumps_r2"]).toEqual({
      kind: "optimize",
      domain: {
        kind: "integer",
        minimum: 0,
        maximum: 6,
        step: 1,
        scale: "linear",
      },
    });
    expect(bindings["adhoc_Pumps_r0_pressure"]).toEqual({
      kind: "optimize",
      domain: { kind: "continuous", minimum: 0.5, maximum: 8, scale: "linear" },
    });

    // Each field labels its source in the attribution notation.
    const labels = new Map(
      outcome.output.optimizedFields.map((field) => [
        field.parameterName,
        field.label,
      ]),
    );
    expect(labels.get("adhoc_Pumps_r0_pressure")).toBe(
      "Pumps › item 0 › pressure",
    );
    expect(labels.get("adhoc_count_Pumps_r2")).toBe("Pumps › item 2 › count");
    expect(labels.get("adhoc_count_Queue")).toBe("Queue › count");
    expect(labels.get("adhoc_var_net_basePressure")).toBe("basePressure");
    expect(labels.get("adhoc_param_rate")).toBe("Rate");

    // The optimized net parameter's override routes through the reference.
    expect(outcome.output.scenario.parameterOverrides["param-rate"]).toBe(
      "scenario.adhoc_param_rate",
    );
  });

  it("compiles with suggested values applied to every generated parameter", () => {
    const result = compiled(
      synthesizeAdHocOptimization(optimizedState(), context),
      {
        adhoc_Pumps_r0_pressure: 5.5,
        adhoc_count_Pumps_r2: 3,
        adhoc_count_Queue: 12,
        adhoc_param_rate: 0.25,
        adhoc_var_net_basePressure: 7,
      },
    );
    expect(result.parameterValues["rate"]).toBe("0.25");
    expect(result.initialState["place-queue"]).toBe(12);
    const pumps = result.initialState["place-pumps"];
    if (!Array.isArray(pumps)) {
      throw new Error("expected token rows");
    }
    expect(pumps).toHaveLength(5);
    expect(pumps[0]).toEqual({ pressure: 5.5, worn: false });
    // The non-optimized second row follows the optimized Variable.
    expect(pumps[1]).toEqual({ pressure: 8, worn: true });
    // The optimized template count produced three tokens.
    expect(pumps.slice(2)).toEqual([
      { pressure: 1, worn: false },
      { pressure: 1, worn: false },
      { pressure: 1, worn: false },
    ]);
  });

  it("compiles standalone with defaults previewing the typed values", () => {
    const outcome = synthesizeAdHocOptimization(optimizedState(), context);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    const byName = new Map(
      outcome.output.scenario.scenarioParameters.map((parameter) => [
        parameter.identifier,
        parameter.default,
      ]),
    );
    // Constant expressions preview as typed: basePressure = 2 * 1.5, the
    // queue count = 4 * 2, the template count = 2, rate's default = 1.5.
    expect(byName.get("adhoc_var_net_basePressure")).toBe(3);
    expect(byName.get("adhoc_count_Queue")).toBe(8);
    expect(byName.get("adhoc_count_Pumps_r2")).toBe(2);
    expect(byName.get("adhoc_param_rate")).toBe(1.5);
  });

  it("an optimized shared column emits one parameter and mutes its cells", () => {
    const state = baseState();
    const pumps = state.places["place-pumps"];
    if (pumps?.kind !== "coloured") {
      throw new Error("fixture should be coloured");
    }
    // The cell's own toggle is on, but the shared column supersedes it.
    pumps.rows[0]!.cells[0] = {
      expression: "11",
      optimize: { min: "0", max: "1", scale: "linear" },
    };
    pumps.sharedColumns["pressure"] = {
      expression: "5",
      optimize: { min: "2", max: "9", scale: "linear" },
    };

    const outcome = synthesizeAdHocOptimization(state, context);
    expect(outcome.ok ? "ok" : JSON.stringify(outcome.errors)).toBe("ok");
    if (!outcome.ok) {
      return;
    }
    const identifiers = outcome.output.scenario.scenarioParameters.map(
      (parameter) => parameter.identifier,
    );
    expect(identifiers).toContain("adhoc_Pumps_col_pressure");
    expect(identifiers).not.toContain("adhoc_Pumps_r0_pressure");
    const columnField = outcome.output.optimizedFields.find(
      (field) => field.parameterName === "adhoc_Pumps_col_pressure",
    );
    expect(columnField?.label).toBe("Pumps › pressure");

    const result = compiled(outcome, { adhoc_Pumps_col_pressure: 6 });
    const pumpTokens = result.initialState["place-pumps"];
    if (!Array.isArray(pumpTokens)) {
      throw new Error("expected token rows");
    }
    expect(pumpTokens.map((token) => token["pressure"])).toEqual([6, 6]);
  });

  it("rejects a bound that references an optimized entity", () => {
    const state = optimizedState();
    state.netParameters[0]!.optimize = {
      min: "scenario.basePressure",
      max: "10",
      scale: "linear",
    };
    const outcome = synthesizeAdHocOptimization(state, context);
    expect(outcome).toMatchObject({ ok: false });
    if (outcome.ok) {
      return;
    }
    const boundError = outcome.errors.find((error) =>
      error.message.includes("itself optimized"),
    );
    expect(boundError).toBeDefined();
    expect(boundError?.slot.part).toBe("min");
  });

  it("rejects non-constant, inverted, and log-invalid bounds", () => {
    const state = optimizedState();
    const pumps = state.places["place-pumps"];
    if (pumps?.kind !== "coloured") {
      throw new Error("fixture should be coloured");
    }
    pumps.rows[0]!.cells[0]!.optimize = {
      min: "nope",
      max: "1",
      scale: "linear",
    };
    state.variables[0]!.optimize = { min: "10", max: "1", scale: "linear" };
    state.netParameters[0]!.optimize = { min: "0", max: "2", scale: "log" };

    const outcome = synthesizeAdHocOptimization(state, context);
    expect(outcome).toMatchObject({ ok: false });
    if (outcome.ok) {
      return;
    }
    const messages = outcome.errors.map((error) => error.message).join("\n");
    expect(messages).toContain("nope");
    expect(messages).toContain("maximum above its minimum");
    expect(messages).toContain("positive minimum");
  });

  it("an override may read an optimized Variable through its generated parameter", () => {
    const state = baseState();
    state.variables[0]!.optimize = { min: "1", max: "10", scale: "linear" };
    state.netParameters = [
      {
        parameterId: "param-rate",
        expression: "scenario.basePressure * 2",
        optimize: null,
      },
    ];

    const result = compiled(synthesizeAdHocOptimization(state, context), {
      adhoc_var_net_basePressure: 4,
    });
    expect(result.parameterValues["rate"]).toBe("8");
  });

  it("rejects integer domains the manifest schema would reject", () => {
    const state = baseState();
    state.places["place-queue"] = {
      kind: "uncoloured",
      count: {
        expression: "4",
        optimize: { min: "2", max: "9", step: "3", scale: "linear" },
      },
    };
    const outcome = synthesizeAdHocOptimization(state, context);
    expect(outcome).toMatchObject({ ok: false });
    if (outcome.ok) {
      return;
    }
    expect(outcome.errors[0]?.message).toContain("divides its range");

    state.places["place-queue"] = {
      kind: "uncoloured",
      count: {
        expression: "4",
        optimize: { min: "2", max: "10", step: "2", scale: "log" },
      },
    };
    const logOutcome = synthesizeAdHocOptimization(state, context);
    expect(logOutcome).toMatchObject({ ok: false });
    if (logOutcome.ok) {
      return;
    }
    expect(logOutcome.errors[0]?.message).toContain("step of 1");
  });

  it("rounds an integer parameter's preview default", () => {
    const state = baseState();
    state.places["place-queue"] = {
      kind: "uncoloured",
      count: {
        expression: "parameters.rate * 3",
        optimize: { min: "0", max: "20", scale: "linear" },
      },
    };
    const outcome = synthesizeAdHocOptimization(state, context);
    expect(outcome.ok ? "ok" : JSON.stringify(outcome.errors)).toBe("ok");
    if (!outcome.ok) {
      return;
    }
    // rate defaults to 1.5, so the expression evaluates to 4.5.
    const parameter = outcome.output.scenario.scenarioParameters.find(
      (candidate) => candidate.identifier === "adhoc_count_Queue",
    );
    expect(parameter?.default).toBe(5);
  });

  it("rejects optimizing a string-typed cell", () => {
    const withString: AdHocSynthesisContext = {
      ...context,
      types: [
        {
          ...context.types[0]!,
          elements: [
            ...context.types[0]!.elements,
            { elementId: "e3", name: "label", type: "string" },
          ],
        },
      ],
    };
    const state = baseState();
    const pumps = state.places["place-pumps"];
    if (pumps?.kind !== "coloured") {
      throw new Error("fixture should be coloured");
    }
    pumps.rows[0]!.cells.push({
      expression: '"a"',
      optimize: { min: "0", max: "1", scale: "linear" },
    });
    pumps.rows[1]!.cells.push(cell('"b"'));

    const outcome = synthesizeAdHocOptimization(state, withString);
    expect(outcome).toMatchObject({ ok: false });
    if (outcome.ok) {
      return;
    }
    expect(outcome.errors[0]?.message).toContain("cannot be optimized");
  });
});

describe("state transitions", () => {
  it("toggling Optimize never touches the expression and restores bounds", () => {
    const start = cell("42");
    const on = toggleAdHocOptimize(start, true);
    expect(on.expression).toBe("42");
    expect(on.optimize).toEqual({ min: "0", max: "1", scale: "linear" });

    const tuned = {
      ...on,
      optimize: { min: "5", max: "9", scale: "log" as const },
    };
    const off = toggleAdHocOptimize(tuned, false);
    expect(off.expression).toBe("42");
    expect(off.optimize).toBeNull();

    const backOn = toggleAdHocOptimize(off, true);
    expect(backOn.optimize).toEqual({ min: "5", max: "9", scale: "log" });
  });

  it("the gutter cycle keeps the count across Fixed → Dynamic → Optimized → Fixed", () => {
    const start: AdHocRow = {
      kind: "fixed",
      cells: [cell("1"), cell("false")],
    };

    const dynamic = cycleAdHocRowKind(start);
    if (dynamic.kind !== "template") {
      throw new Error("expected a dynamic row");
    }
    expect(dynamic.count).toEqual({ expression: "1", optimize: null });

    const edited: AdHocRow = {
      ...dynamic,
      count: { expression: "scenario.n", optimize: null },
    };
    const optimized = cycleAdHocRowKind(edited);
    if (optimized.kind !== "template") {
      throw new Error("expected a dynamic row");
    }
    expect(optimized.count.expression).toBe("scenario.n");
    expect(optimized.count.optimize).toEqual({
      min: "0",
      max: "10",
      scale: "linear",
    });

    const backToFixed = cycleAdHocRowKind(optimized);
    if (backToFixed.kind !== "fixed") {
      throw new Error("expected a fixed row");
    }
    expect(backToFixed.cells).toBe(start.cells);
    expect(backToFixed.retainedCount?.expression).toBe("scenario.n");
    expect(backToFixed.retainedCount?.optimize).toBeNull();
    expect(backToFixed.retainedCount?.retainedOptimize).toEqual({
      min: "0",
      max: "10",
      scale: "linear",
    });

    // Cycling again restores the retained count, Optimize off.
    const around = cycleAdHocRowKind(backToFixed);
    if (around.kind !== "template") {
      throw new Error("expected a dynamic row");
    }
    expect(around.count.expression).toBe("scenario.n");
    expect(around.count.optimize).toBeNull();
  });

  it("sets a row's kind directly with the same retention as the cycle", () => {
    const start: AdHocRow = { kind: "fixed", cells: [cell("1")] };
    expect(adHocRowKindOf(start)).toBe("fixed");

    const optimized = setAdHocRowKind(start, "optimized");
    if (optimized.kind !== "template") {
      throw new Error("expected a dynamic row");
    }
    expect(adHocRowKindOf(optimized)).toBe("optimized");
    expect(optimized.count.optimize).toEqual({
      min: "0",
      max: "10",
      scale: "linear",
    });

    const edited: AdHocRow = {
      ...optimized,
      count: { ...optimized.count, expression: "scenario.n" },
    };
    const backToFixed = setAdHocRowKind(edited, "fixed");
    if (backToFixed.kind !== "fixed") {
      throw new Error("expected a fixed row");
    }
    expect(backToFixed.retainedCount?.expression).toBe("scenario.n");

    const dynamic = setAdHocRowKind(backToFixed, "dynamic");
    if (dynamic.kind !== "template") {
      throw new Error("expected a dynamic row");
    }
    expect(dynamic.count.expression).toBe("scenario.n");
    expect(dynamic.count.optimize).toBeNull();
    // Same kind is a no-op.
    expect(setAdHocRowKind(dynamic, "dynamic")).toBe(dynamic);
  });

  it("the cycle skips the optimized stage when Optimize is unavailable", () => {
    const start: AdHocRow = { kind: "fixed", cells: [cell("1")] };
    const dynamic = cycleAdHocRowKind(start, false);
    expect(dynamic.kind).toBe("template");
    const back = cycleAdHocRowKind(dynamic, false);
    expect(back.kind).toBe("fixed");
    if (back.kind === "fixed") {
      expect(back.retainedCount?.optimize).toBeNull();
    }
  });

  it("sharing seeds from row one, un-sharing retains, re-sharing restores", () => {
    const place: AdHocColouredPlace = {
      kind: "coloured",
      variables: [],
      rows: [fixed("11", "false"), fixed("22", "true")],
      sharedColumns: {},
    };

    const shared = shareAdHocColumn(place, "pressure", 0);
    expect(shared.sharedColumns["pressure"]?.expression).toBe("11");
    // Cells are untouched underneath.
    expect(shared.rows[1]!.cells[0]!.expression).toBe("22");

    const edited: AdHocColouredPlace = {
      ...shared,
      sharedColumns: { pressure: cell("99") },
    };
    const released = unshareAdHocColumn(edited, "pressure");
    expect(released.sharedColumns["pressure"]).toBeUndefined();
    expect(released.rows[0]!.cells[0]!.expression).toBe("11");

    const reshared = shareAdHocColumn(released, "pressure", 0);
    expect(reshared.sharedColumns["pressure"]?.expression).toBe("99");
  });
});

describe("resolveAdHocPlaceTotal", () => {
  it("resolves fixed rows and constant dynamic counts to a number", () => {
    const state = baseState();
    state.variables.push({
      name: "n",
      type: "integer",
      expression: "3",
      optimize: null,
    });
    state.places["place-pumps"] = {
      kind: "coloured",
      variables: [],
      rows: [
        fixed("1", "false"),
        template("scenario.n + 1", "i", "false"),
        fixed("2", "true"),
      ],
      sharedColumns: {},
    };
    expect(resolveAdHocPlaceTotal(state, context, "place-pumps")).toEqual({
      resolved: true,
      total: 6,
    });
    expect(resolveAdHocPlaceTotal(state, context, "place-queue")).toEqual({
      resolved: true,
      total: 8,
    });
  });

  it("prints unresolved parts when a count is optimized or depends on one", () => {
    const state = baseState();
    state.variables = [
      {
        name: "n",
        type: "integer",
        expression: "3",
        optimize: { min: "0", max: "12", scale: "linear" },
      },
    ];
    state.places["place-pumps"] = {
      kind: "coloured",
      variables: [],
      rows: [
        fixed("1", "false"),
        template("scenario.n", "i", "false"),
        {
          kind: "template",
          count: {
            expression: "4",
            optimize: { min: "0", max: "10", scale: "linear" },
          },
          cells: [cell("1"), cell("false")],
        },
      ],
      sharedColumns: {},
    };
    expect(resolveAdHocPlaceTotal(state, context, "place-pumps")).toEqual({
      resolved: false,
      text: "1 + scenario.n + 0 … 10",
    });
  });

  it("treats an absent place as empty", () => {
    expect(resolveAdHocPlaceTotal(baseState(), context, "no-such")).toEqual({
      resolved: true,
      total: 0,
    });
  });
});

describe("slot keys and labels", () => {
  it("slot keys are stable and path-safe", () => {
    expect(
      adHocSlotKey({
        target: { kind: "cell", placeId: "place-pumps", row: 2, column: 1 },
        part: "expression",
      }),
    ).toBe("cell_place-2d-pumps_2_1.expression");
    expect(
      adHocSlotKey({
        target: { kind: "variable", placeId: null, index: 0 },
        part: "min",
      }),
    ).toBe("var_net_0.min");
    // A place literally identified "net" cannot collide with the top-level
    // sentinel, and separators in ids are escaped without `%` or `_` so the
    // key survives Monaco's URI normalization.
    expect(
      adHocSlotKey({
        target: { kind: "variable", placeId: "net", index: 0 },
        part: "min",
      }),
    ).toBe("var_pl_net_0.min");
    expect(
      adHocSlotKey({
        target: { kind: "count", placeId: "a.b/c_d", row: null },
        part: "expression",
      }),
    ).toBe("count_a-2e-b-2f-c-5f-d.expression");
  });

  it("labels targets in the attribution notation", () => {
    const state = baseState();
    expect(
      adHocTargetLabel(
        { kind: "cell", placeId: "place-pumps", row: 0, column: 0 },
        state,
        context,
      ),
    ).toBe("Pumps › item 0 › pressure");
    expect(
      adHocTargetLabel(
        { kind: "variable", placeId: "place-pumps", index: 0 },
        state,
        context,
      ),
    ).toBe("Pumps › wear");
    expect(
      adHocTargetLabel(
        { kind: "netParameter", parameterId: "param-rate" },
        state,
        context,
      ),
    ).toBe("Rate");
  });
});

describe("adHocPlaceKey", () => {
  it("disambiguates duplicate place names by ordinal", () => {
    const places = [
      { ...context.places[1]!, id: "queue-a", name: "Queue" },
      { ...context.places[1]!, id: "queue-b", name: "Queue" },
    ];
    expect(adHocPlaceKey(places, "queue-a")).toBe("Queue");
    expect(adHocPlaceKey(places, "queue-b")).toBe("Queue~2");
    expect(adHocParameterName.count("Queue~2", 3)).toBe(
      "adhoc_count_Queue_2_r3",
    );
    expect(adHocParameterName.column("Queue", "size")).toBe(
      "adhoc_Queue_col_size",
    );
  });
});

describe("exposed variables", () => {
  it("emits a scenario parameter the run can override", () => {
    const state = baseState();
    state.variables = [{ ...state.variables[0]!, exposed: true }];
    const outcome = synthesizeAdHocScenario(state, context);
    expect(scenarioOf(outcome).scenarioParameters).toEqual([
      { type: "real", identifier: "base_pressure", default: 3 },
    ]);
    const byDefault = compiled(outcome);
    expect(byDefault.initialState["place-pumps"]).toEqual([
      { pressure: 3, worn: false },
      { pressure: 4, worn: true },
    ]);
    const overridden = compiled(outcome, { base_pressure: 10 });
    expect(overridden.initialState["place-pumps"]).toEqual([
      { pressure: 10, worn: false },
      { pressure: 11, worn: true },
    ]);
  });

  it("requires a constant expression", () => {
    const state = baseState();
    state.variables = [
      {
        name: "basePressure",
        type: "real",
        expression: "wear + 1",
        optimize: null,
        exposed: true,
      },
    ];
    const outcome = synthesizeAdHocScenario(state, context);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.errors[0]?.message).toContain("must resolve to a constant");
  });

  it("optimize wins over exposed in an optimization synthesis", () => {
    const state = baseState();
    state.variables = [
      {
        ...state.variables[0]!,
        exposed: true,
        optimize: { min: "0", max: "10", scale: "linear" },
      },
    ];
    const optimization = synthesizeAdHocOptimization(state, context);
    if (!optimization.ok) {
      throw new Error(JSON.stringify(optimization.errors));
    }
    expect(
      optimization.output.scenario.scenarioParameters.map(
        (parameter) => parameter.identifier,
      ),
    ).toEqual(["adhoc_var_net_basePressure"]);
    const plain = synthesizeAdHocScenario(state, context);
    expect(
      scenarioOf(plain).scenarioParameters.map(
        (parameter) => parameter.identifier,
      ),
    ).toEqual(["base_pressure"]);
  });

  it("rejects exposing a variable whose identifier is a reserved property name", () => {
    // `prototype` passes the snake_case rule and every LSP check, but keys
    // a scenario-parameter record — the schema rejects it at save. The plan
    // error keeps the failure at the form, on the name, with a rename hint.
    const state = baseState();
    state.variables = [
      {
        name: "prototype",
        type: "real",
        expression: "1",
        optimize: null,
        exposed: true,
      },
    ];
    state.places = {};
    const outcome = synthesizeAdHocScenario(state, context);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.errors[0]?.message).toContain(
      "reserved JavaScript property",
    );
    expect(outcome.errors[0]?.slot.part).toBe("name");
  });

  it("captures generated parameters from the ambient before shadowing scenario", () => {
    // Pins a lowering precondition the generated code depends on: the
    // lowerer resolves identifiers sequentially with no hoisting or TDZ, so
    // `const __adhocParam0 = scenario.<generated>` BEFORE the local
    // `const scenario = {…}` reads the ambient parameter record. A future
    // use-before-declaration pre-pass in the lowerer would break synthesis
    // — this test fails first, with a readable reason.
    const state = baseState();
    state.variables = [
      {
        ...state.variables[0]!,
        optimize: { min: "0", max: "10", scale: "linear" },
      },
    ];
    const outcome = synthesizeAdHocOptimization(state, context);
    if (!outcome.ok) {
      throw new Error(JSON.stringify(outcome.errors));
    }
    const hir = lowerScenarioToHir(outcome.output.scenario, {
      adHocContext: context,
    });
    const item = hir.initialStateCode;
    if (!item?.ok) {
      throw new Error("expected the generated code to lower");
    }
    const scenarioRefNames: string[] = [];
    walkHir(item.fn.body, (node) => {
      if (node.kind === "scenarioRef") {
        scenarioRefNames.push(node.name);
      }
    });
    expect(scenarioRefNames).toContain("adhoc_var_net_basePressure");
  });
});

describe("persisted ad-hoc scenarios", () => {
  const persistedFrom = (state: AdHocScenarioState): Scenario => {
    const synthesized = synthesizeAdHocScenario(state, context);
    if (!synthesized.ok) {
      throw new Error(JSON.stringify(synthesized.errors));
    }
    return {
      id: "scenario-adhoc",
      name: "Persisted ad-hoc",
      scenarioParameters: synthesized.scenario.scenarioParameters,
      parameterOverrides: synthesized.scenario.parameterOverrides,
      initialState: { type: "adhoc", content: state },
    };
  };

  it("round-trips the schema and compiles through synthesis", () => {
    const state = baseState();
    state.variables = [{ ...state.variables[0]!, exposed: true }];
    const persisted = persistedFrom(state);
    expect(scenarioSchema.safeParse(persisted).success).toBe(true);

    const result = compileScenario(
      persisted,
      lowerScenarioToHir(persisted, { adHocContext: context }),
      context.netParameters,
      context.places,
      context.types,
      { scenarioParameterValues: { base_pressure: 7 } },
    );
    if (!result.ok) {
      throw new Error(JSON.stringify(result.errors));
    }
    expect(result.result.initialState["place-pumps"]).toEqual([
      { pressure: 7, worn: false },
      { pressure: 8, worn: true },
    ]);
  });

  it("surfaces synthesis failures as initialState compilation errors", () => {
    const state = baseState();
    state.variables = [
      state.variables[0]!,
      { ...state.variables[0]! }, // duplicate name
    ];
    const broken: Scenario = {
      id: "scenario-broken",
      name: "Broken",
      scenarioParameters: [],
      parameterOverrides: {},
      initialState: { type: "adhoc", content: state },
    };
    const result = compileScenario(
      broken,
      lowerScenarioToHir(broken, { adHocContext: context }),
      context.netParameters,
      context.places,
      context.types,
    );
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errors[0]?.source).toBe("initialState");
    expect(result.errors[0]?.message).toContain("declared twice");
  });
});
