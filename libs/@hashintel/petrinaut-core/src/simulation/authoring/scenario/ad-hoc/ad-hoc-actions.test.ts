import { describe, expect, it } from "vitest";

import {
  adHocActionCoalescingKey,
  adHocActionInputSchemas,
  adHocPlaceStateFor,
  applyAdHocAction,
  defaultAdHocCellsFor,
  EMPTY_AD_HOC_STATE,
  emptyAdHocValue,
  newAdHocVariable,
  rewriteAdHocReference,
} from "./ad-hoc-actions";
import { synthesizeAdHocScenario } from "./ad-hoc-scenario";

import type { AdHocAction } from "./ad-hoc-actions";
import type {
  AdHocColouredPlace,
  AdHocRow,
  AdHocScenarioState,
  AdHocSynthesisContext,
  AdHocUncolouredPlace,
  AdHocValue,
} from "./ad-hoc-scenario";

const context: AdHocSynthesisContext = {
  netParameters: [
    {
      id: "param-rate",
      name: "Rate",
      variableName: "rate",
      type: "real",
      defaultValue: "1.5",
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

const baseState = (): AdHocScenarioState => ({
  variables: [{ name: "base", type: "real", expression: "1", optimize: null }],
  netParameters: [],
  places: {
    "place-pumps": {
      kind: "coloured",
      variables: [
        { name: "wear", type: "real", expression: "i * 2", optimize: null },
      ],
      rows: [fixed("wear + 1", "false"), fixed("2", "true")],
      sharedColumns: {},
    },
    "place-queue": { kind: "uncoloured", count: cell("3") },
  },
});

const apply = (
  state: AdHocScenarioState,
  action: AdHocAction,
): AdHocScenarioState => applyAdHocAction(state, context, action);

const pumps = (state: AdHocScenarioState): AdHocColouredPlace =>
  state.places["place-pumps"] as AdHocColouredPlace;
const queue = (state: AdHocScenarioState): AdHocUncolouredPlace =>
  state.places["place-queue"] as AdHocUncolouredPlace;

// -- Value edits --------------------------------------------------------------------

describe("setExpression", () => {
  it("edits a cell without touching its row's neighbours", () => {
    const before = baseState();
    const after = apply(before, {
      type: "setExpression",
      target: { kind: "cell", placeId: "place-pumps", row: 0, column: 0 },
      expression: "wear + 9",
    });
    expect(pumps(after).rows[0]!.cells[0]!.expression).toBe("wear + 9");
    expect(pumps(after).rows[0]!.cells[1]).toBe(
      pumps(before).rows[0]!.cells[1],
    );
    expect(pumps(after).rows[1]).toBe(pumps(before).rows[1]);
    // Purity: the input state is untouched.
    expect(pumps(before).rows[0]!.cells[0]!.expression).toBe("wear + 1");
  });

  it("pads a short row so the edit lands", () => {
    const state = baseState();
    const shortRow: AdHocRow = { kind: "fixed", cells: [cell("1")] };
    const withShort = {
      ...state,
      places: {
        ...state.places,
        "place-pumps": { ...pumps(state), rows: [shortRow] },
      },
    };
    const after = apply(withShort, {
      type: "setExpression",
      target: { kind: "cell", placeId: "place-pumps", row: 0, column: 1 },
      expression: "true",
    });
    expect(pumps(after).rows[0]!.cells.map((c) => c.expression)).toEqual([
      "1",
      "true",
    ]);
  });

  it("edits variables at both scopes", () => {
    const topLevel = apply(baseState(), {
      type: "setExpression",
      target: { kind: "variable", placeId: null, index: 0 },
      expression: "42",
    });
    expect(topLevel.variables[0]).toMatchObject({
      name: "base",
      type: "real",
      expression: "42",
    });

    const perPlace = apply(baseState(), {
      type: "setExpression",
      target: { kind: "variable", placeId: "place-pumps", index: 0 },
      expression: "i + i",
    });
    expect(pumps(perPlace).variables[0]!.expression).toBe("i + i");
  });

  it("upserts a net-parameter override", () => {
    const after = apply(baseState(), {
      type: "setExpression",
      target: { kind: "netParameter", parameterId: "param-rate" },
      expression: "2.5",
    });
    expect(after.netParameters).toEqual([
      { parameterId: "param-rate", expression: "2.5", optimize: null },
    ]);
    const edited = apply(after, {
      type: "setExpression",
      target: { kind: "netParameter", parameterId: "param-rate" },
      expression: "3",
    });
    expect(edited.netParameters).toHaveLength(1);
    expect(edited.netParameters[0]!.expression).toBe("3");
  });

  it("edits counts on uncoloured places and template rows", () => {
    const uncoloured = apply(baseState(), {
      type: "setExpression",
      target: { kind: "count", placeId: "place-queue", row: null },
      expression: "7",
    });
    expect(queue(uncoloured).count.expression).toBe("7");

    const withTemplate = apply(baseState(), {
      type: "setTokenRowKind",
      placeId: "place-pumps",
      row: 0,
      rowKind: "dynamic",
    });
    const counted = apply(withTemplate, {
      type: "setExpression",
      target: { kind: "count", placeId: "place-pumps", row: 0 },
      expression: "parameters.rate",
    });
    const row = pumps(counted).rows[0]!;
    expect(row.kind === "template" && row.count.expression).toBe(
      "parameters.rate",
    );
  });

  it("returns the state unchanged for a target that does not exist", () => {
    const before = baseState();
    const after = apply(before, {
      type: "setExpression",
      target: { kind: "variable", placeId: null, index: 5 },
      expression: "9",
    });
    expect(after).toBe(before);
  });
});

describe("no-op actions return the same reference", () => {
  it("covers value edits, kinds, shares, and renames", () => {
    const before = baseState();
    const noOps: AdHocAction[] = [
      {
        type: "setExpression",
        target: { kind: "cell", placeId: "place-pumps", row: 0, column: 0 },
        expression: "wear + 1",
      },
      {
        type: "toggleSelection",
        target: { kind: "variable", placeId: null, index: 0 },
        on: false,
      },
      {
        type: "setDomainField",
        target: { kind: "variable", placeId: null, index: 0 },
        field: "min",
        value: "0",
      },
      {
        type: "setTokenRowKind",
        placeId: "place-pumps",
        row: 0,
        rowKind: "fixed",
      },
      { type: "unshareColumn", placeId: "place-pumps", field: "pressure" },
      {
        type: "renameVariable",
        placeId: "place-pumps",
        index: 0,
        name: "wear",
      },
      {
        type: "setVariableType",
        placeId: null,
        index: 0,
        variableType: "real",
      },
      { type: "deleteVariable", placeId: null, index: 9 },
      { type: "deleteTokenRow", placeId: "place-pumps", row: 9 },
    ];
    for (const action of noOps) {
      expect(apply(before, action)).toBe(before);
    }

    const shared = apply(before, {
      type: "shareColumn",
      placeId: "place-pumps",
      field: "pressure",
      column: 0,
    });
    expect(
      apply(shared, {
        type: "shareColumn",
        placeId: "place-pumps",
        field: "pressure",
        column: 0,
      }),
    ).toBe(shared);
    const selected = apply(before, {
      type: "toggleSelection",
      target: { kind: "variable", placeId: null, index: 0 },
      on: true,
    });
    expect(
      apply(selected, {
        type: "toggleSelection",
        target: { kind: "variable", placeId: null, index: 0 },
        on: true,
      }),
    ).toBe(selected);
  });

  it("does not materialize a place a no-op action names", () => {
    const before = baseState();
    const after = apply(before, {
      type: "setTokenRowKind",
      placeId: "place-queue",
      row: 0,
      rowKind: "fixed",
    });
    expect(after).toBe(before);
    expect(
      apply(EMPTY_AD_HOC_STATE, {
        type: "deleteTokenRow",
        placeId: "place-pumps",
        row: 0,
      }),
    ).toBe(EMPTY_AD_HOC_STATE);
  });
});

describe("selection and domains", () => {
  it("toggles selection on with the plain defaults, counts with count defaults", () => {
    const plain = apply(baseState(), {
      type: "toggleSelection",
      target: { kind: "cell", placeId: "place-pumps", row: 0, column: 0 },
      on: true,
    });
    expect(pumps(plain).rows[0]!.cells[0]!.optimize).toEqual({
      min: "0",
      max: "1",
      scale: "linear",
    });

    const count = apply(baseState(), {
      type: "toggleSelection",
      target: { kind: "count", placeId: "place-queue", row: null },
      on: true,
    });
    expect(queue(count).count.optimize).toEqual({
      min: "0",
      max: "10",
      scale: "linear",
    });
  });

  it("retains bounds across off/on", () => {
    const target = {
      kind: "cell",
      placeId: "place-pumps",
      row: 0,
      column: 0,
    } as const;
    let state = apply(baseState(), {
      type: "toggleSelection",
      target,
      on: true,
    });
    state = apply(state, {
      type: "setDomainField",
      target,
      field: "max",
      value: "99",
    });
    state = apply(state, { type: "toggleSelection", target, on: false });
    expect(pumps(state).rows[0]!.cells[0]!.optimize).toBeNull();
    state = apply(state, { type: "toggleSelection", target, on: true });
    expect(pumps(state).rows[0]!.cells[0]!.optimize?.max).toBe("99");
  });

  it("sets domain fields only while selected, mapping scale strictly", () => {
    const target = {
      kind: "variable",
      placeId: null,
      index: 0,
    } as const;
    const unselected = apply(baseState(), {
      type: "setDomainField",
      target,
      field: "min",
      value: "5",
    });
    expect(unselected.variables[0]!.optimize).toBeNull();

    let state = apply(baseState(), {
      type: "toggleSelection",
      target,
      on: true,
    });
    state = apply(state, {
      type: "setDomainField",
      target,
      field: "scale",
      value: "log",
    });
    expect(state.variables[0]!.optimize?.scale).toBe("log");
    state = apply(state, {
      type: "setDomainField",
      target,
      field: "scale",
      value: "banana",
    });
    expect(state.variables[0]!.optimize?.scale).toBe("linear");
  });
});

// -- Variables ----------------------------------------------------------------------

describe("variable actions", () => {
  it("adds variables with fresh names at both scopes", () => {
    let state = apply(EMPTY_AD_HOC_STATE, {
      type: "addVariable",
      placeId: null,
    });
    state = apply(state, { type: "addVariable", placeId: null });
    expect(state.variables.map((variable) => variable.name)).toEqual([
      "variable1",
      "variable2",
    ]);

    const perPlace = apply(baseState(), {
      type: "addVariable",
      placeId: "place-pumps",
    });
    expect(pumps(perPlace).variables.map((variable) => variable.name)).toEqual([
      "wear",
      "variable1",
    ]);
  });

  it("renames without rewriting by default", () => {
    const state = apply(baseState(), {
      type: "renameVariable",
      placeId: "place-pumps",
      index: 0,
      name: "age",
    });
    expect(pumps(state).variables[0]!.name).toBe("age");
    expect(pumps(state).rows[0]!.cells[0]!.expression).toBe("wear + 1");
  });

  it("rewrites bare references within the owning place only", () => {
    const before = baseState();
    const withReferenceElsewhere = {
      ...before,
      variables: [
        { ...before.variables[0]!, expression: "wear + scenario.base" },
      ],
    };
    const state = apply(withReferenceElsewhere, {
      type: "renameVariable",
      placeId: "place-pumps",
      index: 0,
      name: "age",
      rewriteReferences: true,
    });
    expect(pumps(state).variables[0]!.expression).toBe("i * 2");
    expect(pumps(state).rows[0]!.cells[0]!.expression).toBe("age + 1");
    // Top-level expressions are out of a per-place variable's scope.
    expect(state.variables[0]!.expression).toBe("wear + scenario.base");
  });

  it("rewrites scenario.<name> references everywhere for a top-level rename", () => {
    const before = baseState();
    const referencing: AdHocScenarioState = {
      ...before,
      variables: [
        before.variables[0]!,
        {
          name: "derived",
          type: "real",
          expression: "scenario.base * 2",
          optimize: {
            min: "scenario.base",
            max: "scenario.base + 1",
            scale: "linear",
          },
        },
      ],
      netParameters: [
        {
          parameterId: "param-rate",
          expression: "scenario.base",
          optimize: null,
        },
      ],
      places: {
        ...before.places,
        "place-pumps": {
          ...pumps(before),
          rows: [fixed("scenario.base", "scenario.based")],
        },
        "place-queue": {
          kind: "uncoloured",
          count: cell("scenario . base"),
        },
      },
    };
    const state = apply(referencing, {
      type: "renameVariable",
      placeId: null,
      index: 0,
      name: "root",
      rewriteReferences: true,
    });
    expect(state.variables[0]!.name).toBe("root");
    expect(state.variables[1]!.expression).toBe("scenario.root * 2");
    expect(state.variables[1]!.optimize).toEqual({
      min: "scenario.root",
      max: "scenario.root + 1",
      scale: "linear",
    });
    expect(state.netParameters[0]!.expression).toBe("scenario.root");
    expect(pumps(state).rows[0]!.cells.map((c) => c.expression)).toEqual([
      "scenario.root",
      // A longer identifier that merely starts with the old name is not a
      // reference and stays put.
      "scenario.based",
    ]);
    // Whitespace around the dot still reads as a member access.
    expect(queue(state).count.expression).toBe("scenario . root");
  });

  it("rewrites the retained stores too, so later restores stay consistent", () => {
    const before = baseState();
    const withRetained: AdHocScenarioState = {
      ...before,
      variables: [
        {
          ...before.variables[0]!,
          retainedOptimize: {
            min: "scenario.base",
            max: "scenario.base + 1",
            scale: "linear",
          },
        },
      ],
      places: {
        ...before.places,
        "place-pumps": {
          ...pumps(before),
          rows: [
            {
              kind: "fixed",
              cells: [cell("0"), cell("false")],
              retainedCount: cell("scenario.base * 3"),
            },
          ],
          sharedColumns: {},
          retainedSharedColumns: { pressure: cell("scenario.base + 5") },
        },
      },
    };
    const state = apply(withRetained, {
      type: "renameVariable",
      placeId: null,
      index: 0,
      name: "root",
      rewriteReferences: true,
    });
    expect(state.variables[0]!.retainedOptimize).toEqual({
      min: "scenario.root",
      max: "scenario.root + 1",
      scale: "linear",
    });
    const row = pumps(state).rows[0]!;
    expect(row.kind === "fixed" && row.retainedCount?.expression).toBe(
      "scenario.root * 3",
    );
    expect(pumps(state).retainedSharedColumns?.pressure?.expression).toBe(
      "scenario.root + 5",
    );
  });

  it("treats $ as an ordinary identifier character in both names", () => {
    expect(
      rewriteAdHocReference("scenario.base + 1", "topLevel", "base", "$1x"),
    ).toBe("scenario.$1x + 1");
    expect(rewriteAdHocReference("wear + 2", "place", "wear", "a$$b")).toBe(
      "a$$b + 2",
    );
    expect(
      rewriteAdHocReference("scenario.$1x * 2", "topLevel", "$1x", "base"),
    ).toBe("scenario.base * 2");
  });

  it("leaves member chains rooted in another identifier alone", () => {
    expect(
      rewriteAdHocReference("foo.scenario.base", "topLevel", "base", "root"),
    ).toBe("foo.scenario.base");
    expect(
      rewriteAdHocReference("$scenario.base", "topLevel", "base", "root"),
    ).toBe("$scenario.base");
  });

  it("generates default names that avoid the other scope", () => {
    let state = apply(EMPTY_AD_HOC_STATE, {
      type: "addVariable",
      placeId: null,
    });
    state = apply(state, { type: "addVariable", placeId: "place-pumps" });
    // A per-place "variable1" would shadow the top-level one — a synthesis
    // error — so the generated name skips it.
    expect(pumps(state).variables[0]!.name).toBe("variable2");
    const outcome = synthesizeAdHocScenario(state, context);
    expect(outcome.ok).toBe(true);

    const duplicated = apply(baseState(), {
      type: "duplicateVariable",
      placeId: "place-pumps",
      index: 0,
    });
    const withTopLevelClash = apply(
      {
        ...baseState(),
        variables: [
          ...baseState().variables,
          { name: "wear2", type: "real", expression: "0", optimize: null },
        ],
      },
      { type: "duplicateVariable", placeId: "place-pumps", index: 0 },
    );
    expect(pumps(duplicated).variables[1]!.name).toBe("wear2");
    // "wear2" is taken at the top level, so the copy skips to "wear3".
    expect(pumps(withTopLevelClash).variables[1]!.name).toBe("wear3");
  });

  it("exposes and withdraws a top-level variable, identity on no-ops", () => {
    const exposed = apply(baseState(), {
      type: "setVariableExposed",
      index: 0,
      exposed: true,
    });
    expect(exposed.variables[0]!.exposed).toBe(true);
    expect(
      apply(exposed, { type: "setVariableExposed", index: 0, exposed: true }),
    ).toBe(exposed);
    const withdrawn = apply(exposed, {
      type: "setVariableExposed",
      index: 0,
      exposed: false,
    });
    expect(withdrawn.variables[0]!.exposed).toBe(false);
    const before = baseState();
    expect(
      apply(before, { type: "setVariableExposed", index: 9, exposed: true }),
    ).toBe(before);
  });

  it("sets types, deletes, and duplicates with a deduplicated name", () => {
    const typed = apply(baseState(), {
      type: "setVariableType",
      placeId: null,
      index: 0,
      variableType: "integer",
    });
    expect(typed.variables[0]!.type).toBe("integer");

    const deleted = apply(baseState(), {
      type: "deleteVariable",
      placeId: "place-pumps",
      index: 0,
    });
    expect(pumps(deleted).variables).toHaveLength(0);

    const duplicated = apply(baseState(), {
      type: "duplicateVariable",
      placeId: null,
      index: 0,
    });
    expect(duplicated.variables.map((variable) => variable.name)).toEqual([
      "base",
      "base2",
    ]);
    expect(duplicated.variables[1]!.expression).toBe("1");
  });
});

// -- Token rows ---------------------------------------------------------------------

describe("token row actions", () => {
  it("adds a row with type-appropriate default cells", () => {
    const state = apply(baseState(), {
      type: "addTokenRow",
      placeId: "place-pumps",
    });
    const added = pumps(state).rows[2]!;
    expect(added.kind).toBe("fixed");
    // Fresh cells are empty: they synthesize as the type's neutral and show
    // it grayed as a placeholder.
    expect(added.cells.map((c) => c.expression)).toEqual(["", ""]);
  });

  it("creates the place state on first touch", () => {
    const state = apply(EMPTY_AD_HOC_STATE, {
      type: "addTokenRow",
      placeId: "place-pumps",
    });
    expect(pumps(state).rows).toHaveLength(1);
  });

  it("deletes and duplicates rows", () => {
    const deleted = apply(baseState(), {
      type: "deleteTokenRow",
      placeId: "place-pumps",
      row: 0,
    });
    expect(pumps(deleted).rows).toHaveLength(1);
    expect(pumps(deleted).rows[0]!.cells[0]!.expression).toBe("2");

    const duplicated = apply(baseState(), {
      type: "duplicateTokenRow",
      placeId: "place-pumps",
      row: 0,
    });
    expect(pumps(duplicated).rows).toHaveLength(3);
    expect(pumps(duplicated).rows[1]).toEqual(pumps(duplicated).rows[0]);
    expect(pumps(duplicated).rows[1]).not.toBe(pumps(duplicated).rows[0]);
  });

  it("round-trips a row's kind with count retention", () => {
    let state = apply(baseState(), {
      type: "setTokenRowKind",
      placeId: "place-pumps",
      row: 0,
      rowKind: "dynamic",
    });
    state = apply(state, {
      type: "setExpression",
      target: { kind: "count", placeId: "place-pumps", row: 0 },
      expression: "5",
    });
    state = apply(state, {
      type: "setTokenRowKind",
      placeId: "place-pumps",
      row: 0,
      rowKind: "fixed",
    });
    expect(pumps(state).rows[0]!.kind).toBe("fixed");
    state = apply(state, {
      type: "setTokenRowKind",
      placeId: "place-pumps",
      row: 0,
      rowKind: "optimized",
    });
    const row = pumps(state).rows[0]!;
    expect(row.kind === "template" && row.count.expression).toBe("5");
    expect(row.kind === "template" && row.count.optimize).toEqual({
      min: "0",
      max: "10",
      scale: "linear",
    });
  });

  it("shares and un-shares columns through the retained-value transitions", () => {
    let state = apply(baseState(), {
      type: "shareColumn",
      placeId: "place-pumps",
      field: "pressure",
      column: 0,
    });
    expect(pumps(state).sharedColumns.pressure?.expression).toBe("wear + 1");
    state = apply(state, {
      type: "unshareColumn",
      placeId: "place-pumps",
      field: "pressure",
    });
    expect(pumps(state).sharedColumns.pressure).toBeUndefined();
    expect(pumps(state).retainedSharedColumns?.pressure?.expression).toBe(
      "wear + 1",
    );
  });
});

// -- Coalescing ---------------------------------------------------------------------

describe("adHocActionCoalescingKey", () => {
  const target = {
    kind: "cell",
    placeId: "place-pumps",
    row: 0,
    column: 1,
  } as const;

  it("keys typing bursts by slot", () => {
    const first = adHocActionCoalescingKey({
      type: "setExpression",
      target,
      expression: "a",
    });
    const second = adHocActionCoalescingKey({
      type: "setExpression",
      target,
      expression: "ab",
    });
    expect(first).toBe(second);
    expect(first).not.toBeNull();
    expect(
      adHocActionCoalescingKey({
        type: "setExpression",
        target: { ...target, column: 0 },
        expression: "ab",
      }),
    ).not.toBe(first);
    // Different parts of one value coalesce separately.
    expect(
      adHocActionCoalescingKey({
        type: "setDomainField",
        target,
        field: "min",
        value: "1",
      }),
    ).not.toBe(first);
  });

  it("never coalesces structural or reference-rewriting actions", () => {
    expect(
      adHocActionCoalescingKey({ type: "addVariable", placeId: null }),
    ).toBeNull();
    expect(
      adHocActionCoalescingKey({
        type: "setDomainField",
        target,
        field: "scale",
        value: "log",
      }),
    ).toBeNull();
    expect(
      adHocActionCoalescingKey({
        type: "renameVariable",
        placeId: null,
        index: 0,
        name: "x",
        rewriteReferences: true,
      }),
    ).toBeNull();
    expect(
      adHocActionCoalescingKey({
        type: "renameVariable",
        placeId: null,
        index: 0,
        name: "x",
      }),
    ).not.toBeNull();
  });
});

// -- Schemas ------------------------------------------------------------------------

describe("action schemas", () => {
  it("accepts every action the reducer handles and rejects unknown keys", () => {
    const parsed = adHocActionInputSchemas.setExpression.safeParse({
      target: { kind: "cell", placeId: "place-pumps", row: 0, column: 1 },
      expression: "1 + 1",
    });
    expect(parsed.success).toBe(true);

    const unknownKey = adHocActionInputSchemas.setExpression.safeParse({
      target: { kind: "cell", placeId: "place-pumps", row: 0, column: 1 },
      expression: "1",
      extra: true,
    });
    expect(unknownKey.success).toBe(false);

    const badTarget = adHocActionInputSchemas.toggleSelection.safeParse({
      target: { kind: "cell", placeId: "place-pumps", row: -1, column: 0 },
      on: true,
    });
    expect(badTarget.success).toBe(false);
  });
});

// -- Helpers ------------------------------------------------------------------------

describe("helpers", () => {
  it("rewriteAdHocReference leaves member accesses of other objects alone", () => {
    expect(
      rewriteAdHocReference("token.wear + wear", "place", "wear", "age"),
    ).toBe("token.wear + age");
    expect(
      rewriteAdHocReference("wearing + wear2", "place", "wear", "age"),
    ).toBe("wearing + wear2");
  });

  it("adHocPlaceStateFor defaults by colour", () => {
    expect(
      adHocPlaceStateFor(EMPTY_AD_HOC_STATE, context, "place-pumps"),
    ).toEqual({ kind: "coloured", variables: [], rows: [], sharedColumns: {} });
    expect(
      adHocPlaceStateFor(EMPTY_AD_HOC_STATE, context, "place-queue"),
    ).toEqual({ kind: "uncoloured", count: emptyAdHocValue("0") });
  });

  it("defaultAdHocCellsFor seeds empty cells that read as the type's neutral", () => {
    expect(
      defaultAdHocCellsFor(context, "place-pumps").map((c) => c.expression),
    ).toEqual(["", ""]);
    expect(newAdHocVariable([]).name).toBe("variable1");
  });
});

// -- End to end ---------------------------------------------------------------------

describe("building a state entirely from actions", () => {
  it("synthesizes cleanly", () => {
    const actions: AdHocAction[] = [
      { type: "addVariable", placeId: null },
      {
        type: "renameVariable",
        placeId: null,
        index: 0,
        name: "spread",
      },
      {
        type: "setExpression",
        target: { kind: "variable", placeId: null, index: 0 },
        expression: "0.5",
      },
      { type: "addTokenRow", placeId: "place-pumps" },
      {
        type: "setExpression",
        target: { kind: "cell", placeId: "place-pumps", row: 0, column: 0 },
        expression: "scenario.spread * 2",
      },
      {
        type: "toggleSelection",
        target: { kind: "cell", placeId: "place-pumps", row: 0, column: 0 },
        on: true,
      },
      {
        type: "setExpression",
        target: { kind: "count", placeId: "place-queue", row: null },
        expression: "4",
      },
    ];
    const state = actions.reduce(
      (current, action) => applyAdHocAction(current, context, action),
      EMPTY_AD_HOC_STATE,
    );
    const outcome = synthesizeAdHocScenario(state, context);
    expect(outcome.ok).toBe(true);
  });
});
