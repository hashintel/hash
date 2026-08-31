import { describe, expect, it } from "vitest";

import { orderCellsTopologically } from "./notebook-order";

import type { CellConnections, NodeRef, NotebookCell } from "./notebook-model";

const placeCell = (id: string): NotebookCell => ({
  kind: "place",
  id,
  place: {
    id,
    name: id,
    colorId: null,
    dynamicsEnabled: false,
    differentialEquationId: null,
    x: 0,
    y: 0,
  },
});

const transitionCell = (id: string): NotebookCell => ({
  kind: "transition",
  id,
  transition: {
    id,
    name: id,
    inputArcs: [],
    outputArcs: [],
    lambdaType: "stochastic",
    lambdaCode: "",
    transitionKernelCode: "",
    x: 0,
    y: 0,
  },
});

const parameterCell = (id: string): NotebookCell => ({
  kind: "parameter",
  id,
  parameter: {
    id,
    name: id,
    variableName: id,
    type: "real",
    defaultValue: "1",
  },
});

const typeCell = (id: string): NotebookCell => ({
  kind: "type",
  id,
  color: {
    id,
    name: id,
    iconSlug: "circle",
    displayColor: "#000000",
    elements: [],
  },
});

const ref = (type: NodeRef["type"], id: string): NodeRef => ({
  type,
  id,
  name: id,
});

const connections = (
  entries: Record<string, NodeRef[]>,
): Map<string, CellConnections> =>
  new Map(
    Object.entries(entries).map(([id, upstream]) => [
      id,
      { upstream, downstream: [] },
    ]),
  );

const ids = (cells: NotebookCell[]) => cells.map(({ id }) => id);

describe("orderCellsTopologically", () => {
  it("follows the supplied flow order for places and transitions", () => {
    const cells = [
      transitionCell("Move"),
      placeCell("Sink"),
      placeCell("Source"),
    ];

    expect(
      ids(
        orderCellsTopologically(cells, ["Source", "Move", "Sink"], new Map()),
      ),
    ).toEqual(["Source", "Move", "Sink"]);
  });

  it("inlines a parameter immediately before its first user", () => {
    const cells = [
      parameterCell("rate"),
      placeCell("Source"),
      transitionCell("Move"),
    ];

    const ordered = orderCellsTopologically(
      cells,
      ["Source", "Move"],
      connections({ Move: [ref("parameter", "rate")] }),
    );

    expect(ids(ordered)).toEqual(["Source", "rate", "Move"]);
  });

  it("emits a declaration only once, before its earliest user", () => {
    const cells = [
      parameterCell("rate"),
      transitionCell("First"),
      transitionCell("Second"),
    ];

    const ordered = orderCellsTopologically(
      cells,
      ["First", "Second"],
      connections({
        First: [ref("parameter", "rate")],
        Second: [ref("parameter", "rate")],
      }),
    );

    expect(ids(ordered)).toEqual(["rate", "First", "Second"]);
  });

  it("emits a declaration's own dependencies before it", () => {
    // Equation depends on a type and a parameter; a place uses the equation.
    const cells = [
      placeCell("Stock"),
      typeCell("Widget"),
      parameterCell("decayRate"),
      {
        kind: "differentialEquation" as const,
        id: "Decay",
        equation: { id: "Decay", name: "Decay", colorId: null, code: "" },
      },
    ];

    const ordered = orderCellsTopologically(
      cells,
      ["Stock"],
      connections({
        Stock: [ref("differentialEquation", "Decay")],
        Decay: [ref("type", "Widget"), ref("parameter", "decayRate")],
      }),
    );

    expect(ids(ordered)).toEqual(["Widget", "decayRate", "Decay", "Stock"]);
  });

  it("keeps unused declarations, appended at the end", () => {
    const cells = [parameterCell("unused"), placeCell("Source")];

    expect(ids(orderCellsTopologically(cells, ["Source"], new Map()))).toEqual([
      "Source",
      "unused",
    ]);
  });

  it("never drops a cell missing from the flow order", () => {
    const cells = [placeCell("Source"), placeCell("Detached")];

    expect(ids(orderCellsTopologically(cells, ["Source"], new Map()))).toEqual([
      "Source",
      "Detached",
    ]);
  });
});
