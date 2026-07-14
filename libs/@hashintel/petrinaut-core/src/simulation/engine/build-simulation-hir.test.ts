/**
 * End-to-end tests for HIR-compiled artifacts: the engine runs buffer-ABI
 * programs only — identical inputs must produce identical frames (including
 * RNG stream evolution), simulations without artifacts must fail with a
 * per-item error, and stale artifact metadata must be rejected.
 */
import { describe, expect, it } from "vitest";

import { compileHirArtifacts } from "../../hir";
import { buildSimulation } from "./build-simulation";
import { computeNextFrame } from "./compute-next-frame";

import type { HirArtifacts } from "../../hir-runtime";
import type { SDCPN } from "../../types/sdcpn";
import type { SimulationInput, SimulationInstance } from "./types";

const sdcpn: SDCPN = {
  types: [
    {
      id: "type1",
      name: "Particle",
      iconSlug: "circle",
      displayColor: "#FF0000",
      elements: [
        { elementId: "e1", name: "x", type: "real" },
        { elementId: "e2", name: "v", type: "real" },
        { elementId: "e3", name: "generation", type: "integer" },
      ],
    },
  ],
  differentialEquations: [
    {
      id: "de1",
      name: "Oscillator",
      colorId: "type1",
      code: `export default Dynamics((tokens, parameters) => {
  return tokens.map(({ x, v }) => {
    return { x: v, v: -parameters.k * x };
  });
});`,
    },
  ],
  parameters: [
    {
      id: "param1",
      name: "Spring constant",
      variableName: "k",
      type: "real",
      defaultValue: "2",
    },
    {
      id: "param2",
      name: "Rate",
      variableName: "rate",
      type: "real",
      defaultValue: "5",
    },
  ],
  places: [
    {
      id: "p1",
      name: "Source",
      colorId: "type1",
      dynamicsEnabled: true,
      differentialEquationId: "de1",
      x: 0,
      y: 0,
    },
    {
      id: "p2",
      name: "Target",
      colorId: "type1",
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    },
  ],
  transitions: [
    {
      id: "t1",
      name: "Hop",
      lambdaType: "stochastic",
      inputArcs: [{ placeId: "p1", weight: 1, type: "standard" }],
      outputArcs: [{ placeId: "p2", weight: 1 }],
      lambdaCode: `export default Lambda((input, parameters) => {
  const { x } = input.Source[0];
  if (x > 0) return parameters.rate;
  return 0.5;
});`,
      transitionKernelCode: `export default TransitionKernel((input, parameters) => {
  const noise = Distribution.Gaussian(0, 0.1);
  return {
    Target: [
      {
        x: input.Source[0].x,
        v: noise.map((value) => value + input.Source[0].v),
        generation: input.Source[0].generation + 1,
      },
    ],
  };
});`,
      x: 0,
      y: 0,
    },
  ],
};

function makeInput(hirArtifacts?: SimulationInput["hirArtifacts"]) {
  return {
    sdcpn,
    initialMarking: {
      p1: [
        { x: 1, v: 0, generation: 0 },
        { x: -0.5, v: 2, generation: 0 },
      ],
      p2: [],
    },
    parameterValues: { k: "2", rate: "5" },
    seed: 1234,
    dt: 0.05,
    maxTime: null,
    hirArtifacts,
  } satisfies SimulationInput;
}

function runFrames(instance: SimulationInstance, count: number): number[][] {
  let simulation = instance;
  const frames: number[][] = [];
  for (let step = 0; step < count; step++) {
    const result = computeNextFrame(simulation);
    simulation = result.simulation;
    const frame = simulation.frames[simulation.currentFrameNumber]!;
    frames.push([...new Float64Array(frame)]);
  }
  return frames;
}

describe("buildSimulation with HIR artifacts", () => {
  it("compiles buffer programs for all three surfaces", () => {
    const { artifacts, failures } = compileHirArtifacts(sdcpn);
    expect(failures).toEqual([]);
    expect(artifacts.version).toBe(4);
    expect(artifacts.fingerprint).toMatch(/^[0-9a-f]{16}$/);
    expect(typeof artifacts.dynamics.de1!.source).toBe("string");
    expect(typeof artifacts.lambdas.t1!.source).toBe("string");
    expect(artifacts.lambdas.t1!.inputSlotCount).toBe(1);
    expect(typeof artifacts.kernels.t1!.source).toBe("string");
    expect(artifacts.kernels.t1!.inputSlotCount).toBe(1);
    // One output token: x(f64) + v(f64) + generation(f64) → 24-byte stride.
    expect(artifacts.kernels.t1!.outputByteCount).toBe(24);
  });

  it("instantiates buffer programs and scratch for the engine", () => {
    const { artifacts } = compileHirArtifacts(sdcpn);
    const simulation = buildSimulation(makeInput(artifacts));
    const compiled = simulation.compiledTransitions.get("t1")!;
    expect(typeof compiled.lambdaFn).toBe("function");
    expect(typeof compiled.kernelFn).toBe("function");
    expect(compiled.placeBases).toHaveLength(1);
    expect(compiled.indices).toHaveLength(1);
    expect(compiled.kernelStaging).toHaveLength(24);
  });

  it("produces identical frames for identical inputs (deterministic)", () => {
    const { artifacts } = compileHirArtifacts(sdcpn);

    const firstRun = buildSimulation(makeInput(artifacts));
    const secondRun = buildSimulation(makeInput(artifacts));

    expect(runFrames(firstRun, 50)).toEqual(runFrames(secondRun, 50));
  });

  it("throws a per-item error when artifacts are missing", () => {
    expect(() => buildSimulation(makeInput())).toThrow(/has not been compiled/);
  });

  it("throws when artifact metadata is stale", () => {
    const { artifacts } = compileHirArtifacts(sdcpn);
    const stale: HirArtifacts = {
      ...artifacts,
      lambdas: {
        t1: { ...artifacts.lambdas.t1!, inputSlotCount: 99 },
      },
    };
    expect(() => buildSimulation(makeInput(stale))).toThrow(
      /does not match|stale|has not been compiled/i,
    );
  });

  it("rejects artifacts from an unsupported ABI version", () => {
    const { artifacts } = compileHirArtifacts(sdcpn);
    const stale = { ...artifacts, version: 3 } as unknown as HirArtifacts;

    expect(() => buildSimulation(makeInput(stale))).toThrow(
      /unsupported version 3/i,
    );
  });

  it("rejects artifacts compiled for a different same-width layout", () => {
    const { artifacts } = compileHirArtifacts(sdcpn);
    const reorderedSdcpn: SDCPN = {
      ...sdcpn,
      types: sdcpn.types.map((type) => ({
        ...type,
        elements: [...type.elements].reverse(),
      })),
    };

    expect(() =>
      buildSimulation({ ...makeInput(artifacts), sdcpn: reorderedSdcpn }),
    ).toThrow(/do not match the current net/i);
  });
});
