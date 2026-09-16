import { expect, test } from "vitest";

import { locateRootArc } from "../src/root-arc";

import type { SDCPN } from "@hashintel/petrinaut-core";

const definition: SDCPN = {
  places: [
    {
      id: "place-1",
      name: "Crew",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    },
  ],
  transitions: [
    {
      id: "transition-1",
      name: "Start",
      inputArcs: [{ placeId: "place-1", weight: 2, type: "standard" }],
      outputArcs: [],
      lambdaType: "predicate",
      lambdaCode: "",
      transitionKernelCode: "",
      x: 100,
      y: 0,
    },
  ],
  types: [],
  differentialEquations: [],
  parameters: [],
};

test("locates a root arc as its own kind so later child edits can refuse the whole-arc basis", () => {
  expect(
    locateRootArc(definition, {
      transition: "Start",
      place: "Crew",
      arcDirection: "input",
      field: "entity",
    }),
  ).toMatchObject({
    kind: "arc",
    transitionId: "transition-1",
    placeId: "place-1",
    path: "/transitions/0/inputArcs/0",
  });
  expect(
    locateRootArc(definition, {
      transition: "transition-1",
      place: "place-1",
      arcDirection: "input",
      field: "weight",
    }).kind,
  ).toBe("arc");
});
