/**
 * Harness-side apply-sweep over a named Flue history range.
 *
 * The interviewer does not call this. A test or harness fact names the range.
 * Stub extraction: one envelope per user utterance, quote = that text, payload {}.
 */

import {
  createFlueHistoryReader,
  createLocalCaptureStore,
  projectFlueHistoryForSweep,
} from "@hashintel/brunch-agent-binding-flue";

import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
  type ConversationIdentity,
} from "../conversation/identity.ts";
import { captureStorePath } from "../db-path.ts";
import { CHAT_AGENT_ROUTE } from "../http/routes.ts";

export interface CaptureSweepCapture {
  readonly id: string;
  readonly excerpt: string;
  readonly payload: unknown;
}

export interface CaptureSweepResult {
  readonly appliedCaptureIds: readonly string[];
  readonly skippedDedupKeys: readonly string[];
  readonly captures: readonly CaptureSweepCapture[];
}

const conversationUrl = (instanceId: string): string =>
  `http://brunch.local/agents/${CHAT_AGENT_ROUTE}/${instanceId}`;

const sourceAppTransport: typeof fetch = async (input, init) => {
  const { default: app } = await import("../app.ts");
  return app.fetch(input instanceof Request ? input : new Request(input, init));
};

const ownedTransport = (
  identity: ConversationIdentity,
  transport: typeof fetch,
): typeof fetch => {
  const ownership = agentOwnershipHeaders(identity);
  return async (input, init) => {
    const headers = new Headers(init?.headers);
    for (const [key, value] of Object.entries(ownership)) {
      headers.set(key, value);
    }
    return transport(
      input instanceof Request
        ? new Request(input, { headers })
        : new Request(input, { ...init, headers }),
    );
  };
};

export const applyCaptureSweep = async (
  identity: ConversationIdentity,
  userEntryIds: readonly string[],
  transport: typeof fetch = sourceAppTransport,
): Promise<CaptureSweepResult> => {
  const instanceId = flueConversationIdFrom(identity);
  const store = createLocalCaptureStore(captureStorePath(instanceId), {
    ownerKey: identity.principalKey,
  });
  const historyReader = createFlueHistoryReader({
    resolveConversationUrl: conversationUrl,
    transport: ownedTransport(identity, transport),
    archive: store,
  });
  const snapshot = await historyReader.read(instanceId);
  const range = new Set(userEntryIds);
  const proposals = projectFlueHistoryForSweep(snapshot)
    .filter(
      (entry) =>
        entry.kind === "user" && range.has(entry.id) && entry.text.length > 0,
    )
    .map((entry) => ({
      evidence: [{ excerpt: entry.text }],
      epistemicStatus: "explicit" as const,
      confidence: "high",
      content: { value: {} },
    }));
  const applied = await store.execute(
    { type: "apply-sweep", proposals },
    { sessionId: instanceId },
  );
  if (!applied.ok) {
    throw new Error(
      `apply-sweep refused: ${applied.refusal.code}: ${applied.refusal.message}`,
    );
  }
  if (!("appliedCaptureIds" in applied.value)) {
    throw new Error("apply-sweep did not return a sweep value.");
  }
  return {
    appliedCaptureIds: applied.value.appliedCaptureIds,
    skippedDedupKeys: applied.value.skippedDedupKeys,
    captures: applied.snapshot.captures.map((capture) => ({
      id: capture.id,
      excerpt:
        "evidence" in capture ? (capture.evidence[0]?.excerpt ?? "") : "",
      payload:
        "value" in capture.content ? capture.content.value : capture.content,
    })),
  };
};
