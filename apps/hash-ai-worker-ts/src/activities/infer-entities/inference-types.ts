import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import type { SerializedEntity } from "@local/hash-graph-sdk/entity";
import type { BaseUrl } from "@local/hash-graph-types/ontology";
import type {
  InferredEntityChangeResult,
  ProposedEntity,
} from "@local/hash-isomorphic-utils/ai-inference-types";
import type OpenAI from "openai";

import type { DereferencedEntityType } from "../shared/dereference-entity-type.js";
import type { LlmUsage } from "../shared/get-llm-response/types.js";
import type { PermittedOpenAiModel } from "../shared/openai-client.js";

export type CompletionPayload = Omit<
  OpenAI.ChatCompletionCreateParams,
  "stream" | "tools" | "model"
> & { model: PermittedOpenAiModel };

export type DereferencedEntityTypesByTypeId = Record<
  VersionedUrl,
  {
    isLink: boolean;
    schema: DereferencedEntityType;
    simplifiedPropertyTypeMappings?: Record<string, BaseUrl>;
  }
>;

/**
 * @todo H-3163: remove these types by making the browser plugin flow use the same claim -> entity process as other flows
 */
export type ProposedEntitySummary = {
  entityId: number;
  entityTypeId: VersionedUrl;
  sourceEntityId?: number;
  targetEntityId?: number;
  takenFromQueue?: boolean;
  summary: string;
};

export type UpdateCandidate = {
  entity: SerializedEntity;
  proposedEntity: ProposedEntity;
  status: "update-candidate";
};

export type InferenceState = {
  /** Starting from 1, the current iteration number, where each iteration is a call to the LLM */
  iterationCount: number;
  /** The temporary ids for entities which the AI is being asked to provide details for */
  inProgressEntityIds: number[];
  /** A list of entities that can be inferred from the input, in summary form (no properties) */
  proposedEntitySummaries: ProposedEntitySummary[];
  /** A map of entity type IDs to a set of proposed entities, in entity form (with properties) */
  proposedEntityCreationsByType: Record<VersionedUrl, ProposedEntity[]>;
  /** The results of attempting to persist entities inferred from the input */
  resultsByTemporaryId: Record<
    number,
    InferredEntityChangeResult | UpdateCandidate
  >;
  /** The token usage for each iteration, in order */
  usage: LlmUsage[];
};
