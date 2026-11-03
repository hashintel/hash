import { describe, expect, it } from "vitest";

import { actionStep } from "../shared/step-fixtures";
import { getStepsTree } from "./steps-tree";

import type { StepsTreeItem } from "./steps-tree";
import type { StepDefinition } from "@local/hash-isomorphic-utils/flows/types";

const outline = (tree: StepsTreeItem[]): unknown[] =>
  tree.map(({ step, children }) =>
    children ? { [step.stepId]: outline(children) } : step.stepId,
  );

describe("getStepsTree", () => {
  it("lists steps in the order they run, by connections and data links, then left to right", () => {
    const steps: StepDefinition<string>[] = [
      actionStep("usesB", {
        position: { x: 0, y: 0 },
        inputs: {
          entities: {
            kind: "step-output",
            stepId: "b",
            outputName: "entities",
          },
        },
      }),
      actionStep("b", {
        position: { x: 600, y: 0 },
        runAfter: [{ stepId: "a" }],
      }),
      actionStep("right", { position: { x: 300, y: 0 } }),
      actionStep("a", { position: { x: 100, y: 200 } }),
      actionStep("left", { position: { x: 100, y: 0 } }),
    ];

    expect(outline(getStepsTree(steps))).toEqual([
      "left",
      "a",
      "right",
      "b",
      "usesB",
    ]);
  });

  it("puts steps in a cycle after the rest, as listed", () => {
    expect(
      outline(
        getStepsTree([
          actionStep("loop1", { runAfter: [{ stepId: "loop2" }] }),
          actionStep("loop2", { runAfter: [{ stepId: "loop1" }] }),
          actionStep("free"),
        ]),
      ),
    ).toEqual(["free", "loop1", "loop2"]);
  });

  it("makes each for-each step a group of the steps inside it, in the order they run", () => {
    const tree = getStepsTree([
      {
        kind: "for-each",
        stepId: "forEach",
        description: "",
        runAfter: [{ stepId: "first" }],
        over: { kind: "flow-input", inputName: "list" },
        steps: [
          actionStep("inner2", { runAfter: [{ stepId: "inner1" }] }),
          actionStep("inner1"),
        ],
        collect: { stepId: "inner2", outputName: "entities", as: "all" },
      },
      actionStep("first"),
    ]);

    expect(outline(tree)).toEqual(["first", { forEach: ["inner1", "inner2"] }]);
  });
});
