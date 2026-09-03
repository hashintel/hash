/**
 * Substrate-neutral selection of the current Markdown workpiece from an
 * append-only conversation projection.
 */

export const PREPARED_WORKPIECE_SIGNAL_TYPE = "brunch.fixture.prepared";
export const PREPARED_WORKPIECE_SIGNAL_TAG = "prepared-fixture";
export const PREPARED_WORKPIECE_AUTHORSHIP = "test-authored";
export const PREPARED_WORKPIECE_CLAIM_BOUNDARY = "prepared-not-model-produced";
export const PREPARED_WORKPIECE_INITIAL_DATA_MODE =
  "validated-fixture-mutation";
export const RUNBOOK_IR_FENCE = "runbook-ir";

type WorkpieceTextPart = {
  readonly text: string;
  readonly type: "text";
};

export interface WorkpieceHistoryMessage {
  readonly body?: string;
  readonly id: string;
  readonly parts: readonly (
    | WorkpieceTextPart
    | { readonly type: string; readonly [key: string]: unknown }
  )[];
  readonly purpose: string;
  readonly role: string;
  readonly signal?: {
    readonly attributes?: Readonly<Record<string, unknown>>;
    readonly tagName?: string;
    readonly type?: string;
  };
  readonly submissionId?: string;
}

export interface WorkpieceHistory {
  readonly conversationId: string;
  readonly messages: readonly WorkpieceHistoryMessage[];
}

export interface PreparedWorkpieceDelivery {
  readonly idempotencyKey: string;
  readonly message: {
    readonly attributes: {
      readonly authorship: typeof PREPARED_WORKPIECE_AUTHORSHIP;
      readonly claimBoundary: typeof PREPARED_WORKPIECE_CLAIM_BOUNDARY;
      readonly fixtureId: string;
    };
    readonly body: string;
    readonly kind: "signal";
    readonly tagName: typeof PREPARED_WORKPIECE_SIGNAL_TAG;
    readonly type: typeof PREPARED_WORKPIECE_SIGNAL_TYPE;
  };
}

export interface SelectedRunbookWorkpiece {
  readonly authorship: "model-produced" | "test-authored";
  readonly content: string;
  readonly fixtureId?: string;
  readonly sourceKind: "assistant" | "prepared-signal";
  readonly sourceMessage: WorkpieceHistoryMessage;
  readonly sourceMessageId: string;
  readonly sourceSubmissionId?: string;
}

const runbookIrFencePattern = /```runbook-ir\s*\n([\s\S]*?)```/gu;

export const latestRunbookIrBlock = (text: string): string | undefined => {
  const matches = [...text.matchAll(runbookIrFencePattern)];
  const last = matches.at(-1)?.[1];
  return last === undefined ? undefined : last.trim();
};

const textFrom = (message: WorkpieceHistoryMessage): string =>
  message.parts
    .filter((part): part is WorkpieceTextPart => part.type === "text")
    .map((part) => part.text)
    .join("\n");

const preparedFixtureIdFrom = (
  message: WorkpieceHistoryMessage,
): string | undefined => {
  const fixtureId = message.signal?.attributes?.fixtureId;
  return typeof fixtureId === "string" && fixtureId.length > 0
    ? fixtureId
    : undefined;
};

const isPreparedWorkpieceMessage = (
  message: WorkpieceHistoryMessage,
): boolean =>
  message.role === "system" &&
  message.purpose === "dispatch" &&
  message.signal?.tagName === PREPARED_WORKPIECE_SIGNAL_TAG &&
  message.signal.attributes?.authorship === PREPARED_WORKPIECE_AUTHORSHIP &&
  message.signal.attributes.claimBoundary ===
    PREPARED_WORKPIECE_CLAIM_BOUNDARY &&
  preparedFixtureIdFrom(message) !== undefined;

const selectedFrom = (
  message: WorkpieceHistoryMessage,
  source: Pick<SelectedRunbookWorkpiece, "authorship" | "sourceKind">,
): SelectedRunbookWorkpiece | undefined => {
  const content = latestRunbookIrBlock(textFrom(message));
  if (content === undefined) return undefined;

  return {
    ...source,
    content,
    sourceMessage: message,
    sourceMessageId: message.id,
    ...(message.submissionId === undefined
      ? {}
      : { sourceSubmissionId: message.submissionId }),
  };
};

export const createPreparedWorkpieceDelivery = (input: {
  readonly body: string;
  readonly fixtureId: string;
  readonly revision: number;
}): PreparedWorkpieceDelivery => {
  if (input.fixtureId.length === 0) {
    throw new Error("A prepared workpiece delivery requires a fixture id.");
  }
  if (latestRunbookIrBlock(input.body) === undefined) {
    throw new Error(
      "A prepared workpiece delivery requires a full runbook-ir block.",
    );
  }

  return {
    idempotencyKey: `${PREPARED_WORKPIECE_SIGNAL_TAG}:${input.fixtureId}:revision-${input.revision}`,
    message: {
      kind: "signal",
      type: PREPARED_WORKPIECE_SIGNAL_TYPE,
      tagName: PREPARED_WORKPIECE_SIGNAL_TAG,
      body: input.body,
      attributes: {
        fixtureId: input.fixtureId,
        authorship: PREPARED_WORKPIECE_AUTHORSHIP,
        claimBoundary: PREPARED_WORKPIECE_CLAIM_BOUNDARY,
      },
    },
  };
};

/**
 * Prepared revision zero is a tagged dispatch record. Later assistant
 * workpieces win in log order, except for the assistant reply produced by the
 * preparation submission itself.
 */
export const selectRunbookWorkpiece = (
  history: WorkpieceHistory,
): SelectedRunbookWorkpiece | undefined => {
  const preparedCandidates = history.messages.filter(
    (message) => message.signal?.tagName === PREPARED_WORKPIECE_SIGNAL_TAG,
  );
  if (preparedCandidates.length > 1) {
    throw new Error(
      `Conversation ${history.conversationId} has more than one prepared workpiece source.`,
    );
  }

  const preparedMessage = preparedCandidates.at(0);
  if (
    preparedMessage !== undefined &&
    !isPreparedWorkpieceMessage(preparedMessage)
  ) {
    throw new Error(
      `Conversation ${history.conversationId} has a malformed prepared workpiece source.`,
    );
  }

  const preparationSubmissionId = preparedMessage?.submissionId;
  let selected: SelectedRunbookWorkpiece | undefined;

  for (const message of history.messages) {
    if (message === preparedMessage) {
      const preparedWorkpiece = selectedFrom(message, {
        authorship: PREPARED_WORKPIECE_AUTHORSHIP,
        sourceKind: "prepared-signal",
      });
      if (preparedWorkpiece === undefined) {
        throw new Error(
          `Conversation ${history.conversationId} has a prepared source without a runbook-ir block.`,
        );
      }
      const fixtureId = preparedFixtureIdFrom(message);
      if (fixtureId === undefined) {
        throw new Error(
          `Conversation ${history.conversationId} has a malformed prepared workpiece source.`,
        );
      }
      selected = { ...preparedWorkpiece, fixtureId };
      continue;
    }
    if (
      message.purpose !== "assistant" ||
      message.role !== "assistant" ||
      (preparationSubmissionId !== undefined &&
        message.submissionId === preparationSubmissionId)
    ) {
      continue;
    }
    const assistantWorkpiece = selectedFrom(message, {
      authorship: "model-produced",
      sourceKind: "assistant",
    });
    if (assistantWorkpiece !== undefined) selected = assistantWorkpiece;
  }

  return selected;
};
