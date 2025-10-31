import { compileUserCode } from "./helpers/compile-user-code";
import type {
  DifferentialEquationFn,
  LambdaFn,
  SimulationFrame,
  SimulationInput,
  SimulationInstance,
  TransitionKernelFn,
} from "./types/simulation";

/**
 * Builds a simulation instance and its initial frame from simulation input.
 *
 * Takes a SimulationInput containing:
 * - SDCPN definition (places, transitions, and their code)
 * - Initial marking (token distribution across places)
 * - Random seed
 * - Time step (dt)
 *
 * Returns a SimulationFrame with:
 * - A SimulationInstance containing compiled user code functions
 * - Initial token distribution in a contiguous buffer
 * - All places and transitions initialized with proper state
 *
 * @param input - The simulation input configuration
 * @returns The initial simulation frame ready for execution
 * @throws Error if place IDs in initialMarking don't match places in SDCPN
 * @throws Error if token dimensions don't match place dimensions
 * @throws Error if user code fails to compile
 */
export function buildSimulation(input: SimulationInput): SimulationFrame {
  const { sdcpn, initialMarking, seed, dt } = input;

  // Build maps for quick lookup
  const placesMap = new Map(sdcpn.places.map((place) => [place.id, place]));
  const transitionsMap = new Map(
    sdcpn.transitions.map((transition) => [transition.id, transition])
  );

  // Validate that all places in initialMarking exist in SDCPN
  for (const placeId of initialMarking.keys()) {
    if (!placesMap.has(placeId)) {
      throw new Error(
        `Place with ID ${placeId} in initialMarking does not exist in SDCPN`
      );
    }
  }

  // Validate token dimensions match place dimensions
  for (const [placeId, marking] of initialMarking) {
    const place = placesMap.get(placeId)!;
    const expectedSize = place.dimensions * marking.count;
    if (marking.values.length !== expectedSize) {
      throw new Error(
        `Token dimension mismatch for place ${placeId}. Expected ${expectedSize} values (${place.dimensions} dimensions × ${marking.count} tokens), got ${marking.values.length}`
      );
    }
  }

  // Compile all differential equation functions
  const differentialEquationFns = new Map<string, DifferentialEquationFn>();
  for (const place of sdcpn.places) {
    try {
      const fn = compileUserCode<[Float64Array, number]>(
        place.differentialEquationCode,
        "Dynamics"
      );
      differentialEquationFns.set(place.id, fn as DifferentialEquationFn);
    } catch (error) {
      throw new Error(
        `Failed to compile differential equation for place ${place.id}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  // Compile all lambda functions
  const lambdaFns = new Map<string, LambdaFn>();
  for (const transition of sdcpn.transitions) {
    try {
      const fn = compileUserCode<[number[][][]]>(
        transition.lambdaCode,
        "Lambda"
      );
      lambdaFns.set(transition.id, fn as LambdaFn);
    } catch (error) {
      throw new Error(
        `Failed to compile lambda function for transition ${transition.id}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  // Compile all transition kernel functions
  const transitionKernelFns = new Map<string, TransitionKernelFn>();
  for (const transition of sdcpn.transitions) {
    try {
      const fn = compileUserCode<[number[][][]]>(
        transition.transitionKernelCode,
        "TransitionKernel"
      );
      transitionKernelFns.set(transition.id, fn as TransitionKernelFn);
    } catch (error) {
      throw new Error(
        `Failed to compile transition kernel for transition ${transition.id}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  // Calculate buffer size and build place states
  let bufferSize = 0;
  const placeStates = new Map<
    string,
    { instance: (typeof sdcpn.places)[0]; offset: number; count: number }
  >();

  // Process places in a consistent order (sorted by ID)
  const sortedPlaceIds = Array.from(placesMap.keys()).sort();

  for (const placeId of sortedPlaceIds) {
    const place = placesMap.get(placeId)!;
    const marking = initialMarking.get(placeId);
    const count = marking?.count ?? 0;

    placeStates.set(placeId, {
      instance: place,
      offset: bufferSize,
      count,
    });

    bufferSize += place.dimensions * count;
  }

  // Build the initial buffer with token values
  const buffer = new Float64Array(bufferSize);
  let bufferIndex = 0;

  for (const placeId of sortedPlaceIds) {
    const marking = initialMarking.get(placeId);
    if (marking && marking.count > 0) {
      for (let i = 0; i < marking.values.length; i++) {
        buffer[bufferIndex++] = marking.values[i]!;
      }
    }
  }

  // Initialize transition states
  const transitionStates = new Map(
    sdcpn.transitions.map((transition) => [
      transition.id,
      {
        instance: transition,
        timeSinceLastFiring: 0,
      },
    ])
  );

  // Create the simulation instance (without frames initially)
  const simulationInstance: SimulationInstance = {
    id: sdcpn.id,
    title: sdcpn.title,
    places: placesMap,
    transitions: transitionsMap,
    differentialEquationFns,
    lambdaFns,
    transitionKernelFns,
    dt,
    rngState: seed,
    frames: [], // Will be populated with the initial frame
    currentFrameNumber: 0,
  };

  // Create the initial frame
  const initialFrame: SimulationFrame = {
    simulation: simulationInstance,
    time: 0,
    places: placeStates,
    transitions: transitionStates,
    buffer,
  };

  // Add the initial frame to the simulation instance
  simulationInstance.frames.push(initialFrame);

  return initialFrame;
}
