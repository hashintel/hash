import type {
  FlueConversationMessage,
  FlueConversationSettlement,
} from "@flue/sdk";

/**
 * Brunch's projection of a response's metadata for a host UI. `stopped` is
 * reserved for a durable abort: an agent-authored `stopped` is dropped, and
 * only an aborted outcome sets it.
 */
export const projectBrunchMessageMetadata = ({
  agentMetadata,
  outcome,
}: {
  readonly agentMetadata: FlueConversationMessage["metadata"];
  readonly outcome: FlueConversationSettlement["outcome"] | undefined;
}): Record<string, unknown> | undefined => {
  const { stopped: _agentStopped, ...metadata } = agentMetadata ?? {};
  const projected =
    outcome === "aborted" ? { ...metadata, stopped: true } : metadata;
  return Object.keys(projected).length === 0 ? undefined : projected;
};
