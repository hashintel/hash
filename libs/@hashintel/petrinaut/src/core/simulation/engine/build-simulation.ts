import { SDCPNItemError } from "../../errors";
import {
  deriveDefaultParameterValues,
  mergeParameterValues,
} from "../../parameter-values";
import { compileUserCode } from "../authoring/user-code/compile-user-code";
import {
  createEngineFrame,
  createEngineFrameLayout,
  type EngineFrameSnapshot,
} from "../frames/internal-frame";
import type {
  DifferentialEquationFn,
  LambdaFn,
  ParameterValues,
  SimulationInput,
  SimulationInstance,
  TransitionKernelFn,
} from "./types";

type PackedInitialPlaceMarking = {
  values: number[];
  count: number;
};

function getInitialMarkingValue(
  initialMarking: SimulationInput["initialMarking"],
  placeId: string,
): SimulationInput["initialMarking"][string] | undefined {
  return Object.prototype.hasOwnProperty.call(initialMarking, placeId)
    ? initialMarking[placeId]
    : undefined;
}

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

function packInitialPlaceMarking(
  place: SimulationInput["sdcpn"]["places"][0],
  sdcpn: SimulationInput["sdcpn"],
  value: SimulationInput["initialMarking"][string] | undefined,
): PackedInitialPlaceMarking {
  const dimensions = getPlaceDimensions(place, sdcpn);

  if (value === undefined) {
    return { values: [], count: 0 };
  }

  if (dimensions === 0) {
    if (typeof value !== "number") {
      throw new Error(
        `Initial marking for uncolored place ${place.id} must be a token count number`,
      );
    }
    return { values: [], count: Math.max(0, Math.round(value)) };
  }

  if (!Array.isArray(value)) {
    throw new Error(
      `Initial marking for colored place ${place.id} must be an array of token records`,
    );
  }

  const type = sdcpn.types.find((tp) => tp.id === place.colorId);
  if (!type) {
    throw new Error(
      `Type with ID ${place.colorId} referenced by place ${place.id} does not exist in SDCPN`,
    );
  }

  const tokenRecords: unknown[] = value;
  const values: number[] = [];
  for (const token of tokenRecords) {
    if (typeof token !== "object" || token === null || Array.isArray(token)) {
      throw new Error(
        `Initial marking token for place ${place.id} must be a record`,
      );
    }
    const tokenRecord = token as Record<string, number>;
    for (const element of type.elements) {
      values.push(Number(tokenRecord[element.name] ?? 0));
    }
  }

  return { values, count: value.length };
}

/**
 * Builds a simulation instance and its initial frame from simulation input.
 *
 * Takes a SimulationInput containing:
 * - SDCPN definition (places, transitions, and their code)
 * - Initial marking (JSON-serializable token distribution across places)
 * - Random seed
 * - Time step (dt)
 *
 * Returns an EngineFrame with:
 * - A SimulationInstance containing compiled user code functions
 * - Initial token distribution in a contiguous buffer
 * - All places and transitions initialized with proper state
 *
 * @param input - The simulation input configuration
 * @returns The initial simulation frame ready for execution
 * @throws {Error} if place IDs in initialMarking don't match places in SDCPN
 * @throws {Error} if a place marking does not match the place color shape
 * @throws {Error} if user code fails to compile
 */
export function buildSimulation(input: SimulationInput): SimulationInstance {
  const {
    sdcpn,
    initialMarking,
    parameterValues: inputParameterValues,
    seed,
    dt,
    maxTime,
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
  for (const placeId of Object.keys(initialMarking)) {
    if (!placesMap.has(placeId)) {
      throw new Error(
        `Place with ID ${placeId} in initialMarking does not exist in SDCPN`,
      );
    }
  }

  const packedInitialMarking = new Map<string, PackedInitialPlaceMarking>();
  for (const place of sdcpn.places) {
    packedInitialMarking.set(
      place.id,
      packInitialPlaceMarking(
        place,
        sdcpn,
        getInitialMarkingValue(initialMarking, place.id),
      ),
    );
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
  const frameLayout = createEngineFrameLayout(sdcpn);
  const placeStates: EngineFrameSnapshot["places"] = {};

  for (const placeId of frameLayout.placeIds) {
    const place = placesMap.get(placeId)!;
    const marking = packedInitialMarking.get(placeId);
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

  for (const placeId of frameLayout.placeIds) {
    const marking = packedInitialMarking.get(placeId);
    if (marking && marking.count > 0) {
      for (let i = 0; i < marking.values.length; i++) {
        buffer[bufferIndex++] = marking.values[i]!;
      }
    }
  }

  // Initialize transition states
  const transitionStates: EngineFrameSnapshot["transitions"] = {};
  for (const transition of sdcpn.transitions) {
    transitionStates[transition.id] = {
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
    maxTime,
    currentTime: 0,
    rngState: seed,
    frameLayout,
    frames: [], // Will be populated with the initial frame
    currentFrameNumber: 0,
  };

  // Create the initial frame
  const initialFrame = createEngineFrame(frameLayout, {
    places: placeStates,
    transitions: transitionStates,
    buffer,
  });

  // Add the initial frame to the simulation instance
  simulationInstance.frames.push(initialFrame);

  return simulationInstance;
}
