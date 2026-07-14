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
  fingerprintHirCompilationInput,
  instantiateHirBufferDynamics,
  instantiateHirBufferKernel,
  instantiateHirBufferLambda,
} from "../../hir-runtime";
import {
  deriveDefaultParameterValues,
  mergeParameterValues,
} from "../../parameter-values";
import {
  createEngineFrame,
  createEngineFrameLayout,
  type EngineFrameSnapshot,
} from "../frames/internal-frame";
import {
  flattenComponentInstancesForSimulation,
  getArcPlaceNameOverrideKey,
} from "./flatten-component-instances";
import { StringPool } from "./string-pool";
import {
  computeTokenSlotLayout,
  createTokenRegionViews,
  encodeTokenToBytes,
  type TokenSlotLayout,
} from "./token-layout";
import { coerceTokenRecord } from "./token-values";

import type {
  HirArtifacts,
  HirCompiledBufferKernel,
  HirCompiledBufferLambda,
  HirDynamicsArtifact,
  HirKernelArtifact,
  HirLambdaArtifact,
} from "../../hir-runtime";
import type {
  CompiledTransition,
  DifferentialEquationFn,
  ParameterValues,
  SimulationInput,
  SimulationInstance,
} from "./types";

type ColorElement =
  SimulationInput["sdcpn"]["types"][number]["elements"][number];

type PackedInitialPlaceMarking = {
  bytes: Uint8Array;
  count: number;
};

function validateHirArtifacts(
  artifacts: HirArtifacts | undefined,
  sanitizedSdcpn: SimulationInput["sdcpn"],
  extensions: PetrinautExtensionSettings,
): void {
  if (!artifacts) {
    return;
  }

  const runtimeVersion: unknown = (artifacts as { version?: unknown }).version;
  if (runtimeVersion !== 4) {
    throw new Error(
      `The compiled HIR artifacts use unsupported version ${String(runtimeVersion)}; expected version 4. Recompile them from the current net.`,
    );
  }

  const expectedFingerprint = fingerprintHirCompilationInput(
    sanitizedSdcpn,
    extensions,
  );
  if (artifacts.fingerprint !== expectedFingerprint) {
    throw new Error(
      "The compiled HIR artifacts do not match the current net, code, or extension settings. Recompile them before starting the simulation.",
    );
  }
}

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
  stringPool: StringPool,
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
        stringPool,
      ),
      tokenIndex * tokenLayout.strideBytes,
    );
  }

  return { bytes, count: value.length };
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

/**
 * Recovers the pre-flattening item id: flattening scopes ids as
 * `instancePath::originalId`, while HIR artifacts are keyed by the original
 * (root or subnet-local) id.
 */
function sourceItemId(flattenedId: string): string {
  const separatorIndex = flattenedId.lastIndexOf("::");
  return separatorIndex === -1
    ? flattenedId
    : flattenedId.slice(separatorIndex + 2);
}

/** Error for items whose code has no compiled artifact (outside the
 * supported subset, or artifacts not supplied). */
function missingArtifactError(
  kind: string,
  name: string,
  itemId: string,
): SDCPNItemError {
  return new SDCPNItemError(
    `The ${kind} code for \`${name}\` has not been compiled. Either the code is outside the supported Petrinaut code subset (check the Diagnostics tab for details) or the simulation was started without compiled artifacts.`,
    itemId,
  );
}

/**
 * Expected `indices.length` for a transition: one slot per token of each
 * colored, non-inhibitor input arc whose color has at least one element —
 * must match the emitter's layout (see `hir/surface-context.ts`).
 */
function computeInputSlotCount(
  transition: SimulationInput["sdcpn"]["transitions"][number],
  placesMap: ReadonlyMap<string, SimulationInput["sdcpn"]["places"][number]>,
  typesMap: ReadonlyMap<string, SimulationInput["sdcpn"]["types"][number]>,
): number {
  let slots = 0;
  for (const arc of transition.inputArcs) {
    if (arc.type === "inhibitor") {
      continue;
    }
    const placeId = getArcEndpointPlaceId(arc);
    const place = placeId ? placesMap.get(placeId) : undefined;
    const color = place?.colorId ? typesMap.get(place.colorId) : undefined;
    if (color && color.elements.length > 0) {
      slots += arc.weight;
    }
  }
  return slots;
}

/**
 * Expected `placeBases.length` for a transition: one entry per colored,
 * non-inhibitor input arc whose color has at least one element — the arcs
 * that contribute slots in `computeInputSlotCount`, counted once each.
 */
function computeColoredInputArcCount(
  transition: SimulationInput["sdcpn"]["transitions"][number],
  placesMap: ReadonlyMap<string, SimulationInput["sdcpn"]["places"][number]>,
  typesMap: ReadonlyMap<string, SimulationInput["sdcpn"]["types"][number]>,
): number {
  let arcs = 0;
  for (const arc of transition.inputArcs) {
    if (arc.type === "inhibitor") {
      continue;
    }
    const placeId = getArcEndpointPlaceId(arc);
    const place = placeId ? placesMap.get(placeId) : undefined;
    const color = place?.colorId ? typesMap.get(place.colorId) : undefined;
    if (color && color.elements.length > 0) {
      arcs += 1;
    }
  }
  return arcs;
}

/**
 * Expected kernel staging byte length: colored output arcs place-major (arc
 * order), `weight` tokens back-to-back at the color's packed stride — must
 * match the kernel emitter's `outputByteCount` (see `hir/emit-buffer-js.ts`).
 */
function computeKernelStagingSize(
  transition: SimulationInput["sdcpn"]["transitions"][number],
  placesMap: ReadonlyMap<string, SimulationInput["sdcpn"]["places"][number]>,
  typesMap: ReadonlyMap<string, SimulationInput["sdcpn"]["types"][number]>,
): number {
  let bytes = 0;
  for (const arc of transition.outputArcs) {
    const placeId = getArcEndpointPlaceId(arc);
    const place = placeId ? placesMap.get(placeId) : undefined;
    const color = place?.colorId ? typesMap.get(place.colorId) : undefined;
    if (color) {
      bytes += arc.weight * computeTokenSlotLayout(color.elements).strideBytes;
    }
  }
  return bytes;
}

function createLambdaFn({
  transition,
  sdcpn,
  extensions,
  parameterValues,
  artifact,
  expectedSlotCount,
  stringPool,
}: {
  transition: SimulationInput["sdcpn"]["transitions"][number];
  sdcpn: SimulationInput["sdcpn"];
  extensions: PetrinautExtensionSettings;
  parameterValues: ParameterValues;
  artifact: HirLambdaArtifact | undefined;
  expectedSlotCount: number;
  stringPool: StringPool;
}): HirCompiledBufferLambda {
  const availability = getTransitionLogicAvailability(
    transition,
    sdcpn,
    extensions,
  );
  const lambdaType = getEffectiveTransitionLambdaType(transition, availability);

  if (!availability.lambda || transition.lambdaCode.trim() === "") {
    // Buffer-ABI-shaped constants — the arguments are ignored.
    return lambdaType === "stochastic" ? () => Infinity : () => true;
  }

  if (!artifact) {
    throw missingArtifactError("Lambda", transition.name, transition.id);
  }

  if (artifact.inputSlotCount !== expectedSlotCount) {
    throw new SDCPNItemError(
      `The compiled Lambda for transition \`${transition.name}\` expects ${artifact.inputSlotCount} input token slot(s) but the net requires ${expectedSlotCount}. The compiled artifacts are stale — recompile them from the current net.`,
      transition.id,
    );
  }

  try {
    return instantiateHirBufferLambda(
      artifact.source,
      parameterValues,
      stringPool,
    );
  } catch (error) {
    throw new SDCPNItemError(
      `Failed to instantiate the compiled Lambda for transition \`${
        transition.name
      }\`:\n\n${error instanceof Error ? error.message : String(error)}`,
      transition.id,
    );
  }
}

function createTransitionKernelFn({
  transition,
  placesMap,
  parameterValues,
  artifact,
  expectedSlotCount,
  expectedStagingSize,
  stringPool,
}: {
  transition: SimulationInput["sdcpn"]["transitions"][number];
  placesMap: ReadonlyMap<string, SimulationInput["sdcpn"]["places"][number]>;
  parameterValues: ParameterValues;
  artifact: HirKernelArtifact | undefined;
  expectedSlotCount: number;
  expectedStagingSize: number;
  stringPool: StringPool;
}): HirCompiledBufferKernel | null {
  const hasTypedOutputPlace = transition.outputArcs.some((arc) => {
    const placeId = getArcEndpointPlaceId(arc);
    const place = placeId ? placesMap.get(placeId) : undefined;
    return Boolean(place?.colorId);
  });

  if (!hasTypedOutputPlace) {
    return null;
  }

  if (!artifact) {
    throw missingArtifactError(
      "transition kernel",
      transition.name,
      transition.id,
    );
  }

  if (artifact.inputSlotCount !== expectedSlotCount) {
    throw new SDCPNItemError(
      `The compiled transition kernel for transition \`${transition.name}\` expects ${artifact.inputSlotCount} input token slot(s) but the net requires ${expectedSlotCount}. The compiled artifacts are stale — recompile them from the current net.`,
      transition.id,
    );
  }

  if (artifact.outputByteCount !== expectedStagingSize) {
    throw new SDCPNItemError(
      `The compiled transition kernel for transition \`${transition.name}\` writes ${artifact.outputByteCount} output byte(s) but the net requires ${expectedStagingSize}. The compiled artifacts are stale — recompile them from the current net.`,
      transition.id,
    );
  }

  try {
    return instantiateHirBufferKernel(
      artifact.source,
      parameterValues,
      stringPool,
    );
  } catch (error) {
    throw new SDCPNItemError(
      `Failed to instantiate the compiled transition kernel for transition \`${
        transition.name
      }\`:\n\n${error instanceof Error ? error.message : String(error)}`,
      transition.id,
    );
  }
}

function createCompiledTransition({
  transition,
  sdcpn,
  extensions,
  placesMap,
  typesMap,
  arcPlaceNameOverrides,
  parameterValues,
  lambdaArtifact,
  kernelArtifact,
  stringPool,
}: {
  transition: SimulationInput["sdcpn"]["transitions"][number];
  sdcpn: SimulationInput["sdcpn"];
  extensions: PetrinautExtensionSettings;
  placesMap: ReadonlyMap<string, SimulationInput["sdcpn"]["places"][number]>;
  typesMap: ReadonlyMap<string, SimulationInput["sdcpn"]["types"][number]>;
  arcPlaceNameOverrides: ReadonlyMap<string, string>;
  parameterValues: ParameterValues;
  lambdaArtifact: HirLambdaArtifact | undefined;
  kernelArtifact: HirKernelArtifact | undefined;
  stringPool: StringPool;
}): CompiledTransition {
  const expectedSlotCount = computeInputSlotCount(
    transition,
    placesMap,
    typesMap,
  );
  const coloredInputArcCount = computeColoredInputArcCount(
    transition,
    placesMap,
    typesMap,
  );
  const stagingSize = computeKernelStagingSize(transition, placesMap, typesMap);
  const lambdaFn = createLambdaFn({
    transition,
    sdcpn,
    extensions,
    parameterValues,
    artifact: lambdaArtifact,
    expectedSlotCount,
    stringPool,
  });
  const kernelFn = createTransitionKernelFn({
    transition,
    placesMap,
    parameterValues,
    artifact: kernelArtifact,
    expectedSlotCount,
    expectedStagingSize: stagingSize,
    stringPool,
  });

  const kernelStaging = new Uint8Array(stagingSize);
  const kernelStagingViews = createTokenRegionViews(
    kernelStaging.buffer,
    0,
    kernelStaging.byteLength,
  );

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
    kernelFn,
    placeBases: new Int32Array(coloredInputArcCount),
    indices: new Int32Array(expectedSlotCount),
    kernelStaging,
    kernelStagingViews,
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
  validateHirArtifacts(input.hirArtifacts, sanitizedSdcpn, extensions);

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

  // Per-run string intern pool. Initial marking packing below interns string
  // attribute values into it; the pool lives on the simulation instance.
  const stringPool = new StringPool();

  const packedInitialMarking = new Map<string, PackedInitialPlaceMarking>();
  for (const place of sdcpn.places) {
    packedInitialMarking.set(
      place.id,
      packInitialPlaceMarking(
        place,
        sdcpn,
        getInitialMarkingValue(initialMarking, place.id),
        stringPool,
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

      const placeParameterValues =
        flattened.placeParameterValues.get(place.id) ?? parameterValues;

      const artifact: HirDynamicsArtifact | undefined =
        input.hirArtifacts?.dynamics[sourceItemId(differentialEquation.id)];
      if (!artifact) {
        throw missingArtifactError(
          "dynamics",
          differentialEquation.name,
          place.id,
        );
      }

      // Buffer-native program: matches the byte-addressed
      // DifferentialEquationFn shape directly — no per-token record decoding.
      differentialEquationFns.set(
        place.id,
        instantiateHirBufferDynamics(
          artifact.source,
          placeParameterValues,
          stringPool,
        ),
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
        sdcpn,
        extensions,
        placesMap,
        typesMap,
        arcPlaceNameOverrides: flattened.arcPlaceNameOverrides,
        parameterValues:
          flattened.transitionParameterValues.get(transition.id) ??
          parameterValues,
        lambdaArtifact:
          input.hirArtifacts?.lambdas[sourceItemId(transition.id)],
        kernelArtifact:
          input.hirArtifacts?.kernels[sourceItemId(transition.id)],
        stringPool,
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
    stringPool,
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
