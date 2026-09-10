import * as v from "valibot";

import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

import { observedArcEnvelopeSchema } from "./root-arc";

import type { ConstructionMutationRequest } from "./transition-record";
import type { SDCPN } from "@hashintel/petrinaut-core";
import type { z } from "zod";

export const observedStateMutationNames = [
  "addParameter",
  "addType",
  "updateType",
  "addTypeElement",
  "updateTypeElement",
  "addScenario",
  "updateScenario",
] as const;
export type ObservedStateMutationName =
  (typeof observedStateMutationNames)[number];
export const isObservedStateMutation = (
  name: string,
): name is ObservedStateMutationName =>
  observedStateMutationNames.some((entry) => entry === name);
const rootOnly = (input: { targetSubnetId?: string | null }) =>
  !input.targetSubnetId;
const schemas = {
  addParameter: petrinautAiTools.addParameter.inputSchema
    .safeExtend({ brunch: observedArcEnvelopeSchema })
    .refine(rootOnly, "Nested parameter construction is unavailable.")
    .meta(petrinautAiTools.addParameter.inputSchema.meta() ?? {}),
  addType: petrinautAiTools.addType.inputSchema
    .safeExtend({ brunch: observedArcEnvelopeSchema })
    .refine(rootOnly)
    .meta(petrinautAiTools.addType.inputSchema.meta() ?? {}),
  updateType: petrinautAiTools.updateType.inputSchema
    .safeExtend({ brunch: observedArcEnvelopeSchema })
    .refine(rootOnly)
    .meta(petrinautAiTools.updateType.inputSchema.meta() ?? {}),
  addTypeElement: petrinautAiTools.addTypeElement.inputSchema
    .safeExtend({ brunch: observedArcEnvelopeSchema })
    .refine(rootOnly)
    .meta(petrinautAiTools.addTypeElement.inputSchema.meta() ?? {}),
  updateTypeElement: petrinautAiTools.updateTypeElement.inputSchema
    .safeExtend({ brunch: observedArcEnvelopeSchema })
    .refine(rootOnly)
    .meta(petrinautAiTools.updateTypeElement.inputSchema.meta() ?? {}),
  addScenario: petrinautAiTools.addScenario.inputSchema
    .safeExtend({ brunch: observedArcEnvelopeSchema })
    .meta(petrinautAiTools.addScenario.inputSchema.meta() ?? {}),
  updateScenario: petrinautAiTools.updateScenario.inputSchema
    .safeExtend({ brunch: observedArcEnvelopeSchema })
    .meta(petrinautAiTools.updateScenario.inputSchema.meta() ?? {}),
};
export const observedStateInputSchema = (name: ObservedStateMutationName) =>
  schemas[name];

/** Validate natively but retain raw field presence: a default is not authored input. */
export const parseObservedStateInput = (
  name: ObservedStateMutationName,
  input: unknown,
) => {
  schemas[name].parse(input);
  return input as z.input<(typeof schemas)[ObservedStateMutationName]>;
};

export const rootStateWhyInputSchema = v.strictObject({
  kind: v.picklist(["parameter", "type", "type-element", "scenario"]),
  name: v.string(),
  type: v.optional(v.string()),
  field: v.optional(v.string(), "entity"),
  observationToolCallId: v.optional(v.string()),
});
export type RootStateWhyInput = v.InferOutput<typeof rootStateWhyInputSchema>;
const pointer = (value: string) =>
  value.replaceAll("~", "~0").replaceAll("/", "~1");

/** A field is a top-level field or explicit JSON pointer relative to this entity. */
export const locateRootState = (
  definition: SDCPN,
  query: RootStateWhyInput,
) => {
  const types = definition.types.filter(
    (entry) => entry.id === query.type || entry.name === query.type,
  );
  const parent = types[0];
  if (query.kind === "type-element" && (types.length !== 1 || !parent))
    throw new Error("Unknown or ambiguous parent type; use a unique ID.");
  if (query.kind !== "type-element" && query.type !== undefined)
    throw new Error("Only a type-element query accepts a parent type.");
  const entries =
    query.kind === "type-element"
      ? parent!.elements
      : query.kind === "type"
        ? definition.types
        : query.kind === "parameter"
          ? definition.parameters
          : (definition.scenarios ?? []);
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
      : `/${query.kind === "type" ? "types" : query.kind === "parameter" ? "parameters" : "scenarios"}/${index}`;
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
    if (
      typeof value !== "object" ||
      value === null ||
      !Object.hasOwn(value, field) ||
      (Array.isArray(value) && !/^(?:0|[1-9]\d*)$/u.test(field))
    )
      throw new Error(
        "The requested field is absent; no field origin is inferred.",
      );
    value = (value as Record<string, unknown>)[field];
  }
  return {
    kind: query.kind,
    id: "elementId" in entity ? entity.elementId : entity.id,
    ...(query.kind === "type-element" ? { typeId: parent!.id } : {}),
    nodePath,
    path: nodePath + fields.map((field) => `/${pointer(field)}`).join(""),
    value,
    formalism:
      query.kind === "parameter"
        ? "A net parameter has a concrete declared default. This record describes that definition, not an unobserved scenario or run override. The default alone establishes neither an operational quantity nor whether runtime input was provided. Compilation is not simulation."
        : "Types define ordered token attributes. Scenario rows use that order; row/cell paths are positional values, not token identities or continuity. Structural element edits may coerce or default cells. Test initial conditions, canonical defaults and migrations are not observed operational facts. Compilation is not simulation.",
  };
};

/** Guard identity from full verified observations before the canonical action (which permits duplicates). */
export const assertStateIdentity = (
  mutation: Pick<ConstructionMutationRequest, "toolName" | "input">,
  current: SDCPN,
  earlier: readonly SDCPN[],
) => {
  if (!isObservedStateMutation(mutation.toolName)) return;
  const input = petrinautAiTools[mutation.toolName].inputSchema.parse(
    mutation.input,
  );
  if ("targetSubnetId" in input && input.targetSubnetId)
    throw new Error("Nested construction is unavailable.");
  // Migration searches root and subnet types/places. Do not admit an unearned nested footprint.
  if (
    (current.subnets?.length ?? 0) ||
    (current.componentInstances?.length ?? 0)
  )
    throw new Error(
      "Typed construction with nested nets/components is unavailable.",
    );
  const identities = (definition: SDCPN) =>
    [
      ...definition.places,
      ...definition.transitions,
      ...definition.types,
      ...definition.parameters,
      ...definition.differentialEquations,
      ...(definition.scenarios ?? []),
      ...(definition.subnets ?? []),
      ...(definition.componentInstances ?? []),
    ].map((entry) => entry.id);
  const newIdentity = (
    id: string,
    live: readonly string[],
    history: readonly string[],
  ) => {
    if (live.includes(id))
      throw new Error("Duplicate identity cannot be created.");
    if (history.includes(id))
      throw new Error(
        "Known-retired identity cannot be reused; choose a new identity.",
      );
  };
  if ("id" in input) {
    newIdentity(input.id, identities(current), earlier.flatMap(identities));
    if ("elements" in input) {
      const ids = input.elements.map((element) => element.elementId);
      if (new Set(ids).size !== ids.length)
        throw new Error("Duplicate nested element identity cannot be created.");
    }
  } else if ("typeId" in input) {
    const types = current.types.filter((entry) => entry.id === input.typeId);
    const type = types[0];
    if (types.length !== 1 || !type)
      throw new Error("Unknown or ambiguous type identity.");
    const ids = type.elements.map((element) => element.elementId);
    if (new Set(ids).size !== ids.length)
      throw new Error("Ambiguous nested element identity.");
    if ("element" in input)
      newIdentity(
        input.element.elementId,
        ids,
        earlier.flatMap((definition) =>
          definition.types
            .filter((entry) => entry.id === input.typeId)
            .flatMap((entry) =>
              entry.elements.map((element) => element.elementId),
            ),
        ),
      );
    if (
      "elementId" in input &&
      ids.filter((id) => id === input.elementId).length !== 1
    )
      throw new Error("Unknown or ambiguous nested element identity.");
  } else if (
    current.scenarios?.filter((entry) => entry.id === input.scenarioId)
      .length !== 1
  )
    throw new Error("Unknown or ambiguous scenario identity.");
  const scenario =
    "initialState" in input
      ? input
      : "update" in input && "initialState" in input.update
        ? input.update
        : undefined;
  if (scenario?.initialState && scenario.initialState.type !== "per_place")
    throw new Error(
      "Only per_place initial-state footprints are currently available; code and ad-hoc scenario authoring remain unavailable.",
    );
  if (
    current.scenarios?.some((entry) => entry.initialState.type !== "per_place")
  )
    throw new Error(
      "Typed edits with code or ad-hoc scenario footprints are unavailable.",
    );
  if (scenario?.initialState?.type === "per_place") {
    for (const id of Object.keys(scenario.initialState.content))
      if (current.places.filter((place) => place.id === id).length !== 1)
        throw new Error("Initial state requires unique existing place IDs.");
  }
  const overrides =
    "parameterOverrides" in input
      ? input.parameterOverrides
      : "update" in input && "parameterOverrides" in input.update
        ? input.update.parameterOverrides
        : undefined;
  for (const id of Object.keys(overrides ?? {}))
    if (
      current.parameters.filter((parameter) => parameter.id === id).length !== 1
    )
      throw new Error(
        "Scenario overrides require unique existing parameter IDs.",
      );
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
        : "element" in input
          ? input.element.elementId
          : "elementId" in input
            ? input.elementId
            : input.typeId;
  const kind =
    request.toolName === "addParameter"
      ? "parameter"
      : request.toolName.includes("Scenario")
        ? "scenario"
        : request.toolName.includes("Element")
          ? "type-element"
          : "type";
  const parent =
    "typeId" in input
      ? definition.types.find((entry) => entry.id === input.typeId)
      : undefined;
  const entries =
    kind === "scenario"
      ? (definition.scenarios ?? [])
      : kind === "parameter"
        ? definition.parameters
        : kind === "type-element"
          ? (parent?.elements ?? [])
          : definition.types;
  const exists = entries.some(
    (entry) => ("elementId" in entry ? entry.elementId : entry.id) === id,
  );
  const target =
    request.toolName.startsWith("add") && !exists
      ? {
          nodePath:
            kind === "type-element"
              ? `/types/${definition.types.findIndex((entry) => entry === parent)}/elements/${entries.length}`
              : `/${kind === "type" ? "types" : kind === "parameter" ? "parameters" : "scenarios"}/${entries.length}`,
          value: undefined,
        }
      : locateRootState(definition, {
          kind,
          name: id,
          field: "entity",
          ...(kind === "type-element" && "typeId" in input
            ? { type: input.typeId }
            : {}),
        });
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
