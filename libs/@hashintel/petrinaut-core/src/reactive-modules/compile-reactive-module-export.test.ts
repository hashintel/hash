import { describe, expect, it } from "vitest";

import { compileHirArtifacts } from "../hir/compile";
import { compileReactiveModuleExport } from "./compile-reactive-module-export";

import type { SDCPN } from "../types/sdcpn";

const sdcpn: SDCPN = {
  description: "Customers arrive.",
  places: [
    {
      id: "arrived",
      name: "Arrived",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    },
  ],
  transitions: [
    {
      id: "arrive",
      name: "Arrive",
      inputArcs: [],
      outputArcs: [{ placeId: "arrived", weight: 1 }],
      lambdaType: "stochastic",
      lambdaCode: "return parameters.rate;",
      transitionKernelCode: "",
      x: 0,
      y: 0,
    },
  ],
  types: [],
  differentialEquations: [],
  parameters: [
    {
      id: "rate",
      name: "Rate",
      variableName: "rate",
      type: "real",
      defaultValue: "2",
    },
  ],
};

const lambdaHir = Object.fromEntries(
  Object.entries(
    compileHirArtifacts(sdcpn, undefined, { includeHir: true }).artifacts
      .lambdas,
  ).map(([id, artifact]) => [id, artifact.hir]),
);

describe("compileReactiveModuleExport", () => {
  it("renders the IR and the module for a net that lowers", () => {
    const result = compileReactiveModuleExport({
      sdcpn,
      title: "Arrivals",
      initialMarking: {},
      parameterValues: {},
      lambdaHir,
      dt: 1,
    });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.ir).toBe(
      "name: arrivals\ndescription: Customers arrive.\nkind: stochastic\nplaces:\n  Arrived:\ntransitions:\n  Arrive:\n    outputs:\n      Arrived:\n    rate: 2\n",
    );
    expect(result.python).toContain(
      `fire_Arrive = X(u_Arrive) >= ${Math.exp(-2)}  # Arrive: nothing -> Arrived`,
    );
    expect(result.python).toContain(
      "net = Arrivals(theory=LRA, ctrl=(Arrived,), extl=(u_Arrive,))",
    );
  });

  it("returns no text and the errors when the net cannot be expressed", () => {
    const result = compileReactiveModuleExport({
      sdcpn,
      title: "Arrivals",
      initialMarking: {},
      parameterValues: { rate: "fast" },
      lambdaHir,
    });
    expect(result).toMatchObject({
      ir: null,
      python: null,
      errors: [
        {
          code: "parameter-invalid",
          item: { kind: "parameter", name: "Rate" },
        },
      ],
    });
  });
});
