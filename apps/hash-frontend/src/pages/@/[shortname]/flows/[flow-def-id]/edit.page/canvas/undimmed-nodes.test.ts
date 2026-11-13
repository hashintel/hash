import { describe, expect, it } from "vitest";

import { actionStep, flowWith } from "../shared/step-fixtures";
import { getFlowGraph, getStepNodeId } from "./flow-graph";
import { getUndimmedNodeIds } from "./undimmed-nodes";

import type {
  ForEachStepDefinition,
  StepDefinition,
} from "@local/hash-isomorphic-utils/flows/types";

const forEach: ForEachStepDefinition<string> = {
  kind: "for-each",
  stepId: "each",
  description: "",
  over: { kind: "flow-input", inputName: "urls" },
  steps: [actionStep("fetch"), actionStep("save")],
  collect: { stepId: "save", outputName: "file", as: "files" },
};

const steps: StepDefinition<string>[] = [
  actionStep("find"),
  forEach,
  actionStep("report"),
];

const undimmed = (stepIds: string[], collapsedStepIds = new Set<string>()) =>
  [
    ...getUndimmedNodeIds({
      stepIds,
      steps,
      collapsedStepIds,
      nodes: getFlowGraph({
        flowDefinition: flowWith(steps),
        problemsByStepId: new Map(),
        forEachLayouts: new Map(),
        collapsedStepIds,
        getItemName: () => "item",
      }).nodes,
    }),
  ].toSorted();

const nodeIds = (...stepIds: string[]) => stepIds.map(getStepNodeId).toSorted();

describe("getUndimmedNodeIds", () => {
  it("keeps the nodes of the steps named, and no others", () => {
    expect(undimmed(["find", "report"])).toEqual(nodeIds("find", "report"));
    expect(undimmed([])).toEqual([]);
  });

  it("keeps the steps drawn inside a for-each step with it", () => {
    expect(undimmed(["each"])).toEqual(nodeIds("each", "fetch", "save"));
  });

  it("keeps a step inside a for-each step without the for-each step or the steps beside it", () => {
    expect(undimmed(["fetch"])).toEqual(nodeIds("fetch"));
  });

  it("keeps a collapsed for-each step for a step inside it, which isn't drawn", () => {
    expect(undimmed(["fetch", "find"], new Set(["each"]))).toEqual(
      nodeIds("each", "find"),
    );
  });
});
