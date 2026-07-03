import { getArcEndpointPlaceId } from "../../arc-endpoints";
import { SDCPNItemError } from "../../errors";
import {
  DEFAULT_PETRINAUT_EXTENSIONS,
  getEffectiveTransitionLambdaType,
  getTransitionLogicAvailability,
  sanitizeSDCPNForExtensions,
  type PetrinautExtensionSettings,
} from "../../extensions";
import {
  deriveDefaultParameterValues,
  mergeParameterValues,
} from "../../parameter-values";
import { compileUserCode } from "../authoring/user-code/compile-user-code";
import { isDistribution } from "../authoring/user-code/distribution";
import {
  createEngineFrame,
  createEngineFrameLayout,
  type EngineFrameSnapshot,
} from "../frames/internal-frame";
import {
  flattenComponentInstancesForSimulation,
  getArcPlaceNameOverrideKey,
} from "./flatten-component-instances";
import {
  computeTokenSlotLayout,
  createTokenRegionViews,
  encodeTokenToBytes,
  readTokenRecord,
  type TokenSlotLayout,
} from "./token-layout";
import { coerceTokenRecord } from "./token-values";

import type { TokenRecord } from "../../types/sdcpn";
import type {
  CompiledTransition,
  DifferentialEquationFn,
  LambdaFn,
  ParameterValues,
  SimulationInput,
  SimulationInstance,
  TransitionKernelOutput,
  TransitionKernelFn,
  TransitionTokenValues,
} from "./types";

type ColorElement =
  SimulationInput["sdcpn"]["types"][number]["elements"][number];

type PackedInitialPlaceMarking = {
  bytes: Uint8Array;
  count: number;
};

type UserDifferentialEquationFn = (
  tokens: TokenRecord[],
  parameters: ParameterValues,
) => Record<string, number>[];

type UserLambdaFn = (
  tokenValues: TransitionTokenValues,
  parameters: ParameterValues,
) => number | boolean;

type UserTransitionKernelFn = (
  tokenValues: TransitionTokenValues,
  parameters: ParameterValues,
) => TransitionKernelOutput;

function getInitialMarkingValue(
  initialMarking: SimulationInput["initialMarking"],
  placeId: string,
): SimulationInput["initialMarking"][string] | undefined {
  return Object.prototype.hasOwnProperty.call(initialMarking, placeId)
    ? initialMarking[placeId]
    : undefined;
}

/**
 * Get the packed token layout for a place based on its type.
 * If the place has no type, returns null.
 */
function getPlaceTokenLayout(
  place: SimulationInput["sdcpn"]["places"][0],
  sdcpn: SimulationInput["sdcpn"],
): TokenSlotLayout | null {
  if (!place.colorId) {
    return null;
  }
  const type = sdcpn.types.find((tp) => tp.id === place.colorId);
  if (!type) {
    throw new Error(
      `Type with ID ${place.colorId} referenced by place ${place.id} does not exist in SDCPN`,
    );
  }
  return computeTokenSlotLayout(type.elements);
}

const EMPTY_BYTES = new Uint8Array(0);

function packInitialPlaceMarking(
  place: SimulationInput["sdcpn"]["places"][0],
  sdcpn: SimulationInput["sdcpn"],
  value: SimulationInput["initialMarking"][string] | undefined,
): PackedInitialPlaceMarking {
  const tokenLayout = getPlaceTokenLayout(place, sdcpn);

  if (value === undefined) {
    return { bytes: EMPTY_BYTES, count: 0 };
  }

  if (tokenLayout === null || tokenLayout.strideBytes === 0) {
    if (typeof value !== "number") {
      throw new Error(
        `Initial marking for uncolored place ${place.id} must be a token count number`,
      );
    }
    return { bytes: EMPTY_BYTES, count: Math.max(0, Math.round(value)) };
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
  const bytes = new Uint8Array(tokenRecords.length * tokenLayout.strideBytes);
  for (const [tokenIndex, token] of tokenRecords.entries()) {
    if (typeof token !== "object" || token === null || Array.isArray(token)) {
      throw new Error(
        `Initial marking token for place ${place.id} must be a record`,
      );
    }
    const tokenRecord = coerceTokenRecord(
      token as Record<string, unknown>,
      type.elements,
      `Initial marking token for place ${place.id}`,
    );
    bytes.set(
      encodeTokenToBytes(
        tokenLayout,
        tokenRecord,
        `Initial marking token for place ${place.id}`,
      ),
      tokenIndex * tokenLayout.strideBytes,
    );
  }

  return { bytes, count: value.length };
}

function createDifferentialEquationFn({
  placeId,
  tokenLayout,
  parameterValues,
  userFn,
}: {
  placeId: string;
  tokenLayout: TokenSlotLayout;
  parameterValues: ParameterValues;
  userFn: UserDifferentialEquationFn;
}): DifferentialEquationFn {
  const { strideBytes } = tokenLayout;
  const realFields = tokenLayout.fields.filter(
    (field) => field.element.type === "real",
  );
  const realFieldCount = realFields.length;

  return (placeBytes, numberOfTokens) => {
    if (placeBytes.byteLength !== numberOfTokens * strideBytes) {
      throw new Error(
        `Place ${placeId} has ${placeBytes.byteLength} token bytes in frame, expected ${
          numberOfTokens * strideBytes
        }`,
      );
    }

    const { f64, u8 } = createTokenRegionViews(
      placeBytes.buffer,
      placeBytes.byteOffset,
      placeBytes.byteLength,
    );

    const inputTokens: TokenRecord[] = [];
    for (let tokenIndex = 0; tokenIndex < numberOfTokens; tokenIndex++) {
      inputTokens.push(
        readTokenRecord(tokenLayout, f64, u8, tokenIndex * strideBytes),
      );
    }

    const resultTokens = userFn(inputTokens, parameterValues);
    const result = new Float64Array(numberOfTokens * realFieldCount);
    const tokenCount = Math.min(resultTokens.length, numberOfTokens);

    for (let tokenIndex = 0; tokenIndex < tokenCount; tokenIndex++) {
      const token = resultTokens[tokenIndex]!;
      for (let fieldIndex = 0; fieldIndex < realFieldCount; fieldIndex++) {
        const field = realFields[fieldIndex]!;
        result[tokenIndex * realFieldCount + fieldIndex] = Number(
          token[field.element.name] ?? 0,
        );
      }
    }

    return result;
  };
}

function getPlaceElements(
  placeId: string,
  placesMap: ReadonlyMap<string, SimulationInput["sdcpn"]["places"][number]>,
  typesMap: ReadonlyMap<string, SimulationInput["sdcpn"]["types"][number]>,
): readonly ColorElement[] | null {
  const place = placesMap.get(placeId);
  if (!place) {
    throw new Error(
      `Place with ID ${placeId} referenced by transition does not exist in SDCPN`,
    );
  }

  if (!place.colorId) {
    return null;
  }

  const type = typesMap.get(place.colorId);
  if (!type) {
    throw new Error(
      `Type with ID ${place.colorId} referenced by place ${place.id} does not exist in SDCPN`,
    );
  }

  return type.elements;
}

function createLambdaFn({
  transition,
  sdcpn,
  extensions,
  parameterValues,
}: {
  transition: SimulationInput["sdcpn"]["transitions"][number];
  sdcpn: SimulationInput["sdcpn"];
  extensions: PetrinautExtensionSettings;
  parameterValues: ParameterValues;
}): LambdaFn {
  const availability = getTransitionLogicAvailability(
    transition,
    sdcpn,
    extensions,
  );
  const lambdaType = getEffectiveTransitionLambdaType(transition, availability);

  if (!availability.lambda || transition.lambdaCode.trim() === "") {
    return lambdaType === "stochastic" ? () => Infinity : () => true;
  }

  try {
    const userFn = compileUserCode<[TransitionTokenValues, ParameterValues]>(
      transition.lambdaCode,
      "Lambda",
      { enableDistribution: extensions.stochasticity },
    ) as UserLambdaFn;

    return (tokenValues) => userFn(tokenValues, parameterValues);
  } catch (error) {
    throw new SDCPNItemError(
      `Failed to compile Lambda function for transition \`${
        transition.name
      }\`:\n\n${error instanceof Error ? error.message : String(error)}`,
      transition.id,
    );
  }
}

function createTransitionKernelFn({
  transition,
  extensions,
  placesMap,
  parameterValues,
}: {
  transition: SimulationInput["sdcpn"]["transitions"][number];
  extensions: PetrinautExtensionSettings;
  placesMap: ReadonlyMap<string, SimulationInput["sdcpn"]["places"][number]>;
  parameterValues: ParameterValues;
}): TransitionKernelFn {
  const hasTypedOutputPlace = transition.outputArcs.some((arc) => {
    const placeId = getArcEndpointPlaceId(arc);
    const place = placeId ? placesMap.get(placeId) : undefined;
    return Boolean(place?.colorId);
  });

  if (!hasTypedOutputPlace) {
    return () => ({});
  }

  try {
    const userFn = compileUserCode<[TransitionTokenValues, ParameterValues]>(
      transition.transitionKernelCode,
      "TransitionKernel",
      { enableDistribution: extensions.stochasticity },
    ) as UserTransitionKernelFn;

    return (tokenValues) => {
      const output = userFn(tokenValues, parameterValues);
      if (!extensions.stochasticity) {
        for (const [placeName, tokens] of Object.entries(output)) {
          for (const token of tokens) {
            for (const [elementName, value] of Object.entries(token)) {
              if (isDistribution(value)) {
                throw new Error(
                  `Transition kernel output for place "${placeName}" returned a Distribution for "${elementName}", but stochasticity is disabled.`,
                );
              }
            }
          }
        }
      }
      return output;
    };
  } catch (error) {
    throw new SDCPNItemError(
      `Failed to compile transition kernel for transition \`${
        transition.name
      }\`:\n\n${error instanceof Error ? error.message : String(error)}`,
      transition.id,
    );
  }
}

function createCompiledTransition({
  transition,
  placesMap,
  typesMap,
  arcPlaceNameOverrides,
  lambdaFn,
  transitionKernelFn,
}: {
  transition: SimulationInput["sdcpn"]["transitions"][number];
  placesMap: ReadonlyMap<string, SimulationInput["sdcpn"]["places"][number]>;
  typesMap: ReadonlyMap<string, SimulationInput["sdcpn"]["types"][number]>;
  arcPlaceNameOverrides: ReadonlyMap<string, string>;
  lambdaFn: LambdaFn;
  transitionKernelFn: TransitionKernelFn;
}): CompiledTransition {
  return {
    id: transition.id,
    name: transition.name,
    inputPlaces: transition.inputArcs.map((arc) => {
      const placeId = getArcEndpointPlaceId(arc);
      if (!placeId) {
        throw new Error(
          `Input component port endpoint leaked into transition ${transition.id} after simulation flattening`,
        );
      }
      const place = placesMap.get(placeId);
      if (!place) {
        throw new Error(
          `Input place referenced by transition ${transition.id} does not exist in SDCPN`,
        );
      }

      const elements = getPlaceElements(placeId, placesMap, typesMap);
      return {
        placeId,
        placeName:
          arcPlaceNameOverrides.get(
            getArcPlaceNameOverrideKey({
              transitionId: transition.id,
              placeId,
            }),
          ) ?? place.name,
        weight: arc.weight,
        arcType: arc.type,
        elements,
        tokenLayout: elements ? computeTokenSlotLayout(elements) : null,
      };
    }),
    outputPlaces: transition.outputArcs.map((arc) => {
      const placeId = getArcEndpointPlaceId(arc);
      if (!placeId) {
        throw new Error(
          `Output component port endpoint leaked into transition ${transition.id} after simulation flattening`,
        );
      }
      const place = placesMap.get(placeId);
      if (!place) {
        throw new Error(
          `Output place referenced by transition ${transition.id} does not exist in SDCPN`,
        );
      }

      const elements = getPlaceElements(placeId, placesMap, typesMap);
      return {
        placeId,
        placeName:
          arcPlaceNameOverrides.get(
            getArcPlaceNameOverrideKey({
              transitionId: transition.id,
              placeId,
            }),
          ) ?? place.name,
        weight: arc.weight,
        elements,
        tokenLayout: elements ? computeTokenSlotLayout(elements) : null,
      };
    }),
    lambdaFn,
    transitionKernelFn,
  };
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
    initialMarking: inputInitialMarking,
    parameterValues: inputParameterValues,
    seed,
    dt,
    maxTime,
  } = input;
  const extensions = input.extensions ?? DEFAULT_PETRINAUT_EXTENSIONS;
  const sanitizedSdcpn = sanitizeSDCPNForExtensions(input.sdcpn, extensions);

  const defaultParameterValues = deriveDefaultParameterValues(
    sanitizedSdcpn.parameters,
  );
  const rootParameterValues = extensions.parameters
    ? mergeParameterValues(inputParameterValues, defaultParameterValues)
    : {};
  const flattened = flattenComponentInstancesForSimulation({
    sdcpn: sanitizedSdcpn,
    initialMarking: inputInitialMarking,
    rootParameterValues,
    parametersEnabled: extensions.parameters,
  });
  const { sdcpn, initialMarking } = flattened;

  // Build maps for quick lookup
  const placesMap = new Map(sdcpn.places.map((place) => [place.id, place]));
  const transitionsMap = new Map(
    sdcpn.transitions.map((transition) => [transition.id, transition]),
  );
  const typesMap = new Map(sdcpn.types.map((type) => [type.id, type]));

  // Build parameter values: merge input values with SDCPN defaults
  // Input values (from simulation store) take precedence over defaults
  const parameterValues = rootParameterValues;

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
      if (!place.colorId) {
        continue;
      }

      const type = typesMap.get(place.colorId);
      if (!type) {
        throw new Error(
          `Type with ID ${place.colorId} referenced by place ${place.id} does not exist in SDCPN`,
        );
      }

      if (!type.elements.some((element) => element.type === "real")) {
        continue;
      }

      const userFn = compileUserCode<[TokenRecord[], ParameterValues]>(
        code,
        "Dynamics",
        { enableDistribution: extensions.stochasticity },
      ) as UserDifferentialEquationFn;
      differentialEquationFns.set(
        place.id,
        createDifferentialEquationFn({
          placeId: place.id,
          tokenLayout: computeTokenSlotLayout(type.elements),
          parameterValues:
            flattened.placeParameterValues.get(place.id) ?? parameterValues,
          userFn,
        }),
      );
    } catch (error) {
      throw new SDCPNItemError(
        `Failed to compile differential equation for place \`${
          place.name
        }\`:\n\n${error instanceof Error ? error.message : String(error)}`,
        place.id,
      );
    }
  }

  // Compile transitions into the shape used by the execution hot path.
  const compiledTransitions = new Map<string, CompiledTransition>();
  for (const transition of sdcpn.transitions) {
    compiledTransitions.set(
      transition.id,
      createCompiledTransition({
        transition,
        placesMap,
        typesMap,
        arcPlaceNameOverrides: flattened.arcPlaceNameOverrides,
        lambdaFn: createLambdaFn({
          transition,
          sdcpn,
          extensions,
          parameterValues:
            flattened.transitionParameterValues.get(transition.id) ??
            parameterValues,
        }),
        transitionKernelFn: createTransitionKernelFn({
          transition,
          extensions,
          placesMap,
          parameterValues:
            flattened.transitionParameterValues.get(transition.id) ??
            parameterValues,
        }),
      }),
    );
  }

  // Calculate buffer size and build place states
  let bufferByteSize = 0;
  const frameLayout = createEngineFrameLayout(sdcpn);
  const placeStates: EngineFrameSnapshot["places"] = {};

  for (const [placeIndex, placeId] of frameLayout.placeIds.entries()) {
    const marking = packedInitialMarking.get(placeId);
    const count = marking?.count ?? 0;
    const strideBytes = frameLayout.placeStrideBytes[placeIndex] ?? 0;

    placeStates[placeId] = {
      byteOffset: bufferByteSize,
      count,
      strideBytes,
    };

    bufferByteSize += strideBytes * count;
  }

  // Build the initial buffer with token bytes
  const buffer = new Uint8Array(bufferByteSize);
  let bufferByteOffset = 0;

  for (const placeId of frameLayout.placeIds) {
    const marking = packedInitialMarking.get(placeId);
    if (marking && marking.bytes.byteLength > 0) {
      buffer.set(marking.bytes, bufferByteOffset);
      bufferByteOffset += marking.bytes.byteLength;
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
    compiledTransitions,
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
