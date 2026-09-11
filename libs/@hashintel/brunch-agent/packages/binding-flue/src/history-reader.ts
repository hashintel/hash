import {
  createFlueClient,
  type FlueConversationMessage,
  type FlueConversationSnapshot,
} from "@flue/sdk";

import {
  REPLY_BOUND_SIGNAL_TAG,
  SWEEP_REPAIR_SIGNAL_TAG,
  SWEEP_RESULT_STATUSES,
  sweepAffordanceFrom,
  toolName,
  type CaptureStore,
  type ReadonlyJsonValue,
  type SessionEntryKind,
  type SweepAffordance,
  type SweepResultFact,
  type SweepSessionEntry,
} from "@hashintel/brunch-agent";

import { archiveThroughBinding } from "./archive-capability";

import type { SessionLogRead } from "@hashintel/brunch-agent/storage";

export interface FlueHistoryReaderOptions {
  /** Host-owned full conversation URL; the binding never guesses the mount. */
  readonly resolveConversationUrl: (sessionId: string) => string;
  /** Host-owned transport, including in-process router.fetch adapters. */
  readonly transport: typeof fetch;
  readonly archive: CaptureStore;
}

export interface FlueHistoryReader {
  /** Read the live public projection without mutating the target archive. */
  peek(sessionId: string): Promise<FlueConversationSnapshot>;
  /** Refresh the binding-private archive from the live public projection. */
  read(sessionId: string): Promise<FlueConversationSnapshot>;
}

const materializedJson = (value: unknown): ReadonlyJsonValue =>
  JSON.parse(JSON.stringify(value)) as ReadonlyJsonValue;

const messageText = (message: FlueConversationMessage): string =>
  message.parts
    .filter(
      (part): part is Extract<typeof part, { type: "text" }> =>
        part.type === "text",
    )
    .map((part) => part.text)
    .join("");

const isSweepResultStatus = (
  value: unknown,
): value is SweepResultFact["status"] =>
  SWEEP_RESULT_STATUSES.some((status) => status === value);

const sweepResultFrom = (value: unknown): SweepResultFact | undefined => {
  if (
    typeof value !== "object" ||
    value === null ||
    !("status" in value) ||
    !isSweepResultStatus(value.status)
  )
    return undefined;
  if (value.status !== "refused") {
    return { status: value.status };
  }
  if (
    !("refusal" in value) ||
    typeof value.refusal !== "object" ||
    value.refusal === null ||
    !("code" in value.refusal) ||
    typeof value.refusal.code !== "string" ||
    !("message" in value.refusal) ||
    typeof value.refusal.message !== "string"
  ) {
    return undefined;
  }
  return {
    status: "refused",
    refusal: { code: value.refusal.code, message: value.refusal.message },
  };
};

export const projectFlueHistoryForSweep = (
  snapshot: Pick<FlueConversationSnapshot, "messages">,
): readonly SweepSessionEntry[] => {
  const { messages } = snapshot;
  const emittedAffordanceIds = new Set<string>();
  const affordancesByMessageId = new Map<string, SweepAffordance[]>();
  for (const message of messages) {
    const affordances: SweepAffordance[] = [];
    for (const part of message.parts) {
      const affordance =
        part.type === "data-affordance"
          ? sweepAffordanceFrom(part.data)
          : part.type === "dynamic-tool" && part.state === "output-available"
            ? sweepAffordanceFrom(part.output)
            : undefined;
      if (affordance && !emittedAffordanceIds.has(affordance.id)) {
        emittedAffordanceIds.add(affordance.id);
        affordances.push(affordance);
      }
    }
    if (affordances.length > 0)
      affordancesByMessageId.set(message.id, affordances);
  }
  const replyAffordanceByMessageId = new Map<string, string>();
  for (let index = 1; index < messages.length; index += 1) {
    const message = messages[index]!;
    const previous = messages[index - 1]!;
    const affordanceId = message.signal?.attributes?.affordanceId;
    if (
      message.role === "system" &&
      message.purpose === "dispatch" &&
      message.signal?.tagName === REPLY_BOUND_SIGNAL_TAG &&
      typeof affordanceId === "string" &&
      emittedAffordanceIds.has(affordanceId) &&
      previous.role === "user" &&
      previous.purpose === "user"
    ) {
      replyAffordanceByMessageId.set(previous.id, affordanceId);
    }
  }

  return messages.map((message) => {
    let kind: SessionEntryKind;
    if (message.role === "user" && message.purpose === "user") {
      kind = replyAffordanceByMessageId.has(message.id)
        ? "user-affordance-payload"
        : "user";
    } else if (
      message.role === "assistant" &&
      message.purpose === "assistant"
    ) {
      kind = "assistant";
    } else {
      kind = "non-user";
    }
    const affordances = affordancesByMessageId.get(message.id);
    const replyToAffordanceId = replyAffordanceByMessageId.get(message.id);
    const sweepResult = message.parts.reduce<SweepResultFact | undefined>(
      (latest, part) => {
        if (
          part.type !== "dynamic-tool" ||
          part.toolName !== toolName("sweep") ||
          part.state !== "output-available"
        ) {
          return latest;
        }
        return sweepResultFrom(part.output) ?? latest;
      },
      undefined,
    );
    return {
      id: message.id,
      kind,
      text: messageText(message),
      ...(affordances === undefined ? {} : { affordances }),
      ...(replyToAffordanceId === undefined ? {} : { replyToAffordanceId }),
      ...(sweepResult === undefined ? {} : { sweepResult }),
      ...(message.signal?.tagName === SWEEP_REPAIR_SIGNAL_TAG
        ? { sweepRepairSignal: true as const }
        : {}),
    };
  });
};

const classifyMessages = (
  snapshot: FlueConversationSnapshot,
): readonly SessionLogRead["entries"][number][] =>
  projectFlueHistoryForSweep(snapshot).map((entry, index) => ({
    substrateEntryId: entry.id,
    kind: entry.kind,
    text: entry.text,
    materialized: materializedJson(snapshot.messages[index]!),
  }));

export const createFlueHistoryReader = (
  options: FlueHistoryReaderOptions,
): FlueHistoryReader => {
  const peek = async (sessionId: string): Promise<FlueConversationSnapshot> => {
    const client = createFlueClient({
      url: options.resolveConversationUrl(sessionId),
      fetch: options.transport,
    });
    return client.history();
  };

  return {
    peek,
    async read(sessionId) {
      const snapshot = await peek(sessionId);
      await archiveThroughBinding(options.archive, {
        sessionId,
        substrateConversationId: snapshot.conversationId,
        offset: snapshot.offset,
        ...(snapshot.incarnation === undefined
          ? {}
          : { incarnation: snapshot.incarnation }),
        entries: classifyMessages(snapshot),
        settlements: snapshot.settlements.map(materializedJson),
      });
      return snapshot;
    },
  };
};
