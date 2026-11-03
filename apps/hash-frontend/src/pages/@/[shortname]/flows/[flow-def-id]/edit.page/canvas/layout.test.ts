import { describe, expect, it } from "vitest";

import { actionStep, flowWith } from "../shared/step-fixtures";
import { getStartPosition } from "./flow-graph";
import { getFreePosition, layOutFlow } from "./layout";
import { stepCardSize } from "./sizes";

describe("layOutFlow", () => {
  it("puts each step after the steps it runs after, counting data links, and keeps Start where it is", async () => {
    /* Listed backwards, so that an order taken from the list would be wrong. */
    const flowDefinition = flowWith([
      actionStep("third", {
        position: { x: 0, y: 500 },
        inputs: {
          entities: {
            kind: "step-output",
            stepId: "second",
            outputName: "entities",
          },
        },
      }),
      actionStep("second", {
        position: { x: 900, y: 0 },
        runAfter: [{ stepId: "first" }],
      }),
      actionStep("first", { position: { x: 400, y: 100 } }),
    ]);

    const { positions } = await layOutFlow(flowDefinition);

    const first = positions.get("first")!;
    const second = positions.get("second")!;
    const third = positions.get("third")!;

    expect(second.x - first.x).toBe(stepCardSize.width + 64);
    expect(third.x - second.x).toBe(stepCardSize.width + 64);
    /* A chain is one row. */
    expect(new Set([first.y, second.y, third.y]).size).toBe(1);

    const laidOut = flowWith(
      flowDefinition.steps.map((step) => ({
        ...step,
        position: positions.get(step.stepId),
      })),
    );

    expect(getStartPosition(laidOut.steps)).toEqual(
      getStartPosition(flowDefinition.steps),
    );
  });

  it("lays out the steps inside a for-each step in its box, and makes the box fit them", async () => {
    const { forEachLayouts } = await layOutFlow(
      flowWith([
        {
          kind: "for-each",
          stepId: "forEach",
          description: "",
          over: { kind: "flow-input", inputName: "list" },
          steps: [
            actionStep("inner2", { runAfter: [{ stepId: "inner1" }] }),
            actionStep("inner1"),
          ],
          collect: { stepId: "inner2", outputName: "entities", as: "all" },
        },
      ]),
    );

    const layout = forEachLayouts.get("forEach")!;
    const inner1 = layout.positions.get("inner1")!;
    const inner2 = layout.positions.get("inner2")!;

    expect(inner2.x).toBeGreaterThan(inner1.x + stepCardSize.width);
    expect(inner1.y).toBeGreaterThan(0);
    expect(layout.size.width).toBeGreaterThan(inner2.x + stepCardSize.width);
    expect(layout.size.height).toBeGreaterThan(inner1.y + stepCardSize.height);
  });
});

describe("getFreePosition", () => {
  it("moves a new card below the cards it would cover", () => {
    const card = { width: stepCardSize.width, height: stepCardSize.height };

    expect(
      getFreePosition({ x: 0, y: 0 }, [
        { position: { x: 100, y: -20 }, ...card },
        { position: { x: 150, y: 60 }, ...card },
        /* Beside, so not covered. */
        { position: { x: 200, y: 0 }, ...card },
      ]),
    ).toEqual({ x: 0, y: 60 + stepCardSize.height + 32 });
  });
});
