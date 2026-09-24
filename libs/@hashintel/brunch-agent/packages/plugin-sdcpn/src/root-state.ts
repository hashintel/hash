import { z } from "zod";

import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

import { rootArcWhyInputSchema } from "./root-arc";

import type { ConstructionMutationRequest } from "./mutation-record";
import type { SDCPN } from "@hashintel/petrinaut-core";

export const observedStateMutationNames = [
  "addParameter",
  "addDifferentialEquation",
  "addType",
  "updateType",
  "addTypeElement",
  "updateTypeElement",
  "addScenario",
  "updateScenario",
  "addMetric",
  "updateMetric",
] as const;
export type ObservedStateMutationName =
  (typeof observedStateMutationNames)[number];
export const isObservedStateMutation = (
  name: string,
): name is ObservedStateMutationName =>
  observedStateMutationNames.some((entry) => entry === name);
const stateWhyFields = {
  name: z
    .string()
    .describe(
      "Unique name or ID from read_petrinaut_net; for a type element, select within its parent type.",
    ),
  field: z
    .string()
    .default("entity")
    .describe(
      "Explain the whole entity (entity), a top-level field, or an entity-relative JSON pointer such as /initialState/content.",
    ),
  observationToolCallId: rootArcWhyInputSchema.shape.observationToolCallId,
};
/** Root-level state collections addressed by kind; nested type elements are located through their parent type. */
const rootStateCollections = {
  parameter: "parameters",
  "differential-equation": "differentialEquations",
  type: "types",
  scenario: "scenarios",
  metric: "metrics",
} as const;
type RootStateCollectionKind = keyof typeof rootStateCollections;
const rootStateEntries = (
  definition: SDCPN,
  kind: RootStateCollectionKind,
): readonly { id: string; name: string }[] =>
  kind === "scenario"
    ? (definition.scenarios ?? [])
    : kind === "metric"
      ? (definition.metrics ?? [])
      : definition[rootStateCollections[kind]];

export const rootStateWhyInputSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    ...stateWhyFields,
    kind: z.enum([
      "parameter",
      "differential-equation",
      "type",
      "scenario",
      "metric",
    ]),
  }),
  z.strictObject({
    ...stateWhyFields,
    kind: z.literal("type-element"),
    type: z
      .string()
      .describe(
        "Required parent colour/type's unique name or ID; not the element's primitive data type.",
      ),
  }),
]);
export type RootStateWhyInput = z.output<typeof rootStateWhyInputSchema>;
const pointer = (value: string) =>
  value.replaceAll("~", "~0").replaceAll("/", "~1");

/** A field is a top-level field or explicit JSON pointer relative to this entity. */
export const locateRootState = (
  definition: SDCPN,
  query: RootStateWhyInput,
) => {
  const types =
    query.kind === "type-element"
      ? definition.types.filter(
          (entry) => entry.id === query.type || entry.name === query.type,
        )
      : [];
  const parent = types[0];
  if (query.kind === "type-element" && (types.length !== 1 || !parent))
    throw new Error("Unknown or ambiguous parent type; use a unique ID.");
  const entries =
    query.kind === "type-element"
      ? parent!.elements
      : rootStateEntries(definition, query.kind);
  const matches = entries.filter(
    (entry) =>
      ("elementId" in entry ? entry.elementId : entry.id) === query.name ||
      entry.name === query.name,
  );
  const entity = matches[0];
  if (matches.length !== 1 || !entity)
    throw new Error("Unknown or ambiguous state identity; use a unique ID.");
  const index = entries.findIndex((entry) => entry === entity);
  const nodePath =
    query.kind === "type-element"
      ? `/types/${definition.types.indexOf(parent!)}/elements/${index}`
      : `/${rootStateCollections[query.kind]}/${index}`;
  const fields =
    query.field === "entity"
      ? []
      : query.field.startsWith("/")
        ? query.field
            .slice(1)
            .split("/")
            .map((field) => field.replaceAll("~1", "/").replaceAll("~0", "~"))
        : [query.field];
  let value: unknown = entity;
  for (const field of fields) {
    const property =
      typeof value === "object" && value !== null
        ? Object.getOwnPropertyDescriptor(value, field)
        : undefined;
    if (
      property === undefined ||
      !("value" in property) ||
      (Array.isArray(value) && !/^(?:0|[1-9]\d*)$/u.test(field))
    )
      throw new Error(
        "The requested field is absent; no field origin is inferred.",
      );
    value = property.value;
  }
  return {
    ...(query.kind === "type-element"
      ? { kind: query.kind, typeId: parent!.id }
      : { kind: query.kind }),
    id: "elementId" in entity ? entity.elementId : entity.id,
    nodePath,
    path: nodePath + fields.map((field) => `/${pointer(field)}`).join(""),
    value,
    formalism:
      query.kind === "parameter"
        ? "A net parameter has a concrete declared default. This record describes that definition, not an unobserved scenario or run override. The default alone establishes neither an operational quantity nor whether runtime input was provided. Compilation is not simulation."
        : query.kind === "differential-equation"
          ? "A differential equation defines real-valued token derivatives. Token evolution requires a matching typed place with that equation assigned, place dynamics enabled, and dynamics enabled for the run. This record describes the equation definition, not executed evolution or an established time policy. Compilation is not simulation."
          : query.kind === "scenario"
            ? "A scenario is a saved starting condition: initial tokens, parameter overrides and scenario parameters with declared defaults. A scenario parameter's default and type describe what a run may vary, not an operating range, a decision or an observed outcome. Compilation is not simulation."
            : query.kind === "metric"
              ? "A metric is a saved scalar computed from simulated state over time. Its code defines what a run reports, not what is minimised, maximised or enforced; an experiment must name it as an objective for it to become one. Compilation is not simulation."
              : "Types define ordered token attributes. Scenario rows use that order; row/cell paths are positional values, not token identities or continuity. Structural element edits may coerce or default cells. Test initial conditions, canonical defaults and migrations are not observed operational facts. Compilation is not simulation.",
  };
};

export const stateMutationTarget = (
  request: ConstructionMutationRequest,
  definition: SDCPN,
) => {
  if (!isObservedStateMutation(request.toolName))
    throw new Error("Not a state mutation.");
  const input = petrinautAiTools[request.toolName].inputSchema.parse(
    request.input,
  );
  const id =
    "id" in input
      ? input.id
      : "scenarioId" in input
        ? input.scenarioId
        : "metricId" in input
          ? input.metricId
          : "element" in input
            ? input.element.elementId
            : "elementId" in input
              ? input.elementId
              : input.typeId;
  const query = {
    name: id,
    field: "entity",
    ...(request.toolName === "addParameter"
      ? { kind: "parameter" as const }
      : request.toolName === "addDifferentialEquation"
        ? { kind: "differential-equation" as const }
        : request.toolName.includes("Scenario")
          ? { kind: "scenario" as const }
          : request.toolName.includes("Metric")
            ? { kind: "metric" as const }
            : "element" in input || "elementId" in input
              ? { kind: "type-element" as const, type: input.typeId }
              : { kind: "type" as const }),
  };
  const { kind } = query;
  const parent =
    "typeId" in input
      ? definition.types.find((entry) => entry.id === input.typeId)
      : undefined;
  const entries =
    kind === "type-element"
      ? (parent?.elements ?? [])
      : rootStateEntries(definition, kind);
  const exists = entries.some(
    (entry) => ("elementId" in entry ? entry.elementId : entry.id) === id,
  );
  const target =
    request.toolName.startsWith("add") && !exists
      ? {
          nodePath:
            kind === "type-element"
              ? `/types/${definition.types.findIndex((entry) => entry === parent)}/elements/${entries.length}`
              : `/${rootStateCollections[kind]}/${entries.length}`,
          value: undefined,
        }
      : locateRootState(definition, query);
  const raw = request.input as Record<string, unknown>;
  return {
    target,
    creating: request.toolName.startsWith("add"),
    fields:
      "update" in raw
        ? raw.update
        : "element" in raw
          ? raw.element
          : Object.fromEntries(
              Object.entries(raw).filter(([key]) => key !== "targetSubnetId"),
            ),
  };
};
