import { describe, expect, test } from "vitest";

import {
  createPetrinautAiToolCallbacks,
  petrinautAiToolInputSchemas,
  petrinautAiTools,
} from "./ai";
import { createJsonDocHandle } from "./handle";
import { createPetrinaut } from "./instance";

describe("Petrinaut AI core exports", () => {
  test("tool metadata stays aligned with input schemas and has no execute", () => {
    expect(Object.keys(petrinautAiTools).sort()).toEqual(
      Object.keys(petrinautAiToolInputSchemas).sort(),
    );

    for (const tool of Object.values(petrinautAiTools)) {
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.inputSchema).toBeDefined();
      expect(tool.description).toBe(tool.inputSchema.description);
      expect("execute" in tool).toBe(false);
    }
  });

  test("callback map applies tool inputs to a Petrinaut instance", () => {
    const instance = createPetrinaut({
      document: createJsonDocHandle({
        initial: {
          places: [],
          transitions: [],
          types: [],
          differentialEquations: [],
          parameters: [],
        },
      }),
    });
    const callbacks = createPetrinautAiToolCallbacks(instance);

    callbacks.addPlace({
      id: "place-1",
      name: "Queue",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    });
    callbacks.updatePlace({
      placeId: "place-1",
      update: { name: "UpdatedQueue" },
    });

    expect(instance.definition.get().places[0]!.name).toBe("UpdatedQueue");
  });

  test("callback map validates tool inputs before applying them", () => {
    const instance = createPetrinaut({
      document: createJsonDocHandle({
        initial: {
          places: [],
          transitions: [],
          types: [],
          differentialEquations: [],
          parameters: [],
        },
      }),
    });
    const callbacks = createPetrinautAiToolCallbacks(instance);

    expect(() =>
      callbacks.addPlace({
        id: "",
        name: "Queue",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 0,
        y: 0,
      }),
    ).toThrow();

    expect(instance.definition.get().places).toEqual([]);
  });
});
