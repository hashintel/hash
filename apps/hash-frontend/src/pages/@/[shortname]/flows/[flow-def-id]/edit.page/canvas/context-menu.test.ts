import { describe, expect, it } from "vitest";

import { createFlowEditor } from "@local/hash-isomorphic-utils/flows/flow-editor";

import { actionStep, flowWith } from "../shared/step-fixtures";
import { getContextMenuItems } from "./context-menu";

import type { AddStepAt, ContextTarget } from "./context-menu";

/** Picks `actionDefinitionId` from "Insert step here" on `target`, returning the flow's steps after. */
const insertStep = (target: ContextTarget, actionDefinitionId: string) => {
  const editor = createFlowEditor(
    flowWith([
      actionStep("first"),
      actionStep("second", { runAfter: [{ stepId: "first" }] }),
    ]),
  );
  let addStep: AddStepAt | undefined;

  getContextMenuItems({
    target,
    editor,
    topLevelSteps: new Map(
      editor.getState().flowDefinition.steps.map((step) => [step.stepId, step]),
    ),
    openAddMenu: (pick) => {
      addStep = pick;
    },
    selectStep: () => {},
  })
    .find(({ id }) => id === "insert-step")
    ?.onClick?.("insert-step");
  addStep?.(actionDefinitionId, { x: 0, y: 0 });

  return new Map(
    editor.getState().flowDefinition.steps.map((step) => [step.stepId, step]),
  );
};

describe("Insert step here", () => {
  it.each<[string, ContextTarget]>([
    [
      "a line",
      { kind: "connection", connection: { from: "first", to: "second" } },
    ],
    ["a Start line", { kind: "start-line", stepId: "first" }],
  ])(
    "puts the step after an If inserted on %s on the If's Yes path, the port its line leaves",
    (_name, target) => {
      const steps = insertStep(target, "if");
      const followerId = target.kind === "connection" ? "second" : "first";

      expect(steps.get(followerId)?.runAfter).toEqual([
        { stepId: "if", outputName: "true" },
      ]);
    },
  );

  it("puts the step after a step without paths after it plainly", () => {
    const steps = insertStep(
      { kind: "connection", connection: { from: "first", to: "second" } },
      "queryEntities",
    );

    expect(steps.get("second")?.runAfter).toEqual([
      { stepId: "queryEntities" },
    ]);
  });
});
