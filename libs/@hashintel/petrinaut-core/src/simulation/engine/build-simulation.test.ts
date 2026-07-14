import { describe, expect, it } from "vitest";

import { compileHirArtifacts } from "../../hir";
import { compileSimulationFrameReader } from "../frames/frame-reader";
import { materializeEngineFrame } from "../frames/internal-frame";
import { buildSimulation as buildSimulationRaw } from "./build-simulation";
import { decodePlaceTokens } from "./token-layout.test-helpers";

import type { HirCompiledBufferLambda } from "../../hir-runtime";
import type { SimulationInput } from "./types";

/** buildSimulation with HIR artifacts compiled from the input's SDCPN (the
 * engine no longer compiles user code itself). */
function buildSimulation(
  input: SimulationInput,
): ReturnType<typeof buildSimulationRaw> {
  return buildSimulationRaw({
    ...input,
    hirArtifacts:
      input.hirArtifacts ??
      compileHirArtifacts(input.sdcpn, input.extensions).artifacts,
  });
}

/** Calls a buffer-ABI lambda with empty views (for constant lambdas whose
 * result does not depend on token attributes). */
function callLambda(
  lambdaFn: HirCompiledBufferLambda | undefined,
): number | boolean | undefined {
  return lambdaFn?.(
    new Float64Array(0),
    new BigUint64Array(0),
    new Uint8Array(0),
    new Int32Array(0),
    new Int32Array(0),
  );
}

describe("buildSimulation", () => {
  it("packs and decodes integer and boolean token attributes", () => {
    const input: SimulationInput = {
      sdcpn: {
        types: [
          {
            id: "type1",
            name: "Typed entity",
            iconSlug: "circle",
            displayColor: "#FF0000",
            elements: [
              { elementId: "e1", name: "amount", type: "real" },
              { elementId: "e2", name: "count", type: "integer" },
              { elementId: "e3", name: "active", type: "boolean" },
            ],
          },
        ],
        differentialEquations: [],
        parameters: [],
        places: [
          {
            id: "p1",
            name: "Place 1",
            colorId: "type1",
            dynamicsEnabled: false,
            differentialEquationId: null,
            x: 0,
            y: 0,
          },
        ],
        transitions: [],
      },
      initialMarking: {
        p1: [
          {
            amount: 1.25,
            count: 2.7,
            active: true,
          },
        ],
      },
      parameterValues: {},
      seed: 42,
      dt: 0.1,
      maxTime: null,
    };

    const simulationInstance = buildSimulation(input);
    const engineFrame = simulationInstance.frames[0]!;
    const frame = materializeEngineFrame(
      simulationInstance.frameLayout,
      engineFrame,
    );

    // Packed struct layout: amount (f64) @ 0, count (f64) @ 8, active (u8)
    // @ 16, stride rounded up to 24 bytes.
    expect(frame.buffer).toBeInstanceOf(Uint8Array);
    expect(frame.buffer.byteLength).toBe(24);
    expect(
      new Float64Array(frame.buffer.buffer, frame.buffer.byteOffset, 2),
    ).toEqual(new Float64Array([1.25, 3]));
    expect(frame.buffer[16]).toBe(1);

    const reader = compileSimulationFrameReader(input.sdcpn)(engineFrame, 0, 0);

    expect(reader.getPlaceTokens(input.sdcpn.places[0]!)).toEqual([
      {
        amount: 1.25,
        count: 3,
        active: true,
      },
    ]);
  });

  it("does not compile Lambda code when transition lambdas are unavailable", () => {
    const simulation = buildSimulation({
      sdcpn: {
        types: [],
        differentialEquations: [],
        parameters: [],
        places: [
          {
            id: "p1",
            name: "Input",
            colorId: null,
            dynamicsEnabled: false,
            differentialEquationId: null,
            x: 0,
            y: 0,
          },
        ],
        transitions: [
          {
            id: "t1",
            name: "Move",
            inputArcs: [{ placeId: "p1", weight: 1, type: "standard" }],
            outputArcs: [],
            lambdaType: "predicate",
            lambdaCode: "export default Lambda((",
            transitionKernelCode: "",
            x: 0,
            y: 0,
          },
        ],
      },
      extensions: {
        colors: true,
        stochasticity: false,
        dynamics: true,
        parameters: true,
        subnets: true,
      },
      initialMarking: { p1: 1 },
      parameterValues: {},
      seed: 42,
      dt: 0.1,
      maxTime: null,
    });

    expect(callLambda(simulation.compiledTransitions.get("t1")?.lambdaFn)).toBe(
      true,
    );
  });

  it("uses an always-firing stochastic Lambda when stochasticity is enabled and Lambda code is empty", () => {
    const simulation = buildSimulation({
      sdcpn: {
        types: [],
        differentialEquations: [],
        parameters: [],
        places: [
          {
            id: "p1",
            name: "Input",
            colorId: null,
            dynamicsEnabled: false,
            differentialEquationId: null,
            x: 0,
            y: 0,
          },
        ],
        transitions: [
          {
            id: "t1",
            name: "Move",
            inputArcs: [{ placeId: "p1", weight: 1, type: "standard" }],
            outputArcs: [],
            lambdaType: "stochastic",
            lambdaCode: "",
            transitionKernelCode: "",
            x: 0,
            y: 0,
          },
        ],
      },
      initialMarking: { p1: 1 },
      parameterValues: {},
      seed: 42,
      dt: 0.1,
      maxTime: null,
    });

    expect(callLambda(simulation.compiledTransitions.get("t1")?.lambdaFn)).toBe(
      Infinity,
    );
  });

  it("compiles predicate Lambda code when only stochasticity is enabled", () => {
    const simulation = buildSimulation({
      sdcpn: {
        types: [],
        differentialEquations: [],
        parameters: [],
        places: [
          {
            id: "p1",
            name: "Input",
            colorId: null,
            dynamicsEnabled: false,
            differentialEquationId: null,
            x: 0,
            y: 0,
          },
        ],
        transitions: [
          {
            id: "t1",
            name: "Move",
            inputArcs: [{ placeId: "p1", weight: 1, type: "standard" }],
            outputArcs: [],
            lambdaType: "predicate",
            lambdaCode: "export default Lambda(() => false);",
            transitionKernelCode: "",
            x: 0,
            y: 0,
          },
        ],
      },
      extensions: {
        colors: false,
        stochasticity: true,
        dynamics: false,
        parameters: true,
        subnets: true,
      },
      initialMarking: { p1: 1 },
      parameterValues: {},
      seed: 42,
      dt: 0.1,
      maxTime: null,
    });

    expect(callLambda(simulation.compiledTransitions.get("t1")?.lambdaFn)).toBe(
      false,
    );
  });

  it("still compiles predicate Lambda code when stochasticity is disabled but coloured inputs exist", () => {
    expect(() =>
      buildSimulation({
        sdcpn: {
          types: [
            {
              id: "type1",
              name: "Type 1",
              iconSlug: "circle",
              displayColor: "#FF0000",
              elements: [{ elementId: "e1", name: "x", type: "real" }],
            },
          ],
          differentialEquations: [],
          parameters: [],
          places: [
            {
              id: "p1",
              name: "Input",
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
              name: "Move",
              inputArcs: [{ placeId: "p1", weight: 1, type: "standard" }],
              outputArcs: [],
              lambdaType: "predicate",
              lambdaCode: "export default Lambda((",
              transitionKernelCode: "",
              x: 0,
              y: 0,
            },
          ],
        },
        extensions: {
          colors: true,
          stochasticity: false,
          dynamics: true,
          parameters: true,
          subnets: true,
        },
        initialMarking: {},
        parameterValues: {},
        seed: 42,
        dt: 0.1,
        maxTime: null,
      }),
    ).toThrow("The Lambda code for `Move` has not been compiled");
  });

  it("does not expose Distribution to transition kernels when stochasticity is disabled", () => {
    const input: SimulationInput = {
      sdcpn: {
        types: [
          {
            id: "type1",
            name: "Type 1",
            iconSlug: "circle",
            displayColor: "#FF0000",
            elements: [{ elementId: "e1", name: "x", type: "real" }],
          },
        ],
        differentialEquations: [],
        parameters: [],
        places: [
          {
            id: "p1",
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
            name: "Create",
            inputArcs: [],
            outputArcs: [{ placeId: "p1", weight: 1 }],
            lambdaType: "predicate",
            lambdaCode: "",
            transitionKernelCode: `export default TransitionKernel(() => {
              return { Target: [{ x: Distribution.Uniform(0, 1) }] };
            });`,
            x: 0,
            y: 0,
          },
        ],
      },
      extensions: {
        colors: true,
        stochasticity: false,
        dynamics: true,
        parameters: true,
        subnets: true,
      },
      initialMarking: {},
      parameterValues: {},
      seed: 42,
      dt: 0.1,
      maxTime: null,
    };

    // Distribution usage is rejected at compile time when stochasticity is
    // disabled — the kernel gets no artifact...
    const { artifacts, failures } = compileHirArtifacts(
      input.sdcpn,
      input.extensions,
    );
    expect(artifacts.kernels.t1).toBeUndefined();
    expect(failures).toMatchObject([
      { itemId: "t1", itemType: "transition-kernel" },
    ]);
    expect(failures[0]!.diagnostics[0]!.message).toMatch(
      /Distribution|stochasticity/,
    );

    // ...so the simulation refuses to start.
    expect(() => buildSimulation(input)).toThrow(/has not been compiled/);
  });

  it("ignores supplied parameter values when parameters are disabled", () => {
    const simulation = buildSimulation({
      sdcpn: {
        types: [],
        differentialEquations: [],
        parameters: [
          {
            id: "param-1",
            name: "Rate",
            variableName: "rate",
            type: "real",
            defaultValue: "1",
          },
        ],
        places: [],
        transitions: [],
      },
      extensions: {
        colors: true,
        stochasticity: true,
        dynamics: true,
        parameters: false,
        subnets: true,
      },
      initialMarking: {},
      parameterValues: { rate: "5" },
      seed: 42,
      dt: 0.1,
      maxTime: null,
    });

    expect(simulation.parameterValues).toEqual({});
  });

  it("flattens component-port arcs to the instantiated subnet port places", () => {
    const simulation = buildSimulation({
      sdcpn: {
        types: [],
        differentialEquations: [],
        parameters: [],
        places: [
          {
            id: "root-input",
            name: "RootInput",
            colorId: null,
            dynamicsEnabled: false,
            differentialEquationId: null,
            x: 0,
            y: 0,
          },
        ],
        transitions: [
          {
            id: "send",
            name: "Send",
            inputArcs: [{ placeId: "root-input", weight: 1, type: "standard" }],
            outputArcs: [
              {
                endpoint: {
                  kind: "componentPort",
                  componentInstanceId: "processor-1",
                  portPlaceId: "port-in",
                },
                weight: 1,
              },
            ],
            lambdaType: "predicate",
            lambdaCode: "",
            transitionKernelCode: "",
            x: 0,
            y: 0,
          },
          {
            id: "receive",
            name: "Receive",
            inputArcs: [
              {
                endpoint: {
                  kind: "componentPort",
                  componentInstanceId: "processor-1",
                  portPlaceId: "port-out",
                },
                weight: 1,
                type: "standard",
              },
            ],
            outputArcs: [],
            lambdaType: "predicate",
            lambdaCode: "",
            transitionKernelCode: "",
            x: 200,
            y: 0,
          },
        ],
        componentInstances: [
          {
            id: "processor-1",
            name: "Processor 1",
            subnetId: "processor-subnet",
            parameterValues: {},
            x: 100,
            y: 0,
          },
        ],
        subnets: [
          {
            id: "processor-subnet",
            name: "Processor",
            places: [
              {
                id: "port-in",
                name: "Port In",
                colorId: null,
                dynamicsEnabled: false,
                differentialEquationId: null,
                isPort: true,
                x: 0,
                y: 0,
              },
              {
                id: "port-out",
                name: "Port Out",
                colorId: null,
                dynamicsEnabled: false,
                differentialEquationId: null,
                isPort: true,
                x: 100,
                y: 0,
              },
            ],
            transitions: [
              {
                id: "process",
                name: "Process",
                inputArcs: [
                  { placeId: "port-in", weight: 1, type: "standard" },
                ],
                outputArcs: [{ placeId: "port-out", weight: 1 }],
                lambdaType: "predicate",
                lambdaCode: "",
                transitionKernelCode: "",
                x: 50,
                y: 0,
              },
            ],
            types: [],
            differentialEquations: [],
            parameters: [],
            componentInstances: [],
          },
        ],
      },
      initialMarking: { "root-input": 2 },
      parameterValues: {},
      seed: 42,
      dt: 0.1,
      maxTime: null,
    });
    const frame = materializeEngineFrame(
      simulation.frameLayout,
      simulation.frames[0]!,
    );

    expect([...simulation.places.keys()].sort()).toEqual([
      "processor-1::port-in",
      "processor-1::port-out",
      "root-input",
    ]);
    expect([...simulation.transitions.keys()].sort()).toEqual([
      "processor-1::process",
      "receive",
      "send",
    ]);
    expect(simulation.compiledTransitions.get("send")?.outputPlaces).toEqual([
      {
        placeId: "processor-1::port-in",
        placeName: "Processor 1::Port In",
        weight: 1,
        elements: null,
        tokenLayout: null,
      },
    ]);
    expect(simulation.compiledTransitions.get("receive")?.inputPlaces).toEqual([
      {
        placeId: "processor-1::port-out",
        placeName: "Processor 1::Port Out",
        weight: 1,
        arcType: "standard",
        elements: null,
        tokenLayout: null,
      },
    ]);
    expect(frame.places["root-input"]?.count).toBe(2);
    expect(frame.places["processor-1::port-in"]?.count).toBe(0);
    expect(frame.places["processor-1::port-out"]?.count).toBe(0);
  });

  it("builds a simulation with a single place and initial tokens", () => {
    const input: SimulationInput = {
      sdcpn: {
        types: [
          {
            id: "type1",
            name: "Type 1",
            iconSlug: "circle",
            displayColor: "#FF0000",
            elements: [
              { elementId: "e1", name: "x", type: "real" },
              { elementId: "e2", name: "y", type: "real" },
            ],
          },
        ],
        differentialEquations: [
          {
            id: "diffeq1",
            name: "Differential Equation 1",
            colorId: "type1",
            code: "export default Dynamics((tokens) => tokens.map(() => ({})));",
          },
        ],
        parameters: [],
        places: [
          {
            id: "p1",
            name: "Place 1",
            colorId: "type1",
            dynamicsEnabled: true,
            differentialEquationId: "diffeq1",
            x: 0,
            y: 0,
          },
        ],
        transitions: [],
      },
      initialMarking: {
        p1: [
          { x: 1.0, y: 2.0 },
          { x: 3.0, y: 4.0 },
        ],
      },
      parameterValues: {},
      seed: 42,
      dt: 0.1,
      maxTime: null,
    };

    const simulationInstance = buildSimulation(input);
    const engineFrame = simulationInstance.frames[0]!;
    const frame = materializeEngineFrame(
      simulationInstance.frameLayout,
      engineFrame,
    );

    // Verify simulation instance properties
    expect(simulationInstance.dt).toBe(0.1);
    expect(simulationInstance.rngState).toBe(42);
    expect(simulationInstance.currentFrameNumber).toBe(0);
    expect(simulationInstance.frames).toHaveLength(1);
    expect(simulationInstance.frames[0]).toBe(engineFrame);

    // Verify initial frame properties
    expect(simulationInstance.currentTime).toBe(0);
    expect(Object.keys(frame.places).length).toBe(1);
    expect(Object.keys(frame.transitions).length).toBe(0);

    // Verify place state
    const p1State = frame.places.p1;
    expect(p1State).toBeDefined();
    expect(p1State?.count).toBe(2);
    expect(p1State?.byteOffset).toBe(0);
    const p1Type = simulationInstance.places.get("p1")?.colorId;
    expect(p1Type).toBe("type1");
    const typeDefinition = input.sdcpn.types.find((tp) => tp.id === p1Type);
    expect(typeDefinition?.elements.length).toBe(2);

    // Verify buffer contains the correct token values
    expect(
      decodePlaceTokens(simulationInstance.frameLayout, engineFrame, "p1"),
    ).toEqual([
      { x: 1.0, y: 2.0 },
      { x: 3.0, y: 4.0 },
    ]);

    // Verify compiled functions exist
    expect(simulationInstance.differentialEquationFns.has("p1")).toBe(true);
  });

  it("builds a simulation with multiple places, transitions, and proper buffer layout", () => {
    const input: SimulationInput = {
      sdcpn: {
        types: [
          {
            id: "type1",
            name: "Type 1",
            iconSlug: "circle",
            displayColor: "#FF0000",
            elements: [{ elementId: "e1", name: "x", type: "real" }],
          },
          {
            id: "type2",
            name: "Type 2",
            iconSlug: "square",
            displayColor: "#00FF00",
            elements: [
              { elementId: "e1", name: "x", type: "real" },
              { elementId: "e2", name: "y", type: "real" },
            ],
          },
        ],
        differentialEquations: [
          {
            id: "diffeq1",
            name: "Differential Equation 1",
            colorId: "type1",
            code: "export default Dynamics((tokens) => tokens.map(() => ({})));",
          },
          {
            id: "diffeq2",
            name: "Differential Equation 2",
            colorId: "type2",
            code: "export default Dynamics((tokens) => tokens.map(() => ({})));",
          },
        ],
        parameters: [],
        places: [
          {
            id: "p1",
            name: "Place 1",
            colorId: "type1",
            dynamicsEnabled: true,
            differentialEquationId: "diffeq1",
            x: 0,
            y: 0,
          },
          {
            id: "p2",
            name: "Place 2",
            colorId: "type2",
            dynamicsEnabled: true,
            differentialEquationId: "diffeq2",
            x: 100,
            y: 0,
          },
          {
            id: "p3",
            name: "Place 3",
            colorId: "type1",
            dynamicsEnabled: true,
            differentialEquationId: "diffeq1",
            x: 200,
            y: 0,
          },
        ],
        transitions: [
          {
            id: "t1",
            name: "Transition 1",
            inputArcs: [{ placeId: "p1", weight: 1, type: "standard" }],
            outputArcs: [{ placeId: "p2", weight: 1 }],
            lambdaType: "stochastic",
            lambdaCode: "export default Lambda((tokens) => { return 1.0; });",
            transitionKernelCode:
              'export default TransitionKernel((input) => ({ "Place 2": [{ x: 1.0, y: 2.0 }] }));',
            x: 50,
            y: 0,
          },
          {
            id: "t2",
            name: "Transition 2",
            inputArcs: [{ placeId: "p2", weight: 1, type: "standard" }],
            outputArcs: [{ placeId: "p3", weight: 1 }],
            lambdaType: "stochastic",
            lambdaCode: "export default Lambda((tokens) => { return 2.0; });",
            transitionKernelCode:
              'export default TransitionKernel((input) => ({ "Place 3": [{ x: 5.0 }] }));',
            x: 150,
            y: 0,
          },
        ],
      },
      initialMarking: {
        p1: [{ x: 10.0 }, { x: 20.0 }, { x: 30.0 }],
        p2: [{ x: 1.0, y: 2.0 }],
        // p3 has no initial tokens
      },
      parameterValues: {},
      seed: 123,
      dt: 0.05,
      maxTime: null,
    };

    const simulationInstance = buildSimulation(input);
    const engineFrame = simulationInstance.frames[0]!;
    const frame = materializeEngineFrame(
      simulationInstance.frameLayout,
      engineFrame,
    );

    // Verify simulation instance properties
    expect(simulationInstance.dt).toBe(0.05);
    expect(simulationInstance.rngState).toBe(123);

    // Verify all places exist
    expect(Object.keys(frame.places).length).toBe(3);

    // Verify p1 state (places are sorted by ID, so p1 comes first)
    const p1State = frame.places.p1;
    expect(p1State?.count).toBe(3);
    expect(p1State?.byteOffset).toBe(0);
    const p1Type = simulationInstance.places.get("p1")?.colorId;
    expect(p1Type).toBe("type1");
    const p1TypeDef = input.sdcpn.types.find((tp) => tp.id === p1Type);
    expect(p1TypeDef?.elements.length).toBe(1);

    // Verify p2 state (comes after p1)
    const p2State = frame.places.p2;
    expect(p2State?.count).toBe(1);
    expect(p2State?.byteOffset).toBe(24); // After p1's 3 tokens × 8-byte stride
    const p2Type = simulationInstance.places.get("p2")?.colorId;
    expect(p2Type).toBe("type2");
    const p2TypeDef = input.sdcpn.types.find((tp) => tp.id === p2Type);
    expect(p2TypeDef?.elements.length).toBe(2);

    // Verify p3 state (comes after p2, has no tokens)
    const p3State = frame.places.p3;
    expect(p3State?.count).toBe(0);
    expect(p3State?.byteOffset).toBe(40); // After p1's 24 bytes + p2's 16 bytes
    const p3Type = simulationInstance.places.get("p3")?.colorId;
    expect(p3Type).toBe("type1");
    const p3TypeDef = input.sdcpn.types.find((tp) => tp.id === p3Type);
    expect(p3TypeDef?.elements.length).toBe(1);

    // Verify buffer layout: [p1: {x:10}, {x:20}, {x:30} | p2: {x:1, y:2}]
    expect(
      decodePlaceTokens(simulationInstance.frameLayout, engineFrame, "p1"),
    ).toEqual([{ x: 10 }, { x: 20 }, { x: 30 }]);
    expect(
      decodePlaceTokens(simulationInstance.frameLayout, engineFrame, "p2"),
    ).toEqual([{ x: 1, y: 2 }]);
    expect(
      decodePlaceTokens(simulationInstance.frameLayout, engineFrame, "p3"),
    ).toEqual([]);

    // Verify transitions exist with initial state
    expect(Object.keys(frame.transitions).length).toBe(2);
    expect(frame.transitions.t1?.timeSinceLastFiringMs).toBe(0);
    expect(frame.transitions.t2?.timeSinceLastFiringMs).toBe(0);
    expect(frame.transitions.t1).not.toHaveProperty("instance");
    expect(simulationInstance.transitions.get("t1")?.name).toBe("Transition 1");

    // Verify all compiled functions exist
    expect(simulationInstance.differentialEquationFns.size).toBe(3);
    expect(simulationInstance.compiledTransitions.size).toBe(2);

    // Verify compiled functions are callable
    const compiledTransition = simulationInstance.compiledTransitions.get("t1");
    expect(compiledTransition).toBeDefined();
    expect(typeof compiledTransition?.lambdaFn).toBe("function");

    const kernelTransition = simulationInstance.compiledTransitions.get("t2");
    expect(kernelTransition).toBeDefined();
    expect(typeof kernelTransition?.kernelFn).toBe("function");
  });

  it("throws error when initialMarking references non-existent place", () => {
    const input: SimulationInput = {
      sdcpn: {
        types: [
          {
            id: "type1",
            name: "Type 1",
            iconSlug: "circle",
            displayColor: "#FF0000",
            elements: [{ elementId: "e1", name: "x", type: "real" }],
          },
        ],
        differentialEquations: [
          {
            id: "diffeq1",
            name: "Differential Equation 1",
            colorId: "type1",
            code: "export default Dynamics((tokens) => tokens.map(() => ({})));",
          },
        ],
        parameters: [],
        places: [
          {
            id: "p1",
            name: "Place 1",
            colorId: "type1",
            dynamicsEnabled: true,
            differentialEquationId: "diffeq1",
            x: 0,
            y: 0,
          },
        ],
        transitions: [],
      },
      initialMarking: {
        p_nonexistent: [{ x: 1.0 }],
      },
      parameterValues: {},
      seed: 42,
      dt: 0.1,
      maxTime: null,
    };

    expect(() => buildSimulation(input)).toThrow(
      "Place with ID p_nonexistent in initialMarking does not exist in SDCPN",
    );
  });

  it("throws error when colored initial marking is not token records", () => {
    const input: SimulationInput = {
      sdcpn: {
        types: [
          {
            id: "type1",
            name: "Type 1",
            iconSlug: "circle",
            displayColor: "#FF0000",
            elements: [
              { elementId: "e1", name: "x", type: "real" },
              { elementId: "e2", name: "y", type: "real" },
            ],
          },
        ],
        differentialEquations: [
          {
            id: "diffeq1",
            name: "Differential Equation 1",
            colorId: "type1",
            code: "export default Dynamics((tokens) => tokens.map(() => ({})));",
          },
        ],
        parameters: [],
        places: [
          {
            id: "p1",
            name: "Place 1",
            colorId: "type1", // Type has 2 dimensions
            dynamicsEnabled: true,
            differentialEquationId: "diffeq1",
            x: 0,
            y: 0,
          },
        ],
        transitions: [],
      },
      initialMarking: {
        p1: 2,
      },
      parameterValues: {},
      seed: 42,
      dt: 0.1,
      maxTime: null,
    };

    expect(() => buildSimulation(input)).toThrow(
      "Initial marking for colored place p1 must be an array of token records",
    );
  });
});
