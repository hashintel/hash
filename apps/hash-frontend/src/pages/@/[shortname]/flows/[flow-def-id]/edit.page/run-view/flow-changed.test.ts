import { describe, expect, it } from "vitest";

import { actionStep, flowWith } from "../shared/step-fixtures";
import { flowChangedBetween } from "./flow-changed";

describe("flowChangedBetween", () => {
  const ran = flowWith([
    actionStep("find", { position: { x: 0, y: 0 } }),
    actionStep("create", {
      actionDefinitionId: "createEntity",
      runAfter: [{ stepId: "find" }],
    }),
  ]);

  it("doesn't count steps moved, the flow renamed, or the same definition with its keys in another order", () => {
    expect(
      flowChangedBetween(ran, {
        ...ran,
        name: "Renamed",
        steps: [
          actionStep("find", { position: { x: 400, y: 120 } }),
          {
            runAfter: [{ stepId: "find" }],
            inputs: {},
            description: "",
            actionDefinitionId: "createEntity",
            stepId: "create",
            kind: "action",
          },
        ],
      }),
    ).toBe(false);
  });

  it("counts a step added, a step's description changed, or an output featured", () => {
    expect(
      flowChangedBetween(ran, {
        ...ran,
        steps: [...ran.steps, actionStep("update")],
      }),
    ).toBe(true);
    expect(
      flowChangedBetween(ran, {
        ...ran,
        steps: ran.steps.map((step) => ({ ...step, description: "Edited" })),
      }),
    ).toBe(true);
    expect(
      flowChangedBetween(ran, {
        ...ran,
        outputs: [{ name: "entities", stepId: "find", outputName: "entities" }],
      }),
    ).toBe(true);
  });
});
