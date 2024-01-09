import { VersionedUrl } from "@blockprotocol/type-system/slim";
import {
  InferenceTokenUsage,
  InferredEntityChangeResult,
} from "@local/hash-isomorphic-utils/ai-inference-types";
import OpenAI from "openai";

import { DereferencedEntityType } from "./dereference-entity-type";

export type PermittedOpenAiModel =
  | "gpt-3.5-turbo-1106"
  | "gpt-4-1106-preview"
  | "gpt-4";

export type CompletionPayload = Omit<
  OpenAI.ChatCompletionCreateParams,
  "stream" | "tools" | "model"
> & { model: PermittedOpenAiModel };

export type DereferencedEntityTypesByTypeId = Record<
  VersionedUrl,
  { isLink: boolean; schema: DereferencedEntityType }
>;

export type ProposedEntitySummary = {
  entityId: number;
  entityTypeId: VersionedUrl;
  sourceEntityId?: number;
  targetEntityId?: number;
  takenFromQueue?: boolean;
  summary: string;
};

export type InferenceState = {
  /** Starting from 1, the current iteration number, where each iteration is a call to the LLM */
  iterationCount: number;
  /** The temporary ids for entities which the AI is being asked to provide details for */
  inProgressEntityIds: number[];
  /** A list of entities that can be inferred from the input, in summary form (no properties) */
  proposedEntitySummaries: ProposedEntitySummary[];
  /** The results of attempting to persist entities inferred from the input */
  resultsByTemporaryId: Record<number, InferredEntityChangeResult>;
  /** The token usage for each iteration, in order */
  usage: InferenceTokenUsage[];
};
