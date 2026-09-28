import { expect, test } from "vitest";

import {
  isNetObservationTool,
  netReaderToolNames,
  projectNetDefinition,
} from "../src/net-readers";
import { browserToolMutatesDocument } from "../src/petrinaut-tool-effects";

const definition = {
  metadata: { host: "opaque" },
  places: [
    {
      id: "p1",
      name: "Queue",
      colorId: null,
      x: 10,
      y: 20,
      visualizerCode: "return <svg />",
      showAsInitialState: true,
    },
  ],
  transitions: [
    {
      id: "t1",
      name: "Serve",
      inputArcs: [{ placeId: "p1", weight: 1, type: "standard" }],
      outputArcs: [],
      lambdaType: "stochastic",
      lambdaCode: "return 1;",
      transitionKernelCode: "",
      x: 30,
      y: 40,
    },
  ],
  types: [{ id: "c1", name: "Job", iconSlug: "box", displayColor: "#fff" }],
  differentialEquations: [{ id: "d1", name: "Cool", colorId: "c1", code: "x" }],
  parameters: [],
};

test("the structure drops presentational fields and keeps every core property and code", () => {
  expect(projectNetDefinition(definition, "structure")).toEqual({
    places: [{ id: "p1", name: "Queue", colorId: null }],
    transitions: [
      {
        id: "t1",
        name: "Serve",
        inputArcs: [{ placeId: "p1", weight: 1, type: "standard" }],
        outputArcs: [],
        lambdaType: "stochastic",
        lambdaCode: "return 1;",
        transitionKernelCode: "",
      },
    ],
    types: [{ id: "c1", name: "Job" }],
    differentialEquations: [
      { id: "d1", name: "Cool", colorId: "c1", code: "x" },
    ],
    parameters: [],
  });
});

test("the outline also drops code bodies", () => {
  const outline = projectNetDefinition(definition, "outline");
  expect(JSON.stringify(outline)).not.toMatch(/lambdaCode|KernelCode|"code"/u);
  expect(outline).toMatchObject({
    transitions: [{ id: "t1", lambdaType: "stochastic" }],
    differentialEquations: [{ id: "d1", name: "Cool", colorId: "c1" }],
  });
});

test("the readers are net observations that never change the document", () => {
  for (const name of Object.values(netReaderToolNames)) {
    expect(isNetObservationTool(name)).toBe(true);
    expect(browserToolMutatesDocument(name)).toBe(false);
  }
  expect(isNetObservationTool("getLatestNetDefinition")).toBe(true);
  expect(isNetObservationTool("getNetCompilationErrors")).toBe(false);
  expect(isNetObservationTool("addPlace")).toBe(false);
});
