import * as v from "valibot";

import {
  mutationActionInputSchemas,
  createPetrinautActions,
  parseSDCPNFile,
  type DocumentRevisionId,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import { sha256Pattern } from "./declared-basis";
import {
  browserBindingSchema,
  type BatchedArcMutationName,
  isBatchedArcMutation,
  type ObservedArcMutationName,
} from "./root-arc";
import {
  assertNodeIdentity,
  isBatchedNodeMutation,
  type BatchedNodeMutationName,
  type ObservedNodeMutationName,
} from "./root-node";
import {
  assertStateIdentity,
  isObservedStateMutation,
  locateRootState,
  stateMutationTarget,
  type ObservedStateMutationName,
} from "./root-state";

import type { PetrinautAiToolInput } from "@hashintel/petrinaut-core/ai";

/** The bound document incarnation a mutation was authorized against. */
export type BrowserBinding = v.InferOutput<typeof browserBindingSchema>;

/** Arc request contract; root node requests extend it. */
export type ArcMutationRequest = {
  toolCallId: string;
  toolName: ObservedArcMutationName;
  input: PetrinautAiToolInput<ObservedArcMutationName>;
  binding: BrowserBinding;
  requestedBaseHash: string;
  /** The verified browser read this request cites as its base. */
  observationToolCallId?: string;
};

export type ObservedConstructionMutationName =
  | ObservedArcMutationName
  | ObservedNodeMutationName
  | ObservedStateMutationName;
/** Edits and removals of net-level state that only the batched carrier admits; located by ID in the pre observation, never created. */
const batchedStateMutationNames = [
  "updateDifferentialEquation",
  "updateParameter",
  "removeType",
  "removeTypeElement",
  "removeParameter",
  "removeDifferentialEquation",
  "removeScenario",
  "removeMetric",
] as const;
type BatchedStateMutationName = (typeof batchedStateMutationNames)[number];

export type ConstructionMutationName =
  | ObservedConstructionMutationName
  | BatchedArcMutationName
  | BatchedNodeMutationName
  | BatchedStateMutationName;

const isBatchedStateMutation = (
  name: string,
): name is BatchedStateMutationName =>
  batchedStateMutationNames.some((entry) => entry === name);

export type ConstructionMutationRequest = Omit<
  ArcMutationRequest,
  "toolName" | "input"
> & {
  toolName: ConstructionMutationName;
  input: PetrinautAiToolInput<ConstructionMutationName>;
};

export type DefinitionObservation = {
  definition: SDCPN;
  sha256: string;
  /** Absent only on retained records created before document revisions existed. */
  revisionId?: DocumentRevisionId;
};

/** A delivered observation before `verifyDefinitionObservation` has re-parsed and re-hashed it. */
export type UnverifiedDefinitionObservation = {
  definition: unknown;
  sha256: string;
  revisionId?: unknown;
};

const mutationOutcomes = [
  "applied",
  "no-op",
  "failed",
  "stale",
  "unknown",
] as const;
const canonicalMutationOutcomes = [
  "applied",
  "no-op",
  "failed",
  "unknown",
] as const;

const definitionObservationSchema = v.object({
  definition: v.unknown(),
  sha256: v.pipe(v.string(), v.regex(sha256Pattern)),
  revisionId: v.optional(v.pipe(v.string(), v.minLength(1))),
});
const mutationEffectsSchema = v.object({
  created: v.array(v.unknown()),
  updated: v.array(v.unknown()),
  deleted: v.array(v.unknown()),
  derived: v.array(v.unknown()),
});
const canonicalMutationRecordSchema = v.pipe(
  v.object({
    toolCallId: v.pipe(v.string(), v.minLength(1)),
    toolName: v.pipe(v.string(), v.minLength(1)),
    binding: browserBindingSchema,
    input: v.unknown(),
    pre: definitionObservationSchema,
    post: v.optional(definitionObservationSchema),
    outcome: v.picklist(canonicalMutationOutcomes),
    effects: mutationEffectsSchema,
    settlement: v.variant("status", [
      v.object({ status: v.literal("not-required") }),
      v.object({
        status: v.literal("settled"),
        revisionId: v.pipe(v.string(), v.minLength(1)),
      }),
      v.object({
        status: v.literal("failed"),
        revisionId: v.pipe(v.string(), v.minLength(1)),
        error: v.optional(v.pipe(v.string(), v.minLength(1))),
      }),
    ]),
    diagnostics: v.variant("status", [
      v.object({ status: v.literal("not-required") }),
      v.object({ status: v.literal("pending") }),
      v.object({ status: v.literal("settled"), value: v.optional(v.string()) }),
      v.object({
        status: v.literal("failed"),
        error: v.optional(v.pipe(v.string(), v.minLength(1))),
      }),
    ]),
    output: v.unknown(),
    error: v.optional(v.pipe(v.string(), v.minLength(1))),
  }),
  v.check(
    (record) => Object.hasOwn(record, "output"),
    "A terminal canonical mutation record requires its canonical output.",
  ),
);

/**
 * Host-owned sidecar the browser attaches to a client-tool result. Parsing
 * establishes shape only: `observation.observed` still needs
 * `verifyDefinitionObservation`, and each `mutationRecord.attempts` member
 * still needs `verifyMutationAttempt` at the receiving boundary.
 */
export const clientToolResultMetadataSchema = v.object({
  observation: v.optional(
    v.object({
      toolCallId: v.pipe(v.string(), v.minLength(1)),
      binding: browserBindingSchema,
      observed: definitionObservationSchema,
    }),
  ),
  mutationRecord: v.optional(
    v.object({
      attempts: v.array(v.unknown()),
      outcome: v.picklist(mutationOutcomes),
    }),
  ),
  /** One canonical Petrinaut mutation, retained alongside the legacy batch carrier. */
  canonicalMutationRecord: v.optional(canonicalMutationRecordSchema),
  /**
   * A separately recorded `layout_petrinaut_net` command: layout is a document
   * mutation with its own observed pre/post hashes and position effects, not
   * part of a `mutate_petrinaut_net` result and never a hidden hash change.
   */
  layoutRecord: v.optional(
    v.object({
      toolCallId: v.pipe(v.string(), v.minLength(1)),
      binding: browserBindingSchema,
      pre: v.object({
        definition: v.unknown(),
        sha256: v.pipe(v.string(), v.regex(sha256Pattern)),
        revisionId: v.optional(v.pipe(v.string(), v.minLength(1))),
      }),
      post: v.object({
        definition: v.unknown(),
        sha256: v.pipe(v.string(), v.regex(sha256Pattern)),
        revisionId: v.optional(v.pipe(v.string(), v.minLength(1))),
      }),
      effects: v.array(v.unknown()),
    }),
  ),
});
export type ClientToolResultMetadata = v.InferOutput<
  typeof clientToolResultMetadataSchema
>;
export type CanonicalMutationRecord = v.InferOutput<
  typeof canonicalMutationRecordSchema
>;

/** Read the sidecar off a delivered result; anything else is not a Brunch sidecar. */
export const parseClientToolResultMetadata = (
  metadata: unknown,
): ClientToolResultMetadata | undefined => {
  const parsed = v.safeParse(clientToolResultMetadataSchema, metadata);
  return parsed.success ? parsed.output : undefined;
};

/** Snapshot-relative JSON pointer. Values retain the entire changed subtree. */
export type DefinitionChange = {
  path: string;
} & (
  | { kind: "created"; after: unknown }
  | { kind: "updated"; before: unknown; after: unknown }
  | { kind: "deleted"; before: unknown }
);

export type MutationEffects = {
  created: DefinitionChange[];
  updated: DefinitionChange[];
  deleted: DefinitionChange[];
  /** Unmapped changes, NOT inherited basis or evidence of intended consequences. */
  derived: DefinitionChange[];
};

export type ConstructionMutationAttempt = {
  request: ConstructionMutationRequest;
  binding: ArcMutationRequest["binding"];
  pre: DefinitionObservation;
  post?: DefinitionObservation;
  outcome: (typeof mutationOutcomes)[number];
  effects: MutationEffects;
  error?: string;
};

export type ArcMutationAttempt = Omit<
  ConstructionMutationAttempt,
  "request"
> & { request: ArcMutationRequest };
export type ConstructionMutationRecord = {
  attempts: ConstructionMutationAttempt[];
  outcome: ConstructionMutationAttempt["outcome"];
};
export type ArcMutationRecord = Omit<ConstructionMutationRecord, "attempts"> & {
  attempts: ArcMutationAttempt[];
};

const objectValue = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Equality ignores object insertion order, but never array order or canonical fields. */
export const canonicalContent = (value: unknown): string | undefined => {
  const normalize = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(normalize);
    if (objectValue(entry)) {
      return Object.fromEntries(
        Object.keys(entry)
          .sort()
          .map((key) => [key, normalize(entry[key])]),
      );
    }
    return entry;
  };
  return JSON.stringify(normalize(value));
};

const definitionChanges = (
  before: unknown,
  after: unknown,
  path = "",
): DefinitionChange[] => {
  if (canonicalContent(before) === canonicalContent(after)) return [];
  if (before === undefined) return [{ path, kind: "created", after }];
  if (after === undefined) return [{ path, kind: "deleted", before }];
  if (
    (objectValue(before) && objectValue(after)) ||
    (Array.isArray(before) && Array.isArray(after))
  ) {
    const previous = before as Record<string, unknown>;
    const next = after as Record<string, unknown>;
    return [...new Set([...Object.keys(previous), ...Object.keys(next)])]
      .sort()
      .flatMap((key) =>
        definitionChanges(
          previous[key],
          next[key],
          `${path}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`,
        ),
      );
  }
  return [{ path, kind: "updated", before, after }];
};

const layoutPositionPath =
  /^\/(?:places|transitions|componentInstances)\/\d+\/(?:x|y)$/u;

/**
 * Position effects of one ELK layout run between two observations. Layout may
 * move root places, transitions and component instances and nothing else; any
 * other difference is a hidden change the layout record refuses to absorb.
 */
export const deriveLayoutEffects = (
  pre: SDCPN,
  post: SDCPN,
): DefinitionChange[] => {
  const changes = definitionChanges(pre, post);
  const foreign = changes.filter(
    (change) =>
      change.kind !== "updated" || !layoutPositionPath.test(change.path),
  );
  if (foreign.length > 0)
    throw new Error(
      `Layout changed more than positions: ${foreign
        .map((change) => change.path)
        .join(", ")}`,
    );
  return changes;
};

/** Partition the named root operation; unrequested fields remain derived, never inherited basis. */
export const deriveMutationEffects = (
  request: ConstructionMutationRequest,
  pre: SDCPN,
  post: SDCPN,
): MutationEffects => {
  if (
    isBatchedNodeMutation(request.toolName) ||
    isObservedStateMutation(request.toolName) ||
    isBatchedStateMutation(request.toolName)
  )
    return deriveNodeEffects(request, pre, post);
  const input = mutationActionInputSchemas[request.toolName].parse(
    request.input,
  );
  if (input.targetSubnetId || typeof input.placeId !== "string") {
    throw new Error("Transition observation supports root place arcs only.");
  }
  const transitionIndex = pre.transitions.findIndex(
    (transition) => transition.id === input.transitionId,
  );
  const arcSource = request.toolName === "removeArc" ? pre : post;
  const transition = arcSource.transitions[transitionIndex];
  // Only input arcs carry a type, so updateArcType names no direction.
  const direction =
    !("arcDirection" in input) || input.arcDirection === "input"
      ? "inputArcs"
      : "outputArcs";
  const arcIndex =
    transition !== undefined && transition.id === input.transitionId
      ? transition[direction].findIndex(
          (arc) => "placeId" in arc && arc.placeId === input.placeId,
        )
      : -1;
  const arcPath = `/transitions/${transitionIndex}/${direction}/${arcIndex}`;
  const effects: MutationEffects = {
    created: [],
    updated: [],
    deleted: [],
    derived: [],
  };
  // JSON normalization removes optional undefined object properties before diffing.
  for (const change of definitionChanges(
    JSON.parse(JSON.stringify(pre)),
    JSON.parse(JSON.stringify(post)),
  )) {
    const direct =
      transitionIndex >= 0 &&
      arcIndex >= 0 &&
      (change.path === arcPath || change.path.startsWith(`${arcPath}/`));
    effects[direct ? change.kind : "derived"].push(change);
  }
  return effects;
};

/** Canonical action on a detached definition, not a reported effect or a second document store.
 * The bound construction host enables all extensions and disables post-mutation global stripping.
 * Comparing this prediction with independent actual pre/post observations earns only that exact footprint.
 */
export const expectedNodeDefinition = (
  request: ConstructionMutationRequest,
  pre: SDCPN,
): SDCPN => {
  assertNodeIdentity(request, pre, []);
  assertStateIdentity(request, pre, []);
  const expected = structuredClone(pre);
  const actions = createPetrinautActions(
    (mutate) => mutate(expected),
    undefined,
    { sanitizeAfterMutation: false },
  );
  switch (request.toolName) {
    case "addParameter":
      actions.addParameter(
        mutationActionInputSchemas.addParameter.parse(request.input),
      );
      break;
    case "addDifferentialEquation":
      actions.addDifferentialEquation(
        mutationActionInputSchemas.addDifferentialEquation.parse(request.input),
      );
      break;
    case "updateDifferentialEquation":
      actions.updateDifferentialEquation(
        mutationActionInputSchemas.updateDifferentialEquation.parse(
          request.input,
        ),
      );
      break;
    case "updateParameter":
      actions.updateParameter(
        mutationActionInputSchemas.updateParameter.parse(request.input),
      );
      break;
    case "removeParameter":
      actions.removeParameter(
        mutationActionInputSchemas.removeParameter.parse(request.input),
      );
      break;
    case "removeDifferentialEquation":
      actions.removeDifferentialEquation(
        mutationActionInputSchemas.removeDifferentialEquation.parse(
          request.input,
        ),
      );
      break;
    case "removeType":
      actions.removeType(
        mutationActionInputSchemas.removeType.parse(request.input),
      );
      break;
    case "removeTypeElement":
      actions.removeTypeElement(
        mutationActionInputSchemas.removeTypeElement.parse(request.input),
      );
      break;
    case "addPlace":
      actions.addPlace(
        mutationActionInputSchemas.addPlace.parse(request.input),
      );
      break;
    case "updatePlace":
      actions.updatePlace(
        mutationActionInputSchemas.updatePlace.parse(request.input),
      );
      break;
    case "addTransition":
      actions.addTransition(
        mutationActionInputSchemas.addTransition.parse(request.input),
      );
      break;
    case "updateTransition":
      actions.updateTransition(
        mutationActionInputSchemas.updateTransition.parse(request.input),
      );
      break;
    case "addArc":
      actions.addArc(mutationActionInputSchemas.addArc.parse(request.input));
      break;
    case "updateArcWeight":
      actions.updateArcWeight(
        mutationActionInputSchemas.updateArcWeight.parse(request.input),
      );
      break;
    case "updateArcType":
      actions.updateArcType(
        mutationActionInputSchemas.updateArcType.parse(request.input),
      );
      break;
    case "addType":
      actions.addType(mutationActionInputSchemas.addType.parse(request.input));
      break;
    case "updateType":
      actions.updateType(
        mutationActionInputSchemas.updateType.parse(request.input),
      );
      break;
    case "addTypeElement":
      actions.addTypeElement(
        mutationActionInputSchemas.addTypeElement.parse(request.input),
      );
      break;
    case "updateTypeElement":
      actions.updateTypeElement(
        mutationActionInputSchemas.updateTypeElement.parse(request.input),
      );
      break;
    case "addScenario":
      actions.addScenario(
        mutationActionInputSchemas.addScenario.parse(request.input),
      );
      break;
    case "updateScenario":
      actions.updateScenario(
        mutationActionInputSchemas.updateScenario.parse(request.input),
      );
      break;
    case "removeScenario":
      actions.removeScenario(
        mutationActionInputSchemas.removeScenario.parse(request.input),
      );
      break;
    case "addMetric":
      actions.addMetric(
        mutationActionInputSchemas.addMetric.parse(request.input),
      );
      break;
    case "updateMetric":
      actions.updateMetric(
        mutationActionInputSchemas.updateMetric.parse(request.input),
      );
      break;
    case "removeMetric":
      actions.removeMetric(
        mutationActionInputSchemas.removeMetric.parse(request.input),
      );
      break;
    case "removePlace":
      actions.removePlace(
        mutationActionInputSchemas.removePlace.parse(request.input),
      );
      break;
    case "removeTransition":
      actions.removeTransition(
        mutationActionInputSchemas.removeTransition.parse(request.input),
      );
      break;
    case "removeArc":
      actions.removeArc(
        mutationActionInputSchemas.removeArc.parse(request.input),
      );
      break;
    default:
      throw new Error("Not an admitted root entity operation.");
  }
  if (
    canonicalContent(expected.subnets) !== canonicalContent(pre.subnets) ||
    canonicalContent(expected.componentInstances) !==
      canonicalContent(pre.componentInstances)
  )
    throw new Error("Nested construction effects are unavailable.");
  return expected;
};

/** Which existing root-state entity a batched state operation names, and what it asks of it. */
const batchedStateLocator = (
  request: ConstructionMutationRequest,
): {
  name: string;
  removing: boolean;
  fields: Record<string, unknown>;
} & (
  | {
      kind:
        | "parameter"
        | "differential-equation"
        | "type"
        | "scenario"
        | "metric";
      typeId?: never;
    }
  | { kind: "type-element"; typeId: string }
) => {
  switch (request.toolName) {
    case "updateParameter": {
      const parsed = mutationActionInputSchemas.updateParameter.parse(
        request.input,
      );
      return {
        kind: "parameter",
        name: parsed.parameterId,
        removing: false,
        fields: parsed.update,
      };
    }
    case "updateDifferentialEquation": {
      const parsed =
        mutationActionInputSchemas.updateDifferentialEquation.parse(
          request.input,
        );
      return {
        kind: "differential-equation",
        name: parsed.equationId,
        removing: false,
        fields: parsed.update,
      };
    }
    case "removeParameter": {
      const parsed = mutationActionInputSchemas.removeParameter.parse(
        request.input,
      );
      return {
        kind: "parameter",
        name: parsed.parameterId,
        removing: true,
        fields: {},
      };
    }
    case "removeDifferentialEquation": {
      const parsed =
        mutationActionInputSchemas.removeDifferentialEquation.parse(
          request.input,
        );
      return {
        kind: "differential-equation",
        name: parsed.equationId,
        removing: true,
        fields: {},
      };
    }
    case "removeType": {
      const parsed = mutationActionInputSchemas.removeType.parse(request.input);
      return { kind: "type", name: parsed.typeId, removing: true, fields: {} };
    }
    case "removeTypeElement": {
      const parsed = mutationActionInputSchemas.removeTypeElement.parse(
        request.input,
      );
      return {
        kind: "type-element",
        name: parsed.elementId,
        typeId: parsed.typeId,
        removing: true,
        fields: {},
      };
    }
    case "removeScenario": {
      const parsed = mutationActionInputSchemas.removeScenario.parse(
        request.input,
      );
      return {
        kind: "scenario",
        name: parsed.scenarioId,
        removing: true,
        fields: {},
      };
    }
    case "removeMetric": {
      const parsed = mutationActionInputSchemas.removeMetric.parse(
        request.input,
      );
      return {
        kind: "metric",
        name: parsed.metricId,
        removing: true,
        fields: {},
      };
    }
    default:
      throw new Error("Not a batched state operation.");
  }
};

/** A creation is partitioned by canonical field so generated fields cannot inherit its basis. */
const deriveNodeEffects = (
  request: ConstructionMutationRequest,
  pre: SDCPN,
  post: SDCPN,
): MutationEffects => {
  /** The batched state operations name an existing entity; resolve it by kind and ID in `definition`. */
  const batchedStateTarget = (definition: SDCPN) => {
    const located = batchedStateLocator(request);
    return {
      target: locateRootState(definition, {
        name: located.name,
        field: "entity",
        ...(located.kind === "type-element"
          ? { kind: located.kind, type: located.typeId }
          : { kind: located.kind }),
      }),
      creating: false,
      fields: located.fields,
    };
  };
  const state = isBatchedStateMutation(request.toolName)
    ? batchedStateTarget(pre)
    : isObservedStateMutation(request.toolName)
      ? stateMutationTarget(
          request,
          request.toolName.startsWith("add") ? post : pre,
        )
      : undefined;
  if (!state && !isBatchedNodeMutation(request.toolName))
    throw new Error("Not an entity mutation.");
  const input = isBatchedNodeMutation(request.toolName)
    ? mutationActionInputSchemas[request.toolName].parse(request.input)
    : undefined;
  if (input?.targetSubnetId) throw new Error("Only root nodes are observed.");
  const collection = request.toolName.endsWith("Place")
    ? "places"
    : "transitions";
  const id =
    input === undefined
      ? undefined
      : "id" in input
        ? input.id
        : "placeId" in input
          ? input.placeId
          : input.transitionId;
  const creating = state?.creating ?? (input !== undefined && "id" in input);
  const index = (creating ? post : pre)[collection].findIndex(
    (entry) => entry.id === id,
  );
  const path = state?.target.nodePath ?? `/${collection}/${index}`;
  const expected = (state?.fields ??
    (input !== undefined && "update" in input
      ? input.update
      : Object.fromEntries(
          Object.entries(input ?? {}).filter(
            ([key]) => key !== "targetSubnetId",
          ),
        ))) as Record<string, unknown>;
  const effects: MutationEffects = {
    created: [],
    updated: [],
    deleted: [],
    derived: [],
  };
  const removedOptionalCollection =
    request.toolName === "removeScenario"
      ? "scenarios"
      : request.toolName === "removeMetric"
        ? "metrics"
        : undefined;
  if (removedOptionalCollection && state) {
    const targetId = batchedStateLocator(request).name;
    const targetStillExists = (post[removedOptionalCollection] ?? []).some(
      (entry) => entry.id === targetId,
    );
    if (!targetStillExists) {
      const expectedPost = JSON.parse(
        JSON.stringify(pre),
      ) as DefinitionObservation["definition"];
      const collection = expectedPost[removedOptionalCollection];
      const targetIndex =
        collection?.findIndex((entry) => entry.id === targetId) ?? -1;
      const removed = collection?.[targetIndex];
      if (collection && targetIndex >= 0 && removed) {
        collection.splice(targetIndex, 1);
        return {
          created: [],
          updated: [],
          deleted: [
            {
              kind: "deleted",
              path: `/${removedOptionalCollection}/${targetIndex}`,
              before: removed,
            },
          ],
          derived: definitionChanges(
            expectedPost,
            JSON.parse(JSON.stringify(post)),
          ),
        };
      }
    }
  }
  const changes = definitionChanges(
    JSON.parse(JSON.stringify(pre)),
    JSON.parse(JSON.stringify(post)),
  );
  // Scenarios and metrics are optional collections: the first addition creates
  // the whole array, which is one entity creation, not a collection creation.
  const createdOptionalCollections = state
    ? (["scenarios", "metrics"] as const).filter(
        (collectionName) => pre[collectionName] === undefined,
      )
    : [];
  const entityChanges =
    createdOptionalCollections.length > 0
      ? changes.flatMap((change): DefinitionChange[] =>
          createdOptionalCollections.some(
            (collectionName) => change.path === `/${collectionName}`,
          ) &&
          change.kind === "created" &&
          Array.isArray(change.after) &&
          change.after.length > 0
            ? change.after.map((after: unknown, index) => ({
                kind: "created",
                path: `${change.path}/${index}`,
                after,
              }))
            : [change],
        )
      : changes;
  for (const change of entityChanges) {
    // Keep the complete creation, but partition its fields rather than overlap a parent with derived children.
    const partition =
      creating &&
      change.path === path &&
      change.kind === "created" &&
      objectValue(change.after)
        ? Object.entries(change.after).map(
            ([field, after]): DefinitionChange => ({
              kind: "created",
              path: `${path}/${field
                .replaceAll("~", "~0")
                .replaceAll("/", "~1")}`,
              after,
            }),
          )
        : [change];
    for (const effect of partition) {
      const field = effect.path
        .slice(path.length + 1)
        .split("/")[0]
        ?.replaceAll("~1", "/")
        .replaceAll("~0", "~");
      const expectedField =
        field === undefined
          ? undefined
          : (expected as Record<string, unknown>)[field];
      // A removed entity has no post-side node; its fields cannot be direct.
      const removing =
        state === undefined
          ? !creating && input !== undefined && !("update" in input)
          : isBatchedStateMutation(request.toolName) &&
            batchedStateLocator(request).removing;
      const actualNode = state
        ? isBatchedStateMutation(request.toolName)
          ? removing
            ? undefined
            : batchedStateTarget(post).target.value
          : stateMutationTarget(request, post).target.value
        : post[collection][index];
      const actualField =
        field === undefined || !actualNode
          ? undefined
          : (actualNode as unknown as Record<string, unknown>)[field];
      const removedEntity =
        removing && effect.kind === "deleted" && effect.path === path;
      const requestedField =
        (state !== undefined || index >= 0) &&
        effect.path.startsWith(`${path}/`) &&
        field !== undefined &&
        Object.hasOwn(expected, field) &&
        canonicalContent(expectedField) === canonicalContent(actualField);
      if (removedEntity || requestedField) effects[effect.kind].push(effect);
      else effects.derived.push(effect);
    }
  }
  return effects;
};

export const assertMutationEffects = (
  attempt: ConstructionMutationAttempt,
): void => {
  const expected = attempt.post
    ? deriveMutationEffects(
        attempt.request,
        attempt.pre.definition,
        attempt.post.definition,
      )
    : { created: [], updated: [], deleted: [], derived: [] };
  if (canonicalContent(expected) !== canonicalContent(attempt.effects)) {
    throw new Error(
      "Transition effects do not account for the complete canonical diff.",
    );
  }
};

/** An outcome classification plus, for `unknown`, the reason when one was thrown. */
export interface ClassifiedMutationOutcome {
  readonly outcome: ConstructionMutationAttempt["outcome"];
  /** Present only when classification itself failed; the outcome is then `unknown`. */
  readonly reason?: string;
}

/** Observed effect, not canonical void success: only the verified bounded footprint earns applied. */
export const observedMutationOutcome = (
  attempt: Omit<ConstructionMutationAttempt, "outcome">,
): ConstructionMutationAttempt["outcome"] =>
  classifyMutationOutcome(attempt).outcome;

/**
 * `observedMutationOutcome` with the reason an outcome became `unknown` because the
 * expected definition could not be derived. Recorders store that reason on the
 * attempt so an unknown outcome is explicable, not merely declared.
 */
export const classifyMutationOutcome = (
  attempt: Omit<ConstructionMutationAttempt, "outcome">,
): ClassifiedMutationOutcome => {
  if (!attempt.post) return { outcome: "unknown" };
  const unchanged =
    canonicalContent(attempt.pre.definition) ===
    canonicalContent(attempt.post.definition);
  if (attempt.error !== undefined)
    return { outcome: unchanged ? "failed" : "unknown" };
  if (
    canonicalContent(attempt.request.binding) !==
    canonicalContent(attempt.binding)
  )
    return { outcome: "unknown" };
  if (attempt.request.requestedBaseHash !== attempt.pre.sha256)
    return { outcome: unchanged ? "stale" : "unknown" };
  if (unchanged) {
    // Unchanged observations are a no-op only when the canonical action can
    // derive that result; an invalid target must not be laundered as success.
    try {
      return {
        outcome:
          canonicalContent(
            expectedNodeDefinition(attempt.request, attempt.pre.definition),
          ) === canonicalContent(attempt.post.definition)
            ? "no-op"
            : "unknown",
      };
    } catch (error) {
      return {
        outcome: "unknown",
        reason: `expected definition unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }
  if (
    attempt.request.toolName === "updateArcWeight" ||
    attempt.request.toolName === "updateArcType"
  )
    return { outcome: observedArcUpdateEffectOutcome(attempt) };
  if (
    isBatchedNodeMutation(attempt.request.toolName) ||
    attempt.request.toolName === "addArc" ||
    attempt.request.toolName === "removeArc" ||
    isObservedStateMutation(attempt.request.toolName) ||
    isBatchedStateMutation(attempt.request.toolName)
  ) {
    try {
      return {
        outcome:
          canonicalContent(
            expectedNodeDefinition(attempt.request, attempt.pre.definition),
          ) === canonicalContent(attempt.post.definition)
            ? "applied"
            : "unknown",
      };
    } catch (error) {
      return {
        outcome: "unknown",
        reason: `expected definition unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }
  attempt.request.toolName satisfies never;
  return { outcome: "unknown" };
};

const observedArcUpdateEffectOutcome = (
  attempt: Omit<ConstructionMutationAttempt, "outcome">,
): ConstructionMutationAttempt["outcome"] => {
  const effects = attempt.effects;
  // An arc field update earns applied only as exactly one direct change to that field.
  const singleFieldUpdate = (field: "weight" | "type", after: unknown) => {
    const change = effects.updated[0];
    return effects.derived.length === 0 &&
      effects.created.length === 0 &&
      effects.deleted.length === 0 &&
      effects.updated.length === 1 &&
      change?.kind === "updated" &&
      change.path.endsWith(`/${field}`) &&
      change.after === after
      ? "applied"
      : "unknown";
  };
  if (attempt.request.toolName === "updateArcWeight") {
    const input = mutationActionInputSchemas.updateArcWeight.parse(
      attempt.request.input,
    );
    return singleFieldUpdate("weight", input.weight);
  }
  const input = mutationActionInputSchemas.updateArcType.parse(
    attempt.request.input,
  );
  return singleFieldUpdate("type", input.type);
};

export const verifyDefinitionObservation = async (
  observation: DefinitionObservation | UnverifiedDefinitionObservation,
): Promise<DefinitionObservation> => {
  const detached: UnverifiedDefinitionObservation =
    structuredClone(observation);
  if (!objectValue(detached.definition))
    throw new Error("Invalid canonical observation: not a definition object.");
  const parsed = parseSDCPNFile({
    ...detached.definition,
    title: "Browser observation",
  });
  if (!parsed.ok)
    throw new Error(`Invalid canonical observation: ${parsed.error}`);
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(detached.definition)),
  );
  const actual = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  if (actual !== detached.sha256)
    throw new Error(
      "Transition observation hash does not match its definition.",
    );
  // The canonical parse above is what earns the SDCPN claim on the raw definition.
  if (
    detached.revisionId !== undefined &&
    (typeof detached.revisionId !== "string" ||
      detached.revisionId.trim().length === 0)
  )
    throw new Error("Transition observation has an invalid revision ID.");
  return {
    definition: detached.definition as SDCPN,
    sha256: detached.sha256,
    ...(detached.revisionId === undefined
      ? {}
      : { revisionId: detached.revisionId }),
  };
};

/** Reconciliation only: never an alias or relaxation of mutation/base checks. */
export const reconcileDefinitionObservations = async (
  recorded: DefinitionObservation,
  observed: DefinitionObservation,
) => {
  if (
    !objectValue(recorded) ||
    !objectValue(observed) ||
    !objectValue(recorded.definition) ||
    !objectValue(observed.definition)
  )
    throw new Error("Reconciliation requires both full observations.");
  const [verifiedRecord, verifiedObservation] = await Promise.all([
    verifyDefinitionObservation(recorded),
    verifyDefinitionObservation(observed),
  ]);
  return {
    status:
      canonicalContent(verifiedRecord.definition) !==
      canonicalContent(verifiedObservation.definition)
        ? ("different" as const)
        : verifiedRecord.sha256 === verifiedObservation.sha256
          ? ("hash-equal" as const)
          : ("serialization-equivalent" as const),
    recordedSha256: verifiedRecord.sha256,
    observedSha256: verifiedObservation.sha256,
  };
};

/** Recompute observation hashes at a receiving boundary, not from the request's base. */
export const verifyMutationAttempt = async <
  Attempt extends ConstructionMutationAttempt,
>(
  delivery: Attempt,
): Promise<Attempt> => {
  // Validate a detached delivery: callers cannot change the content while hashes settle.
  const attempt = structuredClone(delivery);
  if (
    (!isBatchedArcMutation(attempt.request.toolName) &&
      !isBatchedNodeMutation(attempt.request.toolName) &&
      !isObservedStateMutation(attempt.request.toolName) &&
      !isBatchedStateMutation(attempt.request.toolName)) ||
    !sha256Pattern.test(attempt.request.requestedBaseHash) ||
    [
      attempt.request.toolCallId,
      ...Object.values(attempt.request.binding),
      ...Object.values(attempt.binding),
    ].some((value) => typeof value !== "string" || value.trim().length === 0)
  ) {
    throw new Error("Malformed arc transition identity.");
  }
  deriveMutationEffects(
    attempt.request,
    attempt.pre.definition,
    attempt.pre.definition,
  );
  await Promise.all(
    [attempt.pre, attempt.post].map(async (observation) => {
      if (!observation) return;
      await verifyDefinitionObservation(observation);
    }),
  );
  assertMutationEffects(attempt);
  if (
    attempt.outcome !== "unknown" &&
    attempt.outcome !== observedMutationOutcome(attempt)
  ) {
    throw new Error(
      "The transition outcome is not supported by its observations.",
    );
  }
  return attempt;
};

export type VerifiedCanonicalMutationRecord = Omit<
  CanonicalMutationRecord,
  "toolName" | "input" | "pre" | "post" | "effects"
> & {
  toolName: ConstructionMutationName;
  input: ConstructionMutationRequest["input"];
  pre: DefinitionObservation;
  post?: DefinitionObservation;
  effects: MutationEffects;
};

export const isConstructionMutationName = (
  name: string,
): name is ConstructionMutationName =>
  isBatchedArcMutation(name) ||
  isBatchedNodeMutation(name) ||
  isObservedStateMutation(name) ||
  isBatchedStateMutation(name);

/**
 * Verify a canonical one-call sidecar against the issued call and delivered
 * canonical output. The returned outcome is always the browser's conservative
 * outcome; verified observations are never used to promote it to `applied`.
 */
export const verifyCanonicalMutationRecord = async (input: {
  record: unknown;
  toolCallId: string;
  toolName: string;
  canonicalInput: unknown;
  canonicalOutput: unknown;
  binding: BrowserBinding;
}): Promise<VerifiedCanonicalMutationRecord> => {
  const parsed = v.parse(canonicalMutationRecordSchema, input.record);
  if (
    !isConstructionMutationName(parsed.toolName) ||
    parsed.toolCallId !== input.toolCallId ||
    parsed.toolName !== input.toolName ||
    canonicalContent(parsed.binding) !== canonicalContent(input.binding)
  )
    throw new Error(
      "The canonical mutation record does not match the issued call or document incarnation.",
    );

  const toolName = parsed.toolName;
  const recordedInput = mutationActionInputSchemas[toolName].parse(
    parsed.input,
  ) as ConstructionMutationRequest["input"];
  const issuedInput = mutationActionInputSchemas[toolName].parse(
    input.canonicalInput,
  ) as ConstructionMutationRequest["input"];
  if (canonicalContent(recordedInput) !== canonicalContent(issuedInput))
    throw new Error(
      "The canonical mutation record input does not match the issued call.",
    );
  if (
    canonicalContent(parsed.output) !== canonicalContent(input.canonicalOutput)
  )
    throw new Error(
      "The canonical mutation record output does not match the delivered canonical output.",
    );

  const request: ConstructionMutationRequest = {
    toolCallId: parsed.toolCallId,
    toolName,
    input: recordedInput,
    binding: parsed.binding,
    requestedBaseHash: parsed.pre.sha256,
  };
  const attempt: ConstructionMutationAttempt = {
    request,
    binding: parsed.binding,
    pre: parsed.pre as DefinitionObservation,
    ...(parsed.post === undefined
      ? {}
      : { post: parsed.post as DefinitionObservation }),
    outcome: parsed.outcome,
    effects: parsed.effects as MutationEffects,
    ...(parsed.error === undefined ? {} : { error: parsed.error }),
  };
  const canonicalOutput = objectValue(parsed.output)
    ? parsed.output
    : undefined;
  if (parsed.outcome === "no-op") {
    await Promise.all(
      [attempt.pre, attempt.post].map(async (observation) => {
        if (observation) await verifyDefinitionObservation(observation);
      }),
    );
    assertMutationEffects(attempt);
    if (
      attempt.post === undefined ||
      canonicalContent(attempt.pre.definition) !==
        canonicalContent(attempt.post.definition) ||
      attempt.pre.sha256 !== attempt.post.sha256 ||
      attempt.pre.revisionId !== attempt.post.revisionId ||
      canonicalOutput?.applied !== false ||
      parsed.error !== undefined ||
      parsed.settlement.status !== "not-required"
    )
      throw new Error(
        "The canonical no-op outcome is not supported by the same raw observation and terminal output.",
      );
  } else {
    await verifyMutationAttempt(attempt);
  }
  if (parsed.outcome === "applied" && canonicalOutput?.applied === false)
    throw new Error(
      "The canonical mutation output contradicts an applied outcome.",
    );

  if (
    parsed.settlement.status !== "not-required" &&
    parsed.post?.revisionId !== undefined &&
    parsed.settlement.revisionId !== parsed.post.revisionId
  )
    throw new Error(
      "The canonical mutation settlement does not match its post revision.",
    );
  if (parsed.outcome === "applied" && parsed.settlement.status !== "settled")
    throw new Error(
      "An applied canonical mutation requires a settled document revision.",
    );

  return {
    toolCallId: parsed.toolCallId,
    toolName,
    binding: parsed.binding,
    input: recordedInput,
    pre: attempt.pre,
    ...(attempt.post === undefined ? {} : { post: attempt.post }),
    outcome: parsed.outcome,
    effects: attempt.effects,
    settlement: parsed.settlement,
    diagnostics: parsed.diagnostics,
    output: parsed.output,
    ...(parsed.error === undefined ? {} : { error: parsed.error }),
  };
};

/** Inputs must first pass verifyMutationAttempt at an external receiving boundary. */
export const reconcileMutationAttempts = <
  Attempt extends ConstructionMutationAttempt,
>(
  attempts: Attempt[],
): {
  attempts: Attempt[];
  outcome: ConstructionMutationAttempt["outcome"];
} => {
  const first = attempts[0];
  if (!first) throw new Error("A mutation record requires an attempt.");
  if (
    attempts.some(
      (attempt) => attempt.request.toolCallId !== first.request.toolCallId,
    )
  ) {
    throw new Error("Cannot reconcile different tool calls.");
  }
  return {
    attempts: structuredClone(attempts),
    outcome: attempts.some(
      (attempt) => canonicalContent(attempt) !== canonicalContent(first),
    )
      ? "unknown"
      : first.outcome,
  };
};
