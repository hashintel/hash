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
      zeroth: { dt: 1 },
    });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.ir).toBe(
      "name: arrivals\ndescription: Customers arrive.\nkind: stochastic\n\nplaces:\n  Arrived:\n\ntransitions:\n  Arrive:\n    outputs:\n      Arrived:\n    rate: 2\n",
    );
    expect(result.python).toContain(
      `fire_Arrive = X(u_Arrive) >= ${Math.exp(-2)}  # Arrive: nothing -> Arrived`,
    );
    expect(result.python).toContain(
      "net = Arrivals(theory=LRA, ctrl=(Arrived,), extl=(u_Arrive,))",
    );
  });

  it("writes the flags that apply to the net into the IR and compiles from them", () => {
    const result = compileReactiveModuleExport({
      sdcpn,
      title: "Arrivals",
      initialMarking: {},
      parameterValues: {},
      lambdaHir,
      zeroth: { shape: "modular", marking: "int", control: "open", dt: 0.5 },
    });
    expect(result.errors).toEqual([]);
    // No transition is controllable, so the control flag does not apply.
    expect(result.document?.zeroth).toEqual({
      shape: "modular",
      marking: "int",
      dt: 0.5,
    });
    expect(result.ir).toContain(
      "\nzeroth:\n  shape: modular\n  marking: int\n  dt: 0.5\n",
    );
    expect(result.python).toContain("Arrived = Var(INT)");
    expect(result.python).toContain("class Draw_Arrive(Module):");
    expect(result.python).toContain(
      "net = compose(draw_Arrive, transition_Arrive, place_Arrived)",
    );
  });

  it("marks a transition controllable from its metadata", () => {
    const result = compileReactiveModuleExport({
      sdcpn: {
        ...sdcpn,
        transitions: [
          {
            ...sdcpn.transitions[0]!,
            metadata: { control: "controllable", action: "dispatch" },
          },
        ],
      },
      title: "Arrivals",
      initialMarking: {},
      parameterValues: {},
      lambdaHir,
      zeroth: { control: "open" },
    });
    expect(result.errors).toEqual([]);
    expect(result.document?.transitions.Arrive?.controllable).toBe(true);
    expect(result.document?.zeroth).toEqual({ control: "open" });
    expect(result.python).toContain(
      "go_Arrive = Var(BOOL)  # choice for Arrive, each step: it fires only when chosen",
    );
    expect(result.python).toContain(
      "& X(go_Arrive)  # Arrive: nothing -> Arrived",
    );
  });

  it("keeps the module's own identifiers out of the IR", () => {
    const result = compileReactiveModuleExport({
      sdcpn: {
        ...sdcpn,
        places: [{ ...sdcpn.places[0]!, id: "x", name: "X" }],
        transitions: [
          {
            ...sdcpn.transitions[0]!,
            outputArcs: [{ placeId: "x", weight: 1 }],
          },
        ],
      },
      title: "Reserved",
      initialMarking: {},
      parameterValues: {},
      lambdaHir,
    });
    expect(result.errors).toEqual([]);
    expect(result.ir).toContain("places:\n  X2:\n");
    expect(result.python).toContain("X2 = Var(REAL)");
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
      document: null,
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
