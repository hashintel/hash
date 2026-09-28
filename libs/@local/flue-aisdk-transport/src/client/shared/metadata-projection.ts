import type {
  ConversationStreamChunk,
  FlueConversationMessage,
  FlueConversationSettlement,
} from "@flue/sdk";

/** What a host may derive AI SDK message metadata from. */
export interface MetadataProjectionInput {
  /** Agent-authored response metadata, merged as Flue merges it. */
  readonly agentMetadata: FlueConversationMessage["metadata"];
  /** How the response's submission settled, once it has. */
  readonly outcome: FlueConversationSettlement["outcome"] | undefined;
}

/** Project a response's metadata; `undefined` means the message has none. */
export type MetadataProjection<Metadata> = (
  input: MetadataProjectionInput,
) => Metadata | undefined;

type AgentMetadata = NonNullable<
  Extract<ConversationStreamChunk, { type: "message-metadata" }>["metadata"]
>;

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
};

const pollutingKeys = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Merge an agent metadata write onto the accumulated metadata as Flue's
 * runtime does: later values win, `undefined` is skipped, plain objects merge
 * recursively, and prototype-polluting keys are dropped.
 */
export const mergeAgentMetadata = (
  base: AgentMetadata | undefined,
  patch: AgentMetadata,
): AgentMetadata => {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || pollutingKeys.has(key)) continue;
    const existing = merged[key];
    merged[key] =
      isPlainRecord(existing) && isPlainRecord(value)
        ? mergeAgentMetadata(existing, value)
        : value;
  }
  return merged;
};
