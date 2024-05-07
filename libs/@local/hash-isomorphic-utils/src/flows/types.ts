import type { VersionedUrl } from "@blockprotocol/type-system";
import type {
  PropertyMetadataMap,
  ProvidedEntityEditionProvenance,
} from "@local/hash-graph-client";
import type { ActorTypeDataType } from "@local/hash-isomorphic-utils/system-types/google/googlesheetsfile";
import type {
  Entity,
  EntityId,
  EntityPropertiesObject,
  EntityUuid,
} from "@local/hash-subgraph";
import type { Status } from "@local/status";

import type { ActionDefinitionId } from "./action-definitions";
import type { TriggerDefinitionId } from "./trigger-definitions";

export type DeepReadOnly<T> = {
  readonly [key in keyof T]: DeepReadOnly<T[key]>;
};

export type WebPage = {
  url: string;
  title: string;
  htmlContent: string;
};

type LocalOrExistingEntityId =
  | { kind: "proposed-entity"; localId: string }
  | { kind: "existing-entity"; entityId: EntityId };

/**
 * @todo sort out mismatch between this and the ProposedEntity type inside infer-entities/
 *    possibly just resolved by removing the latter when browser plugin inference migrated to a Flow
 */
export type ProposedEntity = {
  provenance?: ProvidedEntityEditionProvenance;
  propertyMetadata?: PropertyMetadataMap;
  localEntityId: string;
  entityTypeId: VersionedUrl;
  summary?: string;
  properties: EntityPropertiesObject;
  sourceEntityId?: LocalOrExistingEntityId;
  targetEntityId?: LocalOrExistingEntityId;
};

export type ProposedEntityWithResolvedLinks = Omit<
  ProposedEntity,
  "localEntityId" | "sourceEntityLocalId" | "targetEntityLocalId"
> & {
  linkData?: {
    leftEntityId: EntityId;
    rightEntityId: EntityId;
  };
};

export type PersistedEntity = {
  entity?: Entity;
  existingEntity?: Entity;
  operation: "create" | "update" | "already-exists-as-proposed";
};

export type FailedEntityProposal = {
  existingEntity?: Entity;
  operation?: "create" | "update" | "already-exists-as-proposed";
  proposedEntity: ProposedEntityWithResolvedLinks;
  message: string;
};

export type PersistedEntities = {
  persistedEntities: PersistedEntity[];
  failedEntityProposals: FailedEntityProposal[];
};

export const textFormats = ["CSV", "HTML", "Markdown", "Plain"] as const;

export type TextFormat = (typeof textFormats)[number];

export type FormattedText = {
  content: string;
  format: TextFormat;
};

export type GoogleSheet = { spreadsheetId: string } | { newSheetName: string };

export type PayloadKindValues = {
  ActorType: ActorTypeDataType;
  Boolean: boolean;
  Entity: Entity;
  EntityId: EntityId;
  FormattedText: FormattedText;
  GoogleAccountId: string;
  GoogleSheet: GoogleSheet;
  Number: number;
  PersistedEntities: PersistedEntities;
  PersistedEntity: PersistedEntity;
  ProposedEntity: ProposedEntity;
  ProposedEntityWithResolvedLinks: ProposedEntityWithResolvedLinks;
  Text: string;
  VersionedUrl: VersionedUrl;
  WebPage: WebPage;
};

export type PayloadKind = keyof PayloadKindValues;

export type SingularPayload = {
  [K in keyof PayloadKindValues]: {
    kind: K;
    value: PayloadKindValues[K];
  };
}[keyof PayloadKindValues];

export type ArrayPayload = {
  [K in keyof PayloadKindValues]: {
    kind: K;
    value: PayloadKindValues[K][];
  };
}[keyof PayloadKindValues];

export type Payload = SingularPayload | ArrayPayload;

/**
 * Step Definition
 */

export type InputDefinition = {
  name: string;
  description?: string;
  oneOfPayloadKinds: PayloadKind[];
  array: boolean;
  required: boolean;
  default?: Payload;
};

export type OutputDefinition<
  A extends boolean = boolean,
  K extends PayloadKind = PayloadKind,
> = {
  name: string;
  description?: string;
  payloadKind: K;
  array: A;
  required: boolean;
};

export type TriggerDefinition = {
  kind: "trigger";
  triggerDefinitionId: TriggerDefinitionId;
  name: string;
  outputs?: OutputDefinition[];
};

export type ActionDefinition = {
  kind: "action";
  actionDefinitionId: ActionDefinitionId;
  name: string;
  description: string;
  inputs: InputDefinition[];
  outputs: OutputDefinition[];
};

/**
 * Flow Definition
 */

export type StepInputSource<P extends Payload = Payload> = {
  inputName: string;
} & (
  | {
      /**
       * This refers to an output from a previous step, and can also refer
       * to outputs from the `trigger` by specifying `sourceStepId: "trigger"`.
       */
      kind: "step-output";
      sourceStepId: string;
      sourceStepOutputName: string;
      fallbackPayload?: P;
    }
  | {
      /**
       * A hardcoded value in the flow definition, which is constant
       * for all flow runs.
       */
      kind: "hardcoded";
      payload: P;
    }
);

export type ActionStepDefinition<
  AdditionalInputSources extends { inputName: string } | null = null,
> = {
  kind: "action";
  stepId: string;
  groupId?: number;
  actionDefinitionId: ActionDefinitionId;
  description: string;
  inputSources: AdditionalInputSources extends null
    ? StepInputSource[]
    : (StepInputSource | AdditionalInputSources)[];
  retryCount?: number;
};

export type ActionStepWithParallelInput = ActionStepDefinition<{
  /**
   * This additional input source refers to the dispersed input
   * for a parallel group.
   */
  inputName: string;
  kind: "parallel-group-input";
}>;

export type StepDefinition =
  | ActionStepDefinition
  | ActionStepWithParallelInput
  | ParallelGroupStepDefinition;

export type ParallelGroupStepDefinition = {
  kind: "parallel-group";
  stepId: string;
  groupId?: number;
  description: string;
  /**
   * The input source to parallelize on must expect an `ArrayPayload`,
   * so that each item in the array can be processed by the steps in
   * parallel.
   */
  inputSourceToParallelizeOn: StepInputSource<ArrayPayload>;
  /**
   * The steps that will be executed in parallel branches for each payload
   * item in the provided `ArrayPayload`.
   */
  steps: StepDefinition[];
  /**
   * The aggregate output of the parallel group must be defined
   * as an `array` output.
   */
  aggregateOutput: OutputDefinition<true> & {
    /**
     * The step ID for the step in the parallel group that will produce the
     * _singular_ output that will ber aggregated in an array as the
     * output for the parallel group.
     */
    stepId: string;
    /**
     * The name of the output that will be aggregated in an array from the
     */
    stepOutputName: string;
  };
};

type FlowDefinitionTrigger =
  | {
      kind: "trigger";
      description: string;
      triggerDefinitionId: Exclude<TriggerDefinitionId, "scheduledTrigger">;
      outputs?: OutputDefinition[];
    }
  | {
      kind: "scheduled";
      description: string;
      triggerDefinitionId: "scheduledTrigger";
      active: boolean;
      cronSchedule: string;
      outputs?: OutputDefinition[];
    };

export type StepGroup = {
  groupId: number;
  description: string;
};

export type FlowDefinition = {
  name: string;
  description: string;
  flowDefinitionId: EntityUuid;
  trigger: FlowDefinitionTrigger;
  groups?: StepGroup[];
  steps: StepDefinition[];
  outputs: (OutputDefinition & {
    /**
     * The step ID for the step in the flow that will produce the
     * output.
     */
    stepId: string;
    /**
     * The name of the output in the step
     */
    stepOutputName: string;
  })[];
};

/**
 * Flow Step
 */

export type StepInput<P extends Payload = Payload> = {
  inputName: string;
  payload: P;
};

export type StepOutput<P extends Payload = Payload> = {
  outputName: string;
  payload: P;
};

export type StepRunOutput = Status<Required<Pick<ActionStep, "outputs">>>;

export type ActionStep = {
  stepId: string;
  kind: "action";
  actionDefinitionId: ActionDefinitionId;
  retries?: number;
  inputs?: StepInput[];
  outputs?: StepOutput[];
};

export type ParallelGroupStep = {
  stepId: string;
  kind: "parallel-group";
  inputToParallelizeOn?: StepInput<ArrayPayload>;
  steps?: FlowStep[];
  aggregateOutput?: StepOutput<ArrayPayload>;
};

export type FlowStep = ActionStep | ParallelGroupStep;

/**
 * Flow
 */

export type FlowTrigger = {
  triggerDefinitionId: TriggerDefinitionId;
  outputs?: StepOutput[];
};

export type Flow = {
  flowId: EntityUuid;
  trigger: FlowTrigger;
  flowDefinitionId: EntityUuid;
  steps: FlowStep[];
  outputs?: StepOutput[];
};

export type VisitedWebPageLog = {
  webPage: Pick<WebPage, "url" | "title">;
  recordedAt: string;
  stepId: string;
  type: "VisitedWebPage";
};

export type ProposedEntityLog = {
  proposedEntity: ProposedEntity;
  recordedAt: string;
  stepId: string;
  type: "ProposedEntity";
};

export type PersistedEntityLog = {
  persistedEntity: PersistedEntity;
  recordedAt: string;
  stepId: string;
  type: "PersistedEntity";
};

export type StepProgressLog =
  | PersistedEntityLog
  | ProposedEntityLog
  | VisitedWebPageLog;

export type ProgressLogSignal = {
  attempt: number;
  logs: StepProgressLog[];
};

type ExternalInputRequestType = "human-input" | "get-urls-html-content";

type ExternalInputRequestDataByType = {
  "human-input": {
    question: string;
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
    answer: string;
  };
  "get-urls-html-content": {
    webPages: WebPage[];
  };
};

export type ExternalInputResponseSignal<
  RequestType extends ExternalInputRequestType = ExternalInputRequestType,
> = {
  [Type in RequestType]: {
    requestId: string;
    type: Type;
    data: ExternalInputResponseByType[Type];
  };
}[RequestType];

export type ExternalInputRequest = ExternalInputRequestSignal & {
  /** The answer given by the human, if it was a request for human input */
  answer?: string;
  /** Whether or not the request has been resolved */
  resolved: boolean;
};
