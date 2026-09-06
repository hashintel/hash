import { describe, expect, test } from "vitest";

import { createHeadlessPetrinautClient } from "../src/evaluations/runbook/headless-petrinaut-client";

describe("the headless Petrinaut client", () => {
  test("constructs a parser-accepted document through the bounded callbacks", async () => {
    const client = createHeadlessPetrinautClient(
      "Validated construction proof",
    );
    const calls = [
      {
        toolCallId: "type",
        toolName: "addType",
        input: {
          id: "order_type",
          name: "Order",
          iconSlug: "circle",
          displayColor: "#808080",
          elements: [],
        },
      },
      {
        toolCallId: "parameter",
        toolName: "addParameter",
        input: {
          id: "washdown_hours",
          name: "Washdown hours",
          variableName: "washdown_hours",
          type: "real",
          defaultValue: "3",
        },
      },
      {
        toolCallId: "place",
        toolName: "addPlace",
        input: {
          id: "line_idle",
          name: "LineIdle",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 0,
          y: 0,
        },
      },
      {
        toolCallId: "transition",
        toolName: "addTransition",
        input: {
          id: "start_run",
          name: "Start run",
          inputArcs: [],
          outputArcs: [],
          lambdaType: "predicate",
          lambdaCode: "return true;",
          transitionKernelCode: "",
          x: 0,
          y: 0,
        },
      },
      {
        toolCallId: "input-arc",
        toolName: "addArc",
        input: {
          transitionId: "start_run",
          arcDirection: "input",
          placeId: "line_idle",
          weight: 1,
        },
      },
      {
        toolCallId: "output-arc",
        toolName: "addArc",
        input: {
          transitionId: "start_run",
          arcDirection: "output",
          placeId: "line_idle",
          weight: 1,
        },
      },
    ];

    try {
      for (const call of calls) {
        // oxlint-disable-next-line no-await-in-loop -- each mutation depends on the prior document state.
        await expect(client.execute(call)).resolves.toMatchObject({
          output: { applied: true },
        });
      }

      expect(client.definition()).toMatchObject({
        types: [{ id: "order_type" }],
        parameters: [{ id: "washdown_hours" }],
        places: [{ id: "line_idle" }],
        transitions: [
          {
            id: "start_run",
            inputArcs: [{ placeId: "line_idle", weight: 1 }],
            outputArcs: [{ placeId: "line_idle", weight: 1 }],
          },
        ],
      });
      expect(client.document().title).toBe("Validated construction proof");
      expect(client.parse()).toMatchObject({ ok: true });
    } finally {
      client.dispose();
    }
  });

  test("refuses tools outside the side-quest subset", async () => {
    const client = createHeadlessPetrinautClient(
      "Validated construction proof",
    );
    try {
      const result = await client.execute({
        toolCallId: "remove",
        toolName: "removePlace",
        input: { placeId: "line_idle" },
      });
      expect(result.output).toMatchObject({ applied: false });
      expect("error" in result.output ? result.output.error : "").toContain(
        "does not allow removePlace",
      );
    } finally {
      client.dispose();
    }
  });
});
