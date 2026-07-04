/**
 * End-to-end tests for HIR-compiled artifacts: buffer-ABI programs must
 * produce bit-identical frames (including RNG stream evolution) to the
 * object-convention programs, and simulations without artifacts must fail
 * with a per-item error.
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

/** Strips buffer programs so only the object convention runs. */
function objectOnly(artifacts: HirArtifacts): HirArtifacts {
  const strip = <Artifact extends { object?: string }>(
    entries: Record<string, Artifact>,
  ): Record<string, { object?: string }> =>
    Object.fromEntries(
      Object.entries(entries).map(([key, value]) => [
        key,
        { object: value.object },
      ]),
    );
  return {
    version: 2,
    dynamics: strip(artifacts.dynamics),
    lambdas: strip(artifacts.lambdas),
    kernels: strip(artifacts.kernels),
  };
}

describe("buildSimulation with HIR artifacts", () => {
  it("compiles buffer and object programs for all three surfaces", () => {
    const { artifacts, failures } = compileHirArtifacts(sdcpn);
    expect(failures).toEqual([]);
    expect(artifacts.dynamics.de1!.buffer).toBeDefined();
    expect(artifacts.dynamics.de1!.object).toBeDefined();
    expect(artifacts.lambdas.t1!.buffer).toBeDefined();
    expect(artifacts.lambdas.t1!.buffer!.inputSlotCount).toBe(1);
    expect(artifacts.kernels.t1!.buffer).toBeDefined();
    expect(artifacts.kernels.t1!.buffer!.outputFloatCount).toBe(3);
  });

  it("buffer programs produce bit-identical frames to the object convention", () => {
    const { artifacts } = compileHirArtifacts(sdcpn);

    const bufferRun = buildSimulation(makeInput(artifacts));
    const objectRun = buildSimulation(makeInput(objectOnly(artifacts)));

    // Sanity: the buffer run actually uses buffer programs.
    const compiled = bufferRun.compiledTransitions.get("t1")!;
    expect(compiled.buffer?.lambdaFn).not.toBeNull();
    expect(compiled.buffer?.kernelFn).not.toBeNull();
    expect(objectRun.compiledTransitions.get("t1")!.buffer).toBeNull();

    expect(runFrames(bufferRun, 50)).toEqual(runFrames(objectRun, 50));
  });

  it("throws a per-item error when artifacts are missing", () => {
    expect(() => buildSimulation(makeInput())).toThrow(/has not been compiled/);
  });

  it("falls back to object programs when buffer metadata is stale", () => {
    const { artifacts } = compileHirArtifacts(sdcpn);
    const stale: HirArtifacts = {
      ...artifacts,
      lambdas: {
        t1: {
          ...artifacts.lambdas.t1!,
          buffer: { ...artifacts.lambdas.t1!.buffer!, inputSlotCount: 99 },
        },
      },
    };
    const simulation = buildSimulation(makeInput(stale));
    expect(
      simulation.compiledTransitions.get("t1")!.buffer?.lambdaFn,
    ).toBeNull();
    // Still simulates correctly via the object path.
    const reference = buildSimulation(makeInput(objectOnly(artifacts)));
    expect(runFrames(simulation, 10)).toEqual(runFrames(reference, 10));
  });
});
