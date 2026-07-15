import type {
  InitialMarking,
  InitialPlaceMarking,
} from "@hashintel/petrinaut-core";
import type {
  PetrinautCompiledModelMetadata,
  PetrinautRunConfig,
} from "@hashintel/petrinaut-core/compiled-model";

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

const MAX_UNCOLORED_TOKEN_COUNT = 0xffff_ffff;

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
  if (typeof value !== "string" && typeof value !== "number") {
    throw new Error(`Parameter "${key}" must be a number or numeric string`);
  }
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`Parameter "${key}" must be a finite number`);
  }
  return String(number);
}

function normalizeParameterValue(
  parameter: PetrinautCompiledModelMetadata["parameters"][number],
  value: unknown,
  key: string,
): string {
  if (parameter.type === "boolean") {
    if (typeof value === "boolean") {
      return value ? "true" : "false";
    }
    if (value === "true" || value === "false") {
      return value;
    }
    throw new Error(`Boolean parameter "${key}" must be true or false`);
  }

  const normalized = stringifyParameterValue(value, key);
  if (parameter.type === "integer" && !Number.isInteger(Number(normalized))) {
    throw new Error(`Integer parameter "${key}" must be an integer`);
  }
  return normalized;
}

function normalizeParameterValues(
  metadata: PetrinautCompiledModelMetadata,
  request: ServerRunRequest,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(
    asRecord(request.parameters, "parameters"),
  )) {
    const parameter =
      metadata.parameters.find((candidate) => candidate.id === key) ??
      metadata.parameters.findLast(
        (candidate) => candidate.variableName === key,
      ) ??
      metadata.parameters.findLast((candidate) => candidate.name === key);
    if (!parameter) {
      throw new Error(`Unknown parameter "${key}"`);
    }
    values[parameter.variableName] = normalizeParameterValue(
      parameter,
      value,
      key,
    );
  }

  return values;
}

function resolvePlaceId(
  metadata: PetrinautCompiledModelMetadata,
  key: string,
): string {
  const place =
    metadata.places.find((candidate) => candidate.id === key) ??
    metadata.places.findLast((candidate) => candidate.name === key);
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

  if (place.color) {
    if (!Array.isArray(value)) {
      throw new Error(
        `Initial marking for colored place "${place.name}" must be a token array`,
      );
    }
    for (const [index, token] of value.entries()) {
      if (!isObject(token)) {
        throw new Error(
          `Token ${index} for colored place "${place.name}" must be an object`,
        );
      }
    }
    return value as InitialPlaceMarking;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(
      `Initial marking for uncolored place "${place.name}" must be a non-negative integer`,
    );
  }
  if (value > MAX_UNCOLORED_TOKEN_COUNT) {
    throw new Error(
      `Initial marking for uncolored place "${place.name}" must not exceed ${MAX_UNCOLORED_TOKEN_COUNT}`,
    );
  }
  return value;
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

function parseOptionalObject(
  value: unknown,
  fieldName: string,
): JsonRecord | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isObject(value)) {
    throw new Error(`${fieldName} must be an object`);
  }
  return value;
}

function parseOptionalMetrics(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (
    !Array.isArray(value) ||
    !value.every((metric) => typeof metric === "string")
  ) {
    throw new Error("metrics must be an array of strings");
  }
  return value;
}

export function parseServerRunRequest(value: unknown): ServerRunRequest {
  const data = asRecord(value, "request body");
  for (const key of Object.keys(data)) {
    if (!RUN_REQUEST_KEYS.has(key)) {
      throw new Error(`Unknown run request field "${key}"`);
    }
  }

  const maxSteps = parseOptionalFiniteNumber(data.maxSteps, "maxSteps");
  if (maxSteps !== undefined && (!Number.isInteger(maxSteps) || maxSteps < 0)) {
    throw new Error("maxSteps must be a non-negative integer");
  }
  const dt = parseOptionalFiniteNumber(data.dt, "dt");
  if (dt !== undefined && dt <= 0) {
    throw new Error("dt must be a positive number");
  }
  const maxTime =
    data.maxTime === null
      ? null
      : parseOptionalFiniteNumber(data.maxTime, "maxTime");
  if (maxTime !== undefined && maxTime !== null && maxTime < 0) {
    throw new Error("maxTime must be a non-negative number or null");
  }

  return {
    parameters: parseOptionalObject(data.parameters, "parameters"),
    initialState: parseOptionalObject(data.initialState, "initialState"),
    metrics: parseOptionalMetrics(data.metrics),
    maxSteps,
    dt,
    maxTime,
    seed: parseOptionalFiniteNumber(data.seed, "seed"),
  };
}

export function toPetrinautRunConfig(
  metadata: PetrinautCompiledModelMetadata,
  request: ServerRunRequest,
): PetrinautRunConfig {
  const common = {
    initialMarking: normalizeInitialMarking(metadata, request),
    parameterValues: normalizeParameterValues(metadata, request),
    ...(request.seed !== undefined ? { seed: request.seed } : {}),
    ...(request.dt !== undefined ? { dt: request.dt } : {}),
    metrics: normalizeMetrics(request),
  };

  if (request.maxTime !== undefined && request.maxTime !== null) {
    return {
      ...common,
      maxTime: request.maxTime,
      ...(request.maxSteps !== undefined ? { maxSteps: request.maxSteps } : {}),
    };
  }

  if (request.maxSteps === undefined) {
    throw new Error("Run config requires either maxTime or maxSteps");
  }

  return {
    ...common,
    maxSteps: request.maxSteps,
    ...(request.maxTime === null ? { maxTime: null } : {}),
  };
}
