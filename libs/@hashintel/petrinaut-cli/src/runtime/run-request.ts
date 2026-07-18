import { compileScenario } from "@hashintel/petrinaut-core";

import type {
  InitialMarking,
  InitialPlaceMarking,
  Scenario,
  SDCPN,
} from "@hashintel/petrinaut-core";
import type {
  PetrinautCompiledModelMetadata,
  PetrinautRunConfig,
  PetrinautRunResult,
} from "@hashintel/petrinaut-core/compiled-model";

type JsonRecord = Record<string, unknown>;

const RUN_REQUEST_KEYS = new Set([
  "parameters",
  "initialState",
  "scenario",
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
  scenario?: {
    id: string;
    parameterValues: Record<string, number | boolean>;
  };
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

function resolveMetric(
  metadata: PetrinautCompiledModelMetadata,
  selector: string,
): PetrinautCompiledModelMetadata["metrics"][number] {
  const metric =
    metadata.metrics.find((candidate) => candidate.id === selector) ??
    metadata.metrics.find((candidate) => candidate.name === selector);
  if (!metric) {
    throw new Error(`Metric "${selector}" does not exist in the model`);
  }
  return metric;
}

function normalizeMetrics(
  metadata: PetrinautCompiledModelMetadata,
  request: ServerRunRequest,
): string[] {
  return (request.metrics ?? []).map(
    (selector) => resolveMetric(metadata, selector).id,
  );
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

function parseScenario(value: unknown): ServerRunRequest["scenario"] {
  if (!isObject(value)) {
    throw new Error("scenario must be an object");
  }
  for (const key of Object.keys(value)) {
    if (key !== "id" && key !== "parameterValues") {
      throw new Error(`Unknown scenario field "${key}"`);
    }
  }
  if (typeof value.id !== "string" || value.id.trim() === "") {
    throw new Error("scenario.id must be a non-empty string");
  }
  if (!isObject(value.parameterValues)) {
    throw new Error("scenario.parameterValues must be an object");
  }

  const parameterValues: Record<string, number | boolean> = Object.fromEntries(
    Object.entries(value.parameterValues).map(
      ([identifier, parameterValue]) => {
        if (
          typeof parameterValue !== "boolean" &&
          (typeof parameterValue !== "number" ||
            !Number.isFinite(parameterValue))
        ) {
          throw new Error(
            `Scenario parameter "${identifier}" must be a finite number or boolean`,
          );
        }
        return [identifier, parameterValue] as const;
      },
    ),
  );

  return { id: value.id, parameterValues };
}

function normalizeScenarioParameterValues(
  scenario: Scenario,
  values: Record<string, number | boolean>,
): Record<string, number> {
  const parametersByIdentifier = new Map(
    scenario.scenarioParameters.map((parameter) => [
      parameter.identifier,
      parameter,
    ]),
  );

  return Object.fromEntries(
    Object.entries(values).map(([identifier, value]) => {
      const parameter = parametersByIdentifier.get(identifier);
      if (!parameter) {
        throw new Error(
          `Scenario "${scenario.name}" has no parameter "${identifier}"`,
        );
      }

      let normalizedValue: number;
      switch (parameter.type) {
        case "boolean":
          if (typeof value !== "boolean") {
            throw new Error(
              `Scenario parameter "${identifier}" must be boolean`,
            );
          }
          normalizedValue = value ? 1 : 0;
          break;
        case "integer":
          if (typeof value !== "number" || !Number.isInteger(value)) {
            throw new Error(
              `Scenario parameter "${identifier}" must be an integer`,
            );
          }
          normalizedValue = value;
          break;
        case "ratio":
          if (typeof value !== "number" || value < 0 || value > 1) {
            throw new Error(
              `Scenario parameter "${identifier}" must be between 0 and 1`,
            );
          }
          normalizedValue = value;
          break;
        case "real":
          if (typeof value !== "number") {
            throw new Error(
              `Scenario parameter "${identifier}" must be a number`,
            );
          }
          normalizedValue = value;
          break;
      }
      return [identifier, normalizedValue] as const;
    }),
  );
}

function compileRunScenario(
  sdcpn: SDCPN,
  request: NonNullable<ServerRunRequest["scenario"]>,
): { initialMarking: InitialMarking; parameterValues: Record<string, string> } {
  const scenario = (sdcpn.scenarios ?? []).find(
    (candidate) => candidate.id === request.id,
  );
  if (!scenario) {
    throw new Error(`Scenario "${request.id}" does not exist in the model`);
  }

  const outcome = compileScenario(
    scenario,
    sdcpn.parameters,
    sdcpn.places,
    sdcpn.types,
    {
      scenarioParameterValues: normalizeScenarioParameterValues(
        scenario,
        request.parameterValues,
      ),
    },
  );
  if (!outcome.ok) {
    throw new Error(
      `Scenario "${scenario.name}" could not be compiled: ${outcome.errors
        .map(({ message }) => message)
        .join("; ")}`,
    );
  }

  return {
    initialMarking: outcome.result.initialState,
    parameterValues: outcome.result.parameterValues,
  };
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

  if (
    data.scenario !== undefined &&
    (data.parameters !== undefined || data.initialState !== undefined)
  ) {
    throw new Error(
      "scenario cannot be combined with parameters or initialState",
    );
  }

  return {
    parameters: parseOptionalObject(data.parameters, "parameters"),
    initialState: parseOptionalObject(data.initialState, "initialState"),
    scenario:
      data.scenario === undefined ? undefined : parseScenario(data.scenario),
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
  sdcpn?: SDCPN,
): PetrinautRunConfig {
  if (request.scenario && !sdcpn) {
    throw new Error("Scenario runs require the source model");
  }
  const scenarioConfig =
    request.scenario && sdcpn
      ? compileRunScenario(sdcpn, request.scenario)
      : undefined;
  const common = {
    initialMarking:
      scenarioConfig?.initialMarking ??
      normalizeInitialMarking(metadata, request),
    parameterValues:
      scenarioConfig?.parameterValues ??
      normalizeParameterValues(metadata, request),
    ...(request.seed !== undefined ? { seed: request.seed } : {}),
    ...(request.dt !== undefined ? { dt: request.dt } : {}),
    metrics: normalizeMetrics(metadata, request),
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

/**
 * The compiled model keys metric values by display name. The protocol instead
 * keys each value by the selector supplied by the caller, so stable metric ids
 * remain useful across renames while name-based callers keep their old shape.
 */
export function keyMetricsByRequestedSelector(
  metadata: PetrinautCompiledModelMetadata,
  request: ServerRunRequest,
  result: PetrinautRunResult,
): PetrinautRunResult {
  const selectors = request.metrics ?? [];
  if (selectors.length === 0) {
    return result;
  }

  return {
    ...result,
    metrics: Object.fromEntries(
      selectors.map((selector) => {
        const metric = resolveMetric(metadata, selector);
        const value = result.metrics[metric.name];
        if (value === undefined) {
          throw new Error(`Petrinaut result omitted metric "${metric.name}"`);
        }
        return [selector, value];
      }),
    ),
  };
}
