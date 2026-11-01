import { expect, expectTypeOf, test } from "vitest";

import {
  isNetObservationTool,
  netReaderToolNames,
  netStructureOf,
  projectNetDefinition,
  type NetStructure,
} from "./net-readers";
import { browserToolMutatesDocument } from "./petrinaut-tool-effects";

import type { SDCPN } from "@hashintel/petrinaut-core";

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

test("a net's structure is its structure-level projection", () => {
  const net = structuredClone(definition) as unknown as SDCPN;
  expect(netStructureOf(net)).toEqual(projectNetDefinition(net, "structure"));
  type StructurePlace = NetStructure["places"][number];
  expectTypeOf<StructurePlace>().toHaveProperty("colorId");
  expectTypeOf<StructurePlace>().not.toHaveProperty("x");
});

test("the outline also drops code bodies", () => {
  const outline = projectNetDefinition(definition, "outline");
  expect(JSON.stringify(outline)).not.toMatch(/lambdaCode|KernelCode|"code"/u);
  expect(outline).toMatchObject({
    transitions: [{ id: "t1", lambdaType: "stochastic" }],
    differentialEquations: [{ id: "d1", name: "Cool", colorId: "c1" }],
  });
});

const sharedValue = (expression: string) => ({ expression, optimize: null });

const scenarioDefinition = {
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
  scenarios: [
    {
      id: "s-adhoc",
      name: "Ad hoc",
      scenarioParameters: [],
      parameterOverrides: { "param-1": "scenario.rate * 2" },
      initialState: {
        type: "adhoc",
        content: {
          variables: [
            {
              name: "rate",
              type: "real",
              expression: "0.5",
              optimize: { min: "0", max: "1", scale: "linear" },
            },
          ],
          netParameters: [
            { parameterId: "param-1", expression: "rate", optimize: null },
          ],
          places: {
            p1: {
              kind: "coloured",
              variables: [],
              rows: [{ kind: "fixed", cells: [sharedValue("1")] }],
              sharedColumns: {
                x: sharedValue("10"),
                y: sharedValue("20"),
                metadata: sharedValue("30"),
                code: sharedValue("40"),
              },
              retainedSharedColumns: { rateCode: sharedValue("50") },
            },
          },
        },
      },
      futureField: { x: 1, code: "kept" },
    },
    {
      id: "s-code",
      name: "Code",
      scenarioParameters: [],
      parameterOverrides: {},
      initialState: { type: "code", content: "return { Queue: [] };" },
    },
  ],
};

test("user-named ad-hoc shared columns survive both views", () => {
  for (const level of ["outline", "structure"] as const) {
    expect(projectNetDefinition(scenarioDefinition, level)).toMatchObject({
      scenarios: [
        {
          initialState: {
            content: {
              places: {
                p1: {
                  sharedColumns: {
                    x: { optimize: null },
                    y: { optimize: null },
                    metadata: { optimize: null },
                    code: { optimize: null },
                  },
                  retainedSharedColumns: { rateCode: { optimize: null } },
                },
              },
            },
          },
          futureField: { x: 1, code: "kept" },
        },
        { id: "s-code" },
      ],
    });
  }
  expect(projectNetDefinition(scenarioDefinition, "structure")).toEqual(
    scenarioDefinition,
  );
});

test("the outline drops scenario code and expressions but keeps the ad-hoc shape", () => {
  const outline = projectNetDefinition(scenarioDefinition, "outline");
  const serialized = JSON.stringify(outline);
  expect(serialized).not.toMatch(
    /return \{ Queue|scenario\.rate|"expression"/u,
  );
  expect(outline).toEqual({
    ...scenarioDefinition,
    scenarios: [
      {
        id: "s-adhoc",
        name: "Ad hoc",
        scenarioParameters: [],
        initialState: {
          type: "adhoc",
          content: {
            variables: [
              { name: "rate", type: "real", optimize: { scale: "linear" } },
            ],
            netParameters: [{ parameterId: "param-1", optimize: null }],
            places: {
              p1: {
                kind: "coloured",
                variables: [],
                rows: [{ kind: "fixed", cells: [{ optimize: null }] }],
                sharedColumns: {
                  x: { optimize: null },
                  y: { optimize: null },
                  metadata: { optimize: null },
                  code: { optimize: null },
                },
                retainedSharedColumns: { rateCode: { optimize: null } },
              },
            },
          },
        },
        futureField: { x: 1, code: "kept" },
      },
      {
        id: "s-code",
        name: "Code",
        scenarioParameters: [],
        initialState: { type: "code" },
      },
    ],
  });
});

test("presentational and code fields are stripped from subnet items too", () => {
  const nested = projectNetDefinition(
    { ...definition, subnets: [{ id: "n1", name: "Sub", ...definition }] },
    "outline",
  );
  expect(nested).toMatchObject({
    subnets: [
      {
        id: "n1",
        places: [{ id: "p1", name: "Queue", colorId: null }],
        transitions: [{ id: "t1", lambdaType: "stochastic" }],
      },
    ],
  });
  expect(JSON.stringify(nested)).not.toMatch(
    /"x"|"metadata"|lambdaCode|visualizerCode/u,
  );
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
