import type {
  InitialMarking,
  InitialPlaceMarking,
  PetrinautCompiledModelMetadata,
  PetrinautRunConfig,
} from "@hashintel/petrinaut-core";

type JsonRecord = Record<string, unknown>;

const RUN_REQUEST_KEYS = new Set([
  "parameters",
  "initialState",
  "metrics",
  "maxSteps",
  "dt",
  "maxTime",
  "seed",
]);

export type ServerRunRequest = {
  parameters?: JsonRecord;
  initialState?: JsonRecord;
  metrics?: string[];
  maxSteps?: number;
  dt?: number;
  maxTime?: number | null;
  seed?: number;
};

function isObject(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseOptionalFiniteNumber(
  value: unknown,
  fieldName: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number`);
  }
  return value;
}

function asRecord(value: unknown, fieldName: string): JsonRecord {
  if (value === undefined) {
    return {};
  }
  if (!isObject(value)) {
    throw new Error(`${fieldName} must be an object`);
  }
  return value;
}

function stringifyParameterValue(value: unknown, key: string): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  throw new Error(`Parameter "${key}" must be a string, number or boolean`);
}

function normalizeParameterValues(
  metadata: PetrinautCompiledModelMetadata,
  request: ServerRunRequest,
): Record<string, string> {
  const byInputName = new Map<string, string>();
  for (const parameter of metadata.parameters) {
    byInputName.set(parameter.variableName, parameter.variableName);
    byInputName.set(parameter.id, parameter.variableName);
    byInputName.set(parameter.name, parameter.variableName);
  }

  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(
    asRecord(request.parameters, "parameters"),
  )) {
    const variableName = byInputName.get(key);
    if (!variableName) {
      throw new Error(`Unknown parameter "${key}"`);
    }
    values[variableName] = stringifyParameterValue(value, key);
  }

  return values;
}

function resolvePlaceId(
  metadata: PetrinautCompiledModelMetadata,
  key: string,
): string {
  const place = metadata.places.find(
    (candidate) => candidate.id === key || candidate.name === key,
  );
  if (!place) {
    throw new Error(`Place "${key}" does not exist`);
  }
  return place.id;
}

function normalizePlaceMarking(
  metadata: PetrinautCompiledModelMetadata,
  placeId: string,
  value: unknown,
): InitialPlaceMarking {
  const place = metadata.places.find((candidate) => candidate.id === placeId);
  if (!place) {
    throw new Error(`Place "${placeId}" does not exist`);
  }

  if (Array.isArray(value)) {
    return value as InitialPlaceMarking;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(
      `Initial marking for place "${place.name}" must be a number or token array`,
    );
  }

  const tokenCount = Math.max(0, Math.round(value));
  if (!place.color) {
    return tokenCount;
  }

  return Array.from({ length: tokenCount }, () => ({}));
}

function normalizeInitialMarking(
  metadata: PetrinautCompiledModelMetadata,
  request: ServerRunRequest,
): InitialMarking {
  const marking: InitialMarking = {};
  for (const [key, value] of Object.entries(
    asRecord(request.initialState, "initialState"),
  )) {
    const placeId = resolvePlaceId(metadata, key);
    marking[placeId] = normalizePlaceMarking(metadata, placeId, value);
  }
  return marking;
}

function normalizeMetrics(request: ServerRunRequest): string[] {
  return request.metrics ?? [];
}

export function parseServerRunRequest(value: unknown): ServerRunRequest {
  const data = asRecord(value, "request body");
  for (const key of Object.keys(data)) {
    if (!RUN_REQUEST_KEYS.has(key)) {
      throw new Error(`Unknown run request field "${key}"`);
    }
  }

  return {
    parameters: isObject(data.parameters) ? data.parameters : undefined,
    initialState: isObject(data.initialState) ? data.initialState : undefined,
    metrics: Array.isArray(data.metrics)
      ? (data.metrics as string[])
      : undefined,
    maxSteps: parseOptionalFiniteNumber(data.maxSteps, "maxSteps"),
    dt: parseOptionalFiniteNumber(data.dt, "dt"),
    maxTime:
      data.maxTime === null
        ? null
        : parseOptionalFiniteNumber(data.maxTime, "maxTime"),
    seed: parseOptionalFiniteNumber(data.seed, "seed"),
  };
}

export function toPetrinautRunConfig(
  metadata: PetrinautCompiledModelMetadata,
  request: ServerRunRequest,
): PetrinautRunConfig {
  return {
    initialMarking: normalizeInitialMarking(metadata, request),
    parameterValues: normalizeParameterValues(metadata, request),
    ...(request.seed !== undefined ? { seed: request.seed } : {}),
    ...(request.dt !== undefined ? { dt: request.dt } : {}),
    ...(request.maxTime !== undefined ? { maxTime: request.maxTime } : {}),
    ...(request.maxSteps !== undefined ? { maxSteps: request.maxSteps } : {}),
    metrics: normalizeMetrics(request),
  };
}
