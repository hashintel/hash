import { typedKeys } from "@local/advanced-types/typed-entries";

import type { ActorTypeDataType } from "../system-types/google/googlesheetsfile.js";
import type {
  AiFlowActionDefinitionId,
  IntegrationFlowActionDefinitionId,
} from "./action-definitions.js";
import type { Aggregation } from "./aggregation.js";
import type { FilterCondition } from "./filter-condition.js";
import type { SortKey } from "./sort-key.js";
import type {
  ActorEntityUuid,
  EntityId,
  EntityUuid,
  PropertyObject,
  PropertyObjectMetadata,
  PropertyObjectWithMetadata,
  PropertyPatchOperation,
  ProvidedEntityEditionProvenance,
  Url,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { DistributiveOmit } from "@local/advanced-types/distribute";
import type { QueryEntitiesRequest } from "@local/hash-graph-sdk/entity";

export const flowRunsQueryMaxLimit = 100;

export type FlowActionDefinitionId =
  | AiFlowActionDefinitionId
  | IntegrationFlowActionDefinitionId;

export type DeepReadOnly<T> = T extends (...args: never[]) => unknown
  ? T
  : { readonly [key in keyof T]: DeepReadOnly<T[key]> };

export type WebPage = {
  url: Url;
  title: string;
  htmlContent: string;
  innerText: string;
};

export type LocalOrExistingEntityId =
  | { kind: "proposed-entity"; localId: EntityId }
  | { kind: "existing-entity"; entityId: EntityId };

/**
 * @todo H-3163: remove the ProposedEntity type inside infer-entities, by making the browser plugin flow
 *    use the same claim -> entity process as other flows
 */
export type ProposedEntity = {
  claims: {
    isSubjectOf: EntityId[];
    isObjectOf: EntityId[];
  };
  provenance: ProvidedEntityEditionProvenance;
  propertyMetadata: PropertyObjectMetadata;
  localEntityId: EntityId;
  entityTypeIds: [VersionedUrl, ...VersionedUrl[]];
  summary?: string;
  properties: PropertyObject;
  sourceEntityId?: LocalOrExistingEntityId;
  targetEntityId?: LocalOrExistingEntityId;
};

export type ProposedEntityWithResolvedLinks = Omit<
  ProposedEntity,
  "sourceEntityLocalId" | "targetEntityLocalId"
> & {
  linkData?: {
    leftEntityId: EntityId;
    rightEntityId: EntityId;
  };
};

export type PersistedEntityMetadata = {
  entityId: EntityId;
  operation: "create" | "update" | "already-exists-as-proposed";
};

export type FailedEntityProposal = {
  existingEntityId?: EntityId;
  operation?: "create" | "update" | "already-exists-as-proposed";
  proposedEntity: ProposedEntityWithResolvedLinks;
  message: string;
};

export const textFormats = ["CSV", "HTML", "Markdown", "Plain"] as const;

export type TextFormat = (typeof textFormats)[number];

export type FormattedText = {
  content: string;
  format: TextFormat;
};

export type GoogleSheet = { spreadsheetId: string } | { newSheetName: string };

export type WebSearchResult = Pick<WebPage, "title" | "url">;

/** A length of time. Every unit has a fixed length: a day is 24 hours and a week is 7 days. */
export type Duration = {
  amount: number;
  unit: "seconds" | "minutes" | "hours" | "days" | "weeks";
};

/**
 * A query for entities in the graph's own terms. Only the filter is required: how the fields left out default is up
 * to the action that runs the query.
 */
export type EntityQuery = Pick<QueryEntitiesRequest, "filter"> &
  Partial<
    Pick<
      QueryEntitiesRequest,
      "includeDrafts" | "limit" | "sortingPaths" | "temporalAxes"
    >
  >;

export type PayloadKindValues = {
  ActorType: ActorTypeDataType;
  Aggregation: Aggregation;
  Boolean: boolean;
  Date: string; // e.g. "2025-01-01"
  /** An ISO 8601 instant with `Z` or an offset, e.g. "2026-10-16T14:00:00Z" */
  DateTime: string;
  Duration: Duration;
  EntityId: EntityId;
  EntityQuery: EntityQuery;
  FailedEntityProposal: FailedEntityProposal;
  FilterCondition: FilterCondition;
  FormattedText: FormattedText;
  GoogleAccountId: string;
  GoogleSheet: GoogleSheet;
  Number: number;
  PersistedEntityMetadata: PersistedEntityMetadata;
  /** An entity's properties with their metadata, as the graph takes them to create an entity */
  PropertyObjectWithMetadata: PropertyObjectWithMetadata;
  /** A change to one of an entity's properties, as the graph takes it to update an entity */
  PropertyPatch: PropertyPatchOperation;
  ProposedEntity: ProposedEntity;
  ProposedEntityWithResolvedLinks: ProposedEntityWithResolvedLinks;
  SortKey: SortKey;
  Text: string;
  VersionedUrl: VersionedUrl;
  WebPage: WebPage;
  WebSearchResult: WebSearchResult;
};

export type PayloadKind = keyof PayloadKindValues;

/** What a payload kind's value is underneath, which decides how conditions compare it and Order by sorts it. */
export type PayloadPrimitive =
  | "text"
  | "number"
  | "date"
  | "datetime"
  | "boolean";

/** What can be done with a value of a payload kind. */
export type PayloadKindTraits =
  | {
      /** What the value is underneath. */
      primitive: PayloadPrimitive;
      fields?: never;
      /** It names an entity, whose properties and types a condition can read. */
      entity?: true;
    }
  | {
      /** A JSON object, which can't be compared or sorted by itself. */
      primitive: null;
      /** A condition can read its fields. */
      fields?: true;
      /** It is or proposes an entity, whose properties and types a condition can read. */
      entity?: true;
    };

export const payloadKindTraits = {
  ActorType: { primitive: "text" },
  Aggregation: { primitive: null },
  Boolean: { primitive: "boolean" },
  Date: { primitive: "date" },
  DateTime: { primitive: "datetime" },
  Duration: { primitive: null },
  EntityId: { primitive: "text", entity: true },
  EntityQuery: { primitive: null },
  FailedEntityProposal: { primitive: null },
  FilterCondition: { primitive: null },
  FormattedText: { primitive: null, fields: true },
  GoogleAccountId: { primitive: "text" },
  GoogleSheet: { primitive: null, fields: true },
  Number: { primitive: "number" },
  PersistedEntityMetadata: { primitive: null, fields: true },
  PropertyObjectWithMetadata: { primitive: null },
  PropertyPatch: { primitive: null },
  ProposedEntity: { primitive: null, fields: true, entity: true },
  ProposedEntityWithResolvedLinks: {
    primitive: null,
    fields: true,
    entity: true,
  },
  SortKey: { primitive: null },
  Text: { primitive: "text" },
  VersionedUrl: { primitive: "text" },
  WebPage: { primitive: null, fields: true },
  WebSearchResult: { primitive: null, fields: true },
} as const satisfies Record<PayloadKind, PayloadKindTraits>;

/** The primitive type of a payload kind, or `null` for a kind that can't be compared or sorted by itself. */
export type PrimitiveOf<Kind extends PayloadKind> =
  (typeof payloadKindTraits)[Kind]["primitive"];

/** The payload kinds that have a trait. */
export type KindWithTrait<Trait extends "fields" | "entity"> = {
  [Kind in PayloadKind]: (typeof payloadKindTraits)[Kind] extends Record<
    Trait,
    true
  >
    ? Kind
    : never;
}[PayloadKind];

/**
 * Every payload kind, for an action input that accepts any of them (e.g. the items of a `filter` action).
 *
 * Payload kinds are a known union: a new kind is added to `PayloadKindValues`, and so joins this list.
 */
export const allPayloadKinds: readonly PayloadKind[] =
  typedKeys(payloadKindTraits);

/**
 * Payload kinds whose values are always stored in S3, whether singular or an array, due to their potential size.
 */
export const storedPayloadKinds = [
  "FailedEntityProposal",
  "ProposedEntity",
  "ProposedEntityWithResolvedLinks",
] as const;

export type StoredPayloadKind = (typeof storedPayloadKinds)[number];

/**
 * Payload kinds whose singular values are small enough to pass inline, but whose arrays are stored in S3,
 * because they can grow without bound.
 */
export const storedArrayPayloadKinds = [
  "EntityId",
  "PersistedEntityMetadata",
] as const;

export type StoredArrayPayloadKind = (typeof storedArrayPayloadKinds)[number];

/**
 * Payload kinds that can appear in a stored payload reference.
 */
export type StorablePayloadKind = StoredPayloadKind | StoredArrayPayloadKind;

/**
 * A payload written to S3 as one object.
 */
export type StoredObjectRef<
  Kind extends StorablePayloadKind = StorablePayloadKind,
  IsArray extends boolean = boolean,
> = {
  /** Discriminator to identify this as a stored reference */
  __stored: true;
  /** The payload kind being stored - for type checking */
  kind: Kind;
  /** S3 storage key */
  storageKey: string;
  /** Whether the stored value is an array */
  array: IsArray;
} & (IsArray extends true
  ? {
      /** The number of items in the stored array, so that it can be iterated over without fetching it. */
      length: number;
    }
  : unknown);

/**
 * One item of a stored array, e.g. the item a branch of a for-each step runs for.
 *
 * It points at the stored object that holds the item, never at a concatenation, so that it stays small and
 * resolving it downloads one object.
 */
export type StoredItemRef<
  Kind extends StorablePayloadKind = StorablePayloadKind,
> = {
  __stored: true;
  kind: Kind;
  array: false;
  of: StoredObjectRef<Kind, true>;
  index: number;
};

/**
 * Several stored arrays concatenated, e.g. the arrays collected from each branch of a for-each step.
 */
export type StoredConcatRef<
  Kind extends StorablePayloadKind = StorablePayloadKind,
> = {
  __stored: true;
  kind: Kind;
  array: true;
  parts: StoredArrayRef<Kind>[];
  length: number;
};

/**
 * A stored payload reference to a singular value.
 */
export type SingularStoredPayloadRef<
  Kind extends StorablePayloadKind = StorablePayloadKind,
> = StoredObjectRef<Kind, false> | StoredItemRef<Kind>;

/**
 * A stored payload reference to an array of values.
 */
export type ArrayStoredPayloadRef<
  Kind extends StorablePayloadKind = StorablePayloadKind,
> = StoredObjectRef<Kind, true> | StoredConcatRef<Kind>;

type StoredArrayRef<Kind extends StorablePayloadKind> =
  ArrayStoredPayloadRef<Kind>;

/**
 * A reference to a payload that has been stored in S3, used to avoid passing large payloads through Temporal.
 *
 * Only activities resolve references (see `payload-storage.ts` in `@local/hash-backend-utils`): workflow code
 * handles them using their metadata alone, e.g. an array's `length`, or an item's index.
 */
export type StoredPayloadRef<
  Kind extends StorablePayloadKind = StorablePayloadKind,
  IsArray extends boolean = boolean,
> = IsArray extends true
  ? ArrayStoredPayloadRef<Kind>
  : SingularStoredPayloadRef<Kind>;

/** Type guard to check if a value is a stored payload reference */
export const isStoredPayloadRef = (
  value: unknown,
): value is StoredPayloadRef => {
  return (
    typeof value === "object" &&
    value !== null &&
    "__stored" in value &&
    value.__stored === true
  );
};

/** Type guard to check if a stored payload ref is for an array */
export const isArrayStoredPayloadRef = <Kind extends StorablePayloadKind>(
  ref: StoredPayloadRef<Kind>,
): ref is ArrayStoredPayloadRef<Kind> => ref.array;

/** Type guard to check if a stored payload ref is for a singular value */
export const isSingularStoredPayloadRef = <Kind extends StorablePayloadKind>(
  ref: StoredPayloadRef<Kind>,
): ref is SingularStoredPayloadRef<Kind> => !ref.array;

/**
 * Payload value type used in activity outputs and inputs.
 *
 * - For a {@link StoredPayloadKind}, the value is always a stored reference.
 * - For a {@link StoredArrayPayloadKind}, an array is a stored reference, and a singular value is inline or, as
 *   an item of a stored array, a reference to that item.
 * - For other kinds, the value is the actual payload value (or array of values).
 *
 * An array a flow wrapped from a singular value holds that value, so it may also be a one-item array holding
 * an item reference.
 */
export type PayloadValue<
  Kind extends PayloadKind,
  IsArray extends boolean,
> = Kind extends StoredPayloadKind
  ? StoredPayloadRef<Kind, IsArray>
  : Kind extends StoredArrayPayloadKind
    ? IsArray extends true
      ?
          | ArrayStoredPayloadRef<Kind>
          | (PayloadKindValues[Kind] | StoredItemRef<Kind>)[]
      : PayloadKindValues[Kind] | StoredItemRef<Kind>
    : IsArray extends true
      ? PayloadKindValues[Kind][]
      : PayloadKindValues[Kind];

/**
 * Singular payload types for all payload kinds.
 */
export type SingularPayload = {
  [Kind in keyof PayloadKindValues]: {
    kind: Kind;
    value: PayloadValue<Kind, false>;
  };
}[keyof PayloadKindValues];

/**
 * Array payload types for all payload kinds.
 */
export type ArrayPayload = {
  [Kind in keyof PayloadKindValues]: {
    kind: Kind;
    value: PayloadValue<Kind, true>;
  };
}[keyof PayloadKindValues];

/**
 * General payload type used throughout the flow system. For stored kinds, the value may be a stored reference
 * that activities resolve.
 */
export type Payload = SingularPayload | ArrayPayload;

/**
 * Resolved payload types - used after stored refs have been resolved (e.g., in GraphQL responses).
 * These contain actual values instead of StoredPayloadRef for stored payload kinds.
 */
export type ResolvedSingularPayload = {
  [Kind in keyof PayloadKindValues]: {
    kind: Kind;
    value: PayloadKindValues[Kind];
  };
}[keyof PayloadKindValues];

export type ResolvedArrayPayload = {
  [Kind in keyof PayloadKindValues]: {
    kind: Kind;
    value: PayloadKindValues[Kind][];
  };
}[keyof PayloadKindValues];

/**
 * Payload type after stored refs have been resolved.
 * Used in frontend/GraphQL contexts where the backend has already resolved StoredPayloadRefs.
 */
export type ResolvedPayload = ResolvedSingularPayload | ResolvedArrayPayload;

/**
 * A payload of the kind `Kind`, for code that is generic over the kind: an action whose inputs and outputs take their
 * kind from another input (see `KindFrom`).
 *
 * A payload built from another's `kind` and items keeps its `Kind`, so TypeScript checks that it isn't given a
 * different kind, or values of one. A `Payload` can't be built that way: its kind and value only match once it is
 * narrowed on `kind`. `asPayload` converts this type to that one.
 */
export type PayloadWithKind<
  Kind extends PayloadKind,
  IsArray extends boolean,
> = {
  kind: Kind;
  value: PayloadValue<Kind, IsArray>;
};

/**
 * A resolved `PayloadWithKind`: its value holds values of its kind, not stored references.
 */
export type ResolvedPayloadWithKind<
  Kind extends PayloadKind,
  IsArray extends boolean,
> = {
  kind: Kind;
  value: IsArray extends true
    ? PayloadKindValues[Kind][]
    : PayloadKindValues[Kind];
};

/**
 * Converts a `PayloadWithKind` to a `Payload`, which can be narrowed on its kind.
 *
 * Code generic over `Kind` can only give a `PayloadWithKind` a value of its kind. When `Kind` is a union, TypeScript
 * can't check that: an action's outputs are typed with such a union only outside the action, once the action has been
 * checked (see `FlowActionActivity`).
 */
export const asPayload = <Kind extends PayloadKind, IsArray extends boolean>(
  payload: PayloadWithKind<Kind, IsArray>,
) =>
  payload as unknown as IsArray extends true ? ArrayPayload : SingularPayload;

/**
 * Step Definition
 */

/**
 * An action input or output with a derived kind: its kind is whatever kind is connected to another input of the
 * same action, its kind source. E.g. `filter`'s `matches` output takes its kind from its `items` input.
 *
 * The kind source must list the kinds it accepts. `array` and `required` belong to the input or output itself:
 * kinds don't nest.
 */
export type KindFrom = {
  kindFrom: string;
};

/**
 * The kinds an action input accepts: its own list, or, for a derived kind, its kind source's.
 */
export type AcceptedKinds<ActionInputs, Input> = Input extends {
  readonly oneOfPayloadKinds: readonly (infer Kind extends PayloadKind)[];
}
  ? Kind
  : Input extends { readonly kindFrom: infer KindSourceName }
    ? Extract<ActionInputs, { readonly name: KindSourceName }> extends {
        readonly oneOfPayloadKinds: readonly (infer Kind extends PayloadKind)[];
      }
      ? Kind
      : never
    : never;

/**
 * An action's input: the kinds it accepts, or the kind connected to another input (see `KindFrom`).
 */
export type InputDefinition = {
  name: string;
  description?: string;
  array: boolean;
  required: boolean;
  default?: Payload;
} & ({ oneOfPayloadKinds: readonly PayloadKind[] } | KindFrom);

/**
 * An action's output: a fixed kind, or the kind connected to one of its inputs (see `KindFrom`). A flow's outputs
 * are `FlowOutputDefinition`s.
 */
export type OutputDefinition<
  IsArray extends boolean = boolean,
  Kind extends PayloadKind = PayloadKind,
> = {
  name: string;
  description?: string;
  array: IsArray;
  required: boolean;
} & ({ payloadKind: Kind } | KindFrom);

/**
 * A check an action needs beyond the shapes of its inputs, e.g. that a constant fits the kind of another input.
 */
export type ActionStepCheck = (params: {
  step: ActionStepDefinition<string>;
  /** The kind of the value connected to an input of the step, or `null` if it isn't connected or doesn't resolve. */
  getInputKind: (inputName: string) => PayloadKind | null;
  report: (inputName: string, message: string) => void;
}) => void;

/**
 * Temporal's settings for each attempt of an action's activity. The activity runs on the task queue of the worker that
 * implements the action (see `getActionActivityOptions`).
 */
export type ActionActivitySettings = {
  /** How long one attempt may take. */
  startToCloseTimeoutSeconds: number;
  /**
   * For an action that heartbeats, how long an attempt may go without one before it's treated as failed. The action
   * heartbeats more often than this, and can then run for longer (`startToCloseTimeoutSeconds`), since a stalled
   * attempt is caught sooner.
   */
  heartbeatTimeoutSeconds?: number;
  /**
   * Whether the action handles cancellation, so that a run that's cancelled waits for it to finish rather than
   * abandoning it. An action that does:
   * - heartbeats often, so it's known to be running;
   * - catches the cancellation (`Context.current().cancelled`) and rethrows it after cleaning up;
   * - ideally, checks for cancellation at points in its work where it can stop;
   * - ideally, records its progress in its heartbeats, and resumes from `lastHeartbeatDetails`.
   */
  handlesCancellation: boolean;
};

export type ActionDefinition<
  ActionDefinitionId extends FlowActionDefinitionId,
> = {
  kind: "action";
  actionDefinitionId: ActionDefinitionId;
  name: string;
  description: string;
  activitySettings: ActionActivitySettings;
  inputs: InputDefinition[];
  outputs: OutputDefinition[];
  /** Run when a flow is validated, for each step of the action. */
  check?: ActionStepCheck;
};

/**
 * Whether a connection leaves the value available to other consumers (`read`) or takes it (`consume`). Unset
 * means `read`.
 */
export type ValueAccess = "read" | "consume";

type ConnectionOptions = {
  access?: ValueAccess;
  /** Explicitly wraps a singular value into a one-item array, to feed an array input. */
  wrap?: true;
  /**
   * Allows a value that may be missing to feed a required input: when it is missing, the consuming step, and
   * everything that depends on it, is skipped rather than failed.
   */
  whenMissing?: "skip";
};

/**
 * A fixed value. `value` is an array when the payload is an array.
 */
export type ConstantPayload = {
  kind: PayloadKind;
  value: unknown;
};

/**
 * Where a step input's value comes from.
 */
export type StepInputSource =
  | ({ kind: "flow-input"; inputName: string } & ConnectionOptions)
  | ({
      kind: "step-output";
      stepId: string;
      outputName: string;
    } & ConnectionOptions)
  /** The current item of the nearest enclosing for-each step. */
  | ({ kind: "item" } & ConnectionOptions)
  /** A fixed value, the same in every run. */
  | { kind: "constant"; payload: ConstantPayload };

export type ActionStepDefinition<
  ActionDefinitionId extends string = FlowActionDefinitionId,
> = {
  kind: "action";
  stepId: string;
  /**
   * The id of an action definition. A definition from outside the codebase may name an action that doesn't
   * exist: `validateFlowDefinition` reports it.
   */
  actionDefinitionId: ActionDefinitionId;
  description: string;
  /** The source of each of the action's inputs that is connected, by input name. */
  inputs: Record<string, StepInputSource>;
  retryCount?: number;
};

/**
 * A step which runs its nested steps once per item of an array, in parallel, and collects one output from
 * every item.
 *
 * e.g. for each input entity, do X with that entity in a separate branch.
 */
export type ForEachStepDefinition<
  ActionDefinitionId extends string = FlowActionDefinitionId,
> = {
  kind: "for-each";
  stepId: string;
  description: string;
  /** The array whose items each run the nested steps once. */
  over: StepInputSource;
  steps: StepDefinition<ActionDefinitionId>[];
  /**
   * The output of a nested step, collected from every item into an array: singular outputs are gathered, and
   * array outputs concatenated. It must always be present, and it is the step's only output, called `as`.
   */
  collect: { stepId: string; outputName: string; as: string };
};

export type StepDefinition<
  ActionDefinitionId extends string = FlowActionDefinitionId,
> =
  | ActionStepDefinition<ActionDefinitionId>
  | ForEachStepDefinition<ActionDefinitionId>;

/**
 * An input to a flow, which whatever starts a run supplies.
 */
export type FlowInputDefinition = {
  name: string;
  payloadKind: PayloadKind;
  array: boolean;
  required: boolean;
  /** How the input is presented to people, e.g. as a run form field. Defaults to its name. */
  label?: string;
  description?: string;
};

/**
 * A step output exposed as one of the flow's outputs.
 */
export type FlowOutputDefinition = {
  name: string;
  stepId: string;
  outputName: string;
  description?: string;
};

/**
 * What a flow does: its inputs, the steps that connect them, and its outputs. It is what a `Flow Definition`
 * entity holds, and has no id: the entity's uuid identifies it. It says nothing about how a flow
 * is started – triggers are separate – or which worker runs it, which follows from its actions (see
 * `getFlowType`).
 *
 * In-repo flows are written with the typed builder in `define-flow.ts`. Definitions from anywhere else (a GUI,
 * YAML, the graph) are checked with `validateFlowDefinition` before use.
 */
export type FlowDefinition<
  ActionDefinitionId extends string = FlowActionDefinitionId,
> = {
  name: string;
  description: string;
  inputs: FlowInputDefinition[];
  /** In any order: the validator checks for dangling references and cycles. */
  steps: StepDefinition<ActionDefinitionId>[];
  outputs: FlowOutputDefinition[];
};

/**
 * A flow definition with the uuid of its `Flow Definition` entity, as for the flows defined in code.
 */
export type FlowDefinitionWithId<
  ActionDefinitionId extends string = FlowActionDefinitionId,
> = {
  flowDefinitionId: EntityUuid;
  flowDefinition: FlowDefinition<ActionDefinitionId>;
};

/**
 * The values given to a flow's inputs, by input name. An input that isn't given has no key.
 */
export type FlowInputValues = Record<string, Payload>;

export type StepInput<P extends Payload = Payload> = {
  inputName: string;
  payload: P;
};

export type StepOutput<P extends Payload = Payload> = {
  outputName: string;
  payload: P;
};

/**
 * StepOutput with resolved payload - used in frontend/GraphQL contexts
 * where stored refs have been resolved by the backend.
 */
export type ResolvedStepOutput = {
  outputName: string;
  payload: ResolvedPayload;
};

export type ActionStep<
  ActionDefinitionId extends FlowActionDefinitionId = FlowActionDefinitionId,
> = {
  stepId: string;
  kind: "action";
  actionDefinitionId: ActionDefinitionId;
  retries?: number;
  inputs?: StepInput[];
  outputs?: StepOutput[];
};

export type ForEachStep<
  ActionDefinitionId extends FlowActionDefinitionId = FlowActionDefinitionId,
> = {
  stepId: string;
  kind: "for-each";
  /** The array the step runs its nested steps for, once it is available. */
  over?: ArrayPayload;
  steps?: FlowStep<ActionDefinitionId>[];
  /**
   * The value each branch has contributed so far, keyed by its item's index: `null` for a branch whose collected
   * step was skipped, which contributes nothing.
   */
  branchValues?: Record<number, unknown>;
  /** The values collected from every branch, in item order. Set once every branch has contributed. */
  collected?: StepOutput<ArrayPayload>;
};

export type FlowStep<
  ActionDefinitionId extends FlowActionDefinitionId = FlowActionDefinitionId,
> = ActionStep<ActionDefinitionId> | ForEachStep<ActionDefinitionId>;

export type FlowInternetAccessSettings = {
  enabled: boolean;
  browserPlugin: {
    enabled: boolean;
    domains: string[];
  };
};

export type FlowDataSources = {
  /**
   * Any files the user decides to include in the flow's context
   */
  files: { fileEntityIds: EntityId[] };
  /**
   * Whether agents in the flow have access to the external internet, e.g. for web searches and for visiting URLs
   */
  internetAccess: FlowInternetAccessSettings;
};

/**
 * A simplified type for a FlowRun used internally in the worker logic.
 */
export type LocalFlowRun<
  ActionDefinitionId extends FlowActionDefinitionId = FlowActionDefinitionId,
> = {
  name: string;
  temporalWorkflowId: string;
  flowInputs: FlowInputValues;
  flowDefinitionEntityId: EntityId;
  steps: FlowStep<ActionDefinitionId>[];
  outputs?: StepOutput[];
};

export type ProgressLogBase = {
  recordedAt: string;
  stepId: string;
};

export type WorkerType =
  | "Coordinator"
  | "Sub-coordinator"
  | "Link explorer"
  | "Document analyzer";

/**
 * Identifiers for a 'worker' within the flow, which corresponds to an agent.
 *
 * Note that this is separate from the Temporal worker – the 'worker' here is a HASH concept for a specific research agent.
 */
export type WorkerIdentifiers = {
  workerType: WorkerType;
  /**
   * HASH-generated id for the worker
   */
  workerInstanceId: string;
  /**
   * HASH-generated workerInstanceId of the worker that created this one, if any.
   */
  parentInstanceId: string | null;
  /**
   * The identifier a parent worker used when creating this worker in a tool call, if any
   */
  toolCallId: string | null;
};

export type WorkerProgressLogBase = ProgressLogBase & WorkerIdentifiers;

/**
 * When a worker (agent) decides to stop a worker it has created, this log is created.
 */
export type WorkerWasStoppedLog = WorkerProgressLogBase & {
  explanation: string;
  type: "WorkerWasStopped";
};

/**
 * An internet search query is made.
 */
export type QueriedWebLog = WorkerProgressLogBase & {
  explanation: string;
  query: string;
  type: "QueriedWeb";
};

/**
 * An agent created a plan
 */
export type CreatedPlanLog = WorkerProgressLogBase & {
  plan: string;
  type: "CreatedPlan";
};

/**
 * An agent updated a plan
 */
export type UpdatedPlanLog = WorkerProgressLogBase & {
  plan: string;
  type: "UpdatedPlan";
};

/**
 * An agent visited a web page (e.g. to infer claims from it)
 */
export type VisitedWebPageLog = WorkerProgressLogBase & {
  explanation: string;
  webPage: Pick<WebPage, "url" | "title">;
  type: "VisitedWebPage";
};

type StartedCoordinatorLog = WorkerProgressLogBase & {
  attempt: number;
  input: {
    goal: string;
  };
  type: "StartedCoordinator";
};

export type ClosedCoordinatorLog = WorkerProgressLogBase & {
  errorMessage?: string;
  output: {
    entityCount: number;
  };
  type: "ClosedCoordinator";
};

export type StartedSubCoordinatorLog = WorkerProgressLogBase & {
  explanation: string;
  input: {
    goal: string;
    entityTypeTitles: string[];
  };
  type: "StartedSubCoordinator";
};

export type CoordinatorWaitsForTasksLog = WorkerProgressLogBase & {
  explanation: string;
  type: "CoordinatorWaitsForTasks";
};

export type ClosedSubCoordinatorLog = WorkerProgressLogBase & {
  errorMessage?: string;
  explanation: string;
  goal: string;
  output: {
    claimCount: number;
    entityCount: number;
  };
  type: "ClosedSubCoordinator";
};

export type StartedLinkExplorerTaskLog = WorkerProgressLogBase & {
  explanation: string;
  input: {
    goal: string;
    initialUrl: string;
  };
  type: "StartedLinkExplorerTask";
};

export type ClosedLinkExplorerTaskLog = WorkerProgressLogBase & {
  errorMessage?: string;
  goal: string;
  output: {
    claimCount: number;
    entityCount: number;
    resourcesExploredCount: number;
    suggestionForNextSteps: string;
  };
  type: "ClosedLinkExplorerTask";
};

export type InferredClaimsFromTextLog = WorkerProgressLogBase & {
  output: {
    claimCount: number;
    entityCount: number;
    resource: {
      title?: string;
      url: string;
    };
  };
  type: "InferredClaimsFromText";
};

export type ViewedFile = WorkerProgressLogBase & {
  explanation: string;
  file: Pick<WebPage, "url" | "title">;
  recordedAt: string;
  stepId: string;
  type: "ViewedFile";
};

export type ProposedEntityLog = WorkerProgressLogBase & {
  proposedEntity: Omit<ProposedEntity, "provenance">;
  isUpdateToExistingProposal: boolean;
  type: "ProposedEntity";
};

export type PersistedEntityLog = ProgressLogBase & {
  persistedEntityMetadata: PersistedEntityMetadata;
  type: "PersistedEntityMetadata";
};

export type ActivityFailedLog = ProgressLogBase & {
  message: string;
  retrying: boolean;
  type: "ActivityFailed";
};

/**
 * The flow was reset to a previous checkpoint
 */
export type ResetToCheckpointLog = ProgressLogBase & {
  type: "ResetToCheckpoint";
};

/**
 * A checkpoint was created
 */
export type CheckpointLog = ProgressLogBase & {
  type: "ResearchActionCheckpoint";
  checkpointId: string;
  eventId: number;
};

export type StepProgressLog =
  | ActivityFailedLog
  | CheckpointLog
  | ClosedCoordinatorLog
  | ClosedLinkExplorerTaskLog
  | ClosedSubCoordinatorLog
  | CoordinatorWaitsForTasksLog
  | CreatedPlanLog
  | InferredClaimsFromTextLog
  | PersistedEntityLog
  | ProposedEntityLog
  | QueriedWebLog
  | ResetToCheckpointLog
  | StartedCoordinatorLog
  | StartedLinkExplorerTaskLog
  | StartedSubCoordinatorLog
  | WorkerWasStoppedLog
  | UpdatedPlanLog
  | ViewedFile
  | VisitedWebPageLog;

export type FlowSignalType =
  | "externalInputRequest"
  | "externalInputResponse"
  | "logProgress"
  | "researchActionCheckpoint"
  | "stepAttemptFailed"
  | "stepAttemptStarted"
  | "stopWorker";

export type ProgressLogSignal = {
  attempt: number;
  logs: StepProgressLog[];
};

/**
 * Sent by a step's activity when one of its attempts starts. Temporal records only an activity's last attempt in its
 * run's history, so these record when the others started.
 */
export type StepAttemptStartedSignal = {
  /** The activity's id: the step's id, or for a step inside a `forEach`, its step run id. */
  stepRunId: string;
  attempt: number;
  /**
   * How the attempt before it failed, as Temporal recorded it when it retried. Temporal records it in the run's
   * history only on the last attempt's start, and an attempt that timed out or whose worker stopped sends no failure.
   */
  previousAttemptError?: { message: string };
};

/**
 * Sent by a step's activity when one of its attempts throws and Temporal retries it. The last attempt's failure is in
 * the run's history, so it isn't sent.
 */
export type StepAttemptFailedSignal = {
  stepRunId: string;
  attempt: number;
  error: { message: string };
};

type ExternalInputRequestType = "human-input" | "get-urls-html-content";

type ExternalInputRequestDataByType = {
  "human-input": {
    questions: string[];
  };
  "get-urls-html-content": {
    urls: string[];
  };
};

export type ExternalInputRequestSignal<
  RequestType extends ExternalInputRequestType = ExternalInputRequestType,
> = {
  [Type in RequestType]: {
    requestId: string;
    stepId: string;
    type: Type;
    data: ExternalInputRequestDataByType[Type];
  };
}[RequestType];

export type ExternalInputResponseByType = {
  "human-input": {
    answers: string[];
  };
  "get-urls-html-content": {
    webPages: WebPage[];
  };
};

export type ExternalInputResponseSignal<
  RequestType extends ExternalInputRequestType = ExternalInputRequestType,
> = {
  [Type in RequestType]: {
    resolvedBy: ActorEntityUuid;
    requestId: string;
    type: Type;
    data: ExternalInputResponseByType[Type];
  };
}[RequestType];

export type ExternalInputResponseWithoutUser = DistributiveOmit<
  ExternalInputResponseSignal,
  "resolvedBy"
>;

export type ExternalInputRequest<
  RequestType extends ExternalInputRequestType = ExternalInputRequestType,
> = ExternalInputRequestSignal<RequestType> & {
  /** The answers given by the human, if it was a request for human input */
  answers?: string[];
  /** The time at which the request was resolved */
  resolvedAt?: string;
  /** The user that responded to the request (or the user whose device responded to the request) */
  resolvedBy?: ActorEntityUuid;
  /** The time at which the request was made */
  raisedAt: string;
};

export type FlowUsageRecordCustomMetadata = {
  taskName?: string;
  stepId?: string;
};

/**
 * A step the engine skipped because a value it needs is missing. A skipped step runs no activity, so the engine
 * records its skips in the run's Temporal memo, under `skippedSteps`.
 */
export type SkippedStep = {
  stepId: string;
  /** The step's action, or `forEach` for a for-each step. */
  stepType: string;
  skippedAt: string;
};

/**
 * A for-each step the engine fanned out into a run of its steps per item. Fanning out runs no activity, so the engine
 * records when it fanned out in the run's Temporal memo, under `startedForEachSteps`.
 */
export type StartedForEachStep = {
  stepId: string;
  itemCount: number;
  startedAt: string;
};
