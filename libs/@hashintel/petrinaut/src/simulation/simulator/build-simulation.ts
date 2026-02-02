import { SDCPNItemError } from "../../core/errors";
import {
  deriveDefaultParameterValues,
  mergeParameterValues,
} from "../../hooks/use-default-parameter-values";
import { compileUserCode } from "./compile-user-code";
import type {
  DifferentialEquationFn,
  LambdaFn,
  ParameterValues,
  SimulationFrame,
  SimulationInput,
  SimulationInstance,
  TransitionKernelFn,
} from "./types";

/**
 * Get the dimensions (number of elements) for a place based on its type.
 * If the place has no type, returns 0.
 */
function getPlaceDimensions(
  place: SimulationInput["sdcpn"]["places"][0],
  sdcpn: SimulationInput["sdcpn"],
): number {
  if (!place.colorId) {
    return 0;
  }
  const type = sdcpn.types.find((tp) => tp.id === place.colorId);
  if (!type) {
    throw new Error(
      `Type with ID ${place.colorId} referenced by place ${place.id} does not exist in SDCPN`,
    );
  }
  return type.elements.length;
}

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
 * @throws {Error} if place IDs in initialMarking don't match places in SDCPN
 * @throws {Error} if token dimensions don't match place dimensions
 * @throws {Error} if user code fails to compile
 */
export function buildSimulation(input: SimulationInput): SimulationInstance {
  const {
    sdcpn,
    initialMarking,
    parameterValues: inputParameterValues,
    seed,
    dt,
  } = input;

  // Build maps for quick lookup
  const placesMap = new Map(sdcpn.places.map((place) => [place.id, place]));
  const transitionsMap = new Map(
    sdcpn.transitions.map((transition) => [transition.id, transition]),
  );
  const typesMap = new Map(sdcpn.types.map((type) => [type.id, type]));

  // Build parameter values: merge input values with SDCPN defaults
  // Input values (from simulation store) take precedence over defaults
  const defaultParameterValues = deriveDefaultParameterValues(sdcpn.parameters);
  const parameterValues = mergeParameterValues(
    inputParameterValues,
    defaultParameterValues,
  );

  // Validate that all places in initialMarking exist in SDCPN
  for (const placeId of initialMarking.keys()) {
    if (!placesMap.has(placeId)) {
      throw new Error(
        `Place with ID ${placeId} in initialMarking does not exist in SDCPN`,
      );
    }
  }

  // Validate token dimensions match place dimensions
  for (const [placeId, marking] of initialMarking) {
    const place = placesMap.get(placeId)!;
    const dimensions = getPlaceDimensions(place, sdcpn);
    const expectedSize = dimensions * marking.count;
    if (marking.values.length !== expectedSize) {
      throw new Error(
        `Token dimension mismatch for place ${placeId}. Expected ${expectedSize} values (${dimensions} dimensions × ${marking.count} tokens), got ${marking.values.length}`,
      );
    }
  }

  // Compile all differential equation functions
  const differentialEquationFns = new Map<string, DifferentialEquationFn>();
  for (const place of sdcpn.places) {
    // Skip places without dynamics enabled or without differential equation code
    if (!place.dynamicsEnabled || !place.differentialEquationId) {
      continue;
    }

    const differentialEquation = sdcpn.differentialEquations.find(
      (de) => de.id === place.differentialEquationId,
    );
    if (!differentialEquation) {
      throw new Error(
        `Differential equation with ID ${place.differentialEquationId} referenced by place ${place.id} does not exist in SDCPN`,
      );
    }
    const { code } = differentialEquation;

    try {
      const fn = compileUserCode<[Record<string, number>[], ParameterValues]>(
        code,
        "Dynamics",
      );
      differentialEquationFns.set(place.id, fn as DifferentialEquationFn);
    } catch (error) {
      throw new SDCPNItemError(
        `Failed to compile differential equation for place \`${
          place.name
        }\`:\n\n${error instanceof Error ? error.message : String(error)}`,
        place.id,
      );
    }
  }

  // Compile all lambda functions
  const lambdaFns = new Map<string, LambdaFn>();
  for (const transition of sdcpn.transitions) {
    try {
      const fn = compileUserCode<
        [Record<string, Record<string, number>[]>, ParameterValues]
      >(transition.lambdaCode, "Lambda");
      lambdaFns.set(transition.id, fn as LambdaFn);
    } catch (error) {
      throw new SDCPNItemError(
        `Failed to compile Lambda function for transition \`${
          transition.name
        }\`:\n\n${error instanceof Error ? error.message : String(error)}`,
        transition.id,
      );
    }
  }

  // Compile all transition kernel functions
  const transitionKernelFns = new Map<string, TransitionKernelFn>();
  for (const transition of sdcpn.transitions) {
    // Skip transitions without output places that have types
    // (they won't need to generate token data)
    const hasTypedOutputPlace = transition.outputArcs.some((arc) => {
      const place = placesMap.get(arc.placeId);
      return place && place.colorId;
    });

    if (!hasTypedOutputPlace) {
      // Set a dummy function that returns an empty object for transitions
      // without typed output places (they don't need to generate token data)
      transitionKernelFns.set(
        transition.id,
        (() => ({})) as TransitionKernelFn,
      );
      continue;
    }

    try {
      const fn = compileUserCode<
        [Record<string, Record<string, number>[]>, ParameterValues]
      >(transition.transitionKernelCode, "TransitionKernel");
      transitionKernelFns.set(transition.id, fn as TransitionKernelFn);
    } catch (error) {
      throw new SDCPNItemError(
        `Failed to compile transition kernel for transition \`${
          transition.name
        }\`:\n\n${error instanceof Error ? error.message : String(error)}`,
        transition.id,
      );
    }
  }

  // Calculate buffer size and build place states
  let bufferSize = 0;
  const placeStates: SimulationFrame["places"] = {};

  // Process places in a consistent order (sorted by ID)
  const sortedPlaceIds = Array.from(placesMap.keys()).sort();

  for (const placeId of sortedPlaceIds) {
    const place = placesMap.get(placeId)!;
    const marking = initialMarking.get(placeId);
    const count = marking?.count ?? 0;
    const dimensions = getPlaceDimensions(place, sdcpn);

    placeStates[placeId] = {
      offset: bufferSize,
      count,
      dimensions,
    };

    bufferSize += dimensions * count;
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
  const transitionStates: SimulationFrame["transitions"] = {};
  for (const transition of sdcpn.transitions) {
    transitionStates[transition.id] = {
      instance: transition,
      timeSinceLastFiringMs: 0,
      firedInThisFrame: false,
      firingCount: 0,
    };
  }

  // Create the simulation instance (without frames initially)
  const simulationInstance: SimulationInstance = {
    places: placesMap,
    transitions: transitionsMap,
    types: typesMap,
    differentialEquationFns,
    lambdaFns,
    transitionKernelFns,
    parameterValues,
    dt,
    rngState: seed,
    frames: [], // Will be populated with the initial frame
    currentFrameNumber: 0,
  };

  // Create the initial frame
  const initialFrame: SimulationFrame = {
    time: 0,
    places: placeStates,
    transitions: transitionStates,
    buffer,
  };

  // Add the initial frame to the simulation instance
  simulationInstance.frames.push(initialFrame);

  return simulationInstance;
}
