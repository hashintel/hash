import { describe, expect, it } from "vitest";

import { actionStep, flowWith } from "../shared/step-fixtures";
import { getFlowGraph, getStepNodeId, startNodeId } from "./flow-graph";
import { collapsedForEachSize } from "./sizes";

import type { ForEachLayout } from "./flow-graph";
import type { StepDefinition } from "@local/hash-isomorphic-utils/flows/types";

const graphOf = (
  steps: StepDefinition<string>[],
  forEachLayouts = new Map<string, ForEachLayout>(),
  collapsedStepIds = new Set<string>(),
) =>
  getFlowGraph({
    flowDefinition: flowWith(steps),
    problemsByStepId: new Map(),
    forEachLayouts,
    collapsedStepIds,
  });

const linesOf = (graph: ReturnType<typeof graphOf>) =>
  graph.edges.map(({ source, target, data }) => ({
    source,
    target,
    kind: data?.kind,
  }));

describe("getFlowGraph", () => {
  it("draws a line from Start only to the top-level steps with nothing before them, by connection or data link", () => {
    const graph = graphOf([
      actionStep("first", { position: { x: 0, y: 0 } }),
      actionStep("connected", { runAfter: [{ stepId: "first" }] }),
      actionStep("fedByData", {
        inputs: {
          entities: {
            kind: "step-output",
            stepId: "first",
            outputName: "entities",
          },
        },
      }),
      actionStep("alone"),
    ]);

    expect(linesOf(graph)).toEqual([
      {
        source: getStepNodeId("first"),
        target: getStepNodeId("connected"),
        kind: "connection",
      },
      { source: startNodeId, target: getStepNodeId("first"), kind: "start" },
      { source: startNodeId, target: getStepNodeId("alone"), kind: "start" },
    ]);
    expect(
      graph.edges.find(({ data }) => data?.kind === "start"),
    ).toMatchObject({ deletable: false, selectable: false });
  });

  it("draws a for-each step as a box with its steps inside, which can't be edited, at their laid-out places", () => {
    const steps: StepDefinition<string>[] = [
      actionStep("list", { position: { x: 0, y: 0 } }),
      {
        kind: "for-each",
        stepId: "forEach",
        description: "For each supplier",
        position: { x: 300, y: 0 },
        over: { kind: "step-output", stepId: "list", outputName: "entities" },
        steps: [
          actionStep("inner1", {
            inputs: { entity: { kind: "item" } },
          }),
          actionStep("inner2", { runAfter: [{ stepId: "inner1" }] }),
        ],
        collect: { stepId: "inner2", outputName: "entities", as: "results" },
      },
    ];
    const layouts = new Map([
      [
        "forEach",
        {
          size: { width: 500, height: 120 },
          positions: new Map([
            ["inner1", { x: 16, y: 40 }],
            ["inner2", { x: 280, y: 40 }],
          ]),
        },
      ],
    ]);
    const graph = graphOf(steps, layouts);

    const box = graph.nodes.find(({ id }) => id === getStepNodeId("forEach"));
    const inner2 = graph.nodes.find(({ id }) => id === getStepNodeId("inner2"));

    expect(box).toMatchObject({
      type: "forEach",
      position: { x: 300, y: 0 },
      width: 500,
      height: 120,
    });
    expect(inner2).toMatchObject({
      parentId: getStepNodeId("forEach"),
      extent: "parent",
      position: { x: 280, y: 40 },
      draggable: false,
      deletable: false,
      connectable: false,
      data: { inner: true },
    });
    /* A box is drawn before the steps inside it, as React Flow needs. */
    expect(graph.nodes.indexOf(box!)).toBeLessThan(
      graph.nodes.indexOf(inner2!),
    );

    expect(linesOf(graph)).toEqual([
      {
        source: getStepNodeId("inner1"),
        target: getStepNodeId("inner2"),
        kind: "inner",
      },
      /* The for-each step takes its list from `list`, so runs after it, and no line from Start goes to it. */
      { source: startNodeId, target: getStepNodeId("list"), kind: "start" },
    ]);

    /* Collapsed, the box is drawn alone at its collapsed size. */
    const collapsed = graphOf(steps, layouts, new Set(["forEach"]));

    expect(collapsed.nodes.map(({ id }) => id)).toEqual([
      startNodeId,
      getStepNodeId("list"),
      getStepNodeId("forEach"),
    ]);
    expect(collapsed.nodes[2]).toMatchObject(collapsedForEachSize);
    expect(linesOf(collapsed)).toEqual([
      { source: startNodeId, target: getStepNodeId("list"), kind: "start" },
    ]);
  });

  it("draws a step inside a box running after a step outside it, and so no line from Start to the box", () => {
    const graph = graphOf([
      actionStep("first", { position: { x: 0, y: 0 } }),
      {
        kind: "for-each",
        stepId: "forEach",
        description: "For each supplier",
        position: { x: 300, y: 0 },
        over: { kind: "flow-input", inputName: "suppliers" },
        steps: [actionStep("inner", { runAfter: [{ stepId: "first" }] })],
        collect: { stepId: "inner", outputName: "entities", as: "results" },
      },
    ]);

    expect(linesOf(graph)).toEqual([
      {
        source: getStepNodeId("first"),
        target: getStepNodeId("inner"),
        kind: "inner",
      },
      { source: startNodeId, target: getStepNodeId("first"), kind: "start" },
    ]);
  });

  it("puts Start a gap to the left of the leftmost step with nothing before it", () => {
    const graph = graphOf([
      actionStep("later", { position: { x: 500, y: 300 } }),
      actionStep("first", { position: { x: 100, y: 80 } }),
      actionStep("after", {
        position: { x: -400, y: 0 },
        runAfter: [{ stepId: "later" }],
      }),
    ]);

    expect(graph.nodes.find(({ id }) => id === startNodeId)?.position).toEqual({
      x: 100 - 200 - 64,
      y: 80,
    });
  });
});
