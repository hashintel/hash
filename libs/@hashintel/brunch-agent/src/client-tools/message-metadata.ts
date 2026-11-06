import type {
  FlueConversationMessage,
  FlueConversationSettlement,
} from "@flue/sdk";

/**
 * Brunch's projection of a response's metadata for a host UI. `stopped` and
 * `failed` are reserved for a durable ending: agent-authored markers are
 * dropped, and only an aborted or failed outcome sets them.
 */
export const projectBrunchMessageMetadata = ({
  agentMetadata,
  outcome,
}: {
  readonly agentMetadata: FlueConversationMessage["metadata"];
  readonly outcome: FlueConversationSettlement["outcome"] | undefined;
}): Record<string, unknown> | undefined => {
  const {
    stopped: _agentStopped,
    failed: _agentFailed,
    ...metadata
  } = agentMetadata ?? {};
  const projected =
    outcome === "aborted"
      ? { ...metadata, stopped: true }
      : outcome === "failed"
        ? { ...metadata, failed: true }
        : metadata;
  return Object.keys(projected).length === 0 ? undefined : projected;
};
