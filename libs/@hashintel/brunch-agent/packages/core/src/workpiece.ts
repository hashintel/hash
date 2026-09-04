/**
 * Substrate-neutral selection of the current Markdown workpiece from an
 * append-only conversation projection.
 */

export const preparedWorkpieceSignalType = "brunch.fixture.prepared";
export const preparedWorkpieceSignalTag = "prepared-fixture";
export const preparedWorkpieceAuthorship = "test-authored";
export const preparedWorkpieceClaimBoundary = "prepared-not-model-produced";
export const preparedWorkpieceInitialDataMode = "validated-fixture-mutation";
export const runbookIrFence = "runbook-ir";

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
      readonly authorship: typeof preparedWorkpieceAuthorship;
      readonly claimBoundary: typeof preparedWorkpieceClaimBoundary;
      readonly fixtureId: string;
    };
    readonly body: string;
    readonly kind: "signal";
    readonly tagName: typeof preparedWorkpieceSignalTag;
    readonly type: typeof preparedWorkpieceSignalType;
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
  message.signal?.tagName === preparedWorkpieceSignalTag &&
  message.signal.attributes?.authorship === preparedWorkpieceAuthorship &&
  message.signal.attributes.claimBoundary === preparedWorkpieceClaimBoundary &&
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
    idempotencyKey: `${preparedWorkpieceSignalTag}:${input.fixtureId}:revision-${input.revision}`,
    message: {
      kind: "signal",
      type: preparedWorkpieceSignalType,
      tagName: preparedWorkpieceSignalTag,
      body: input.body,
      attributes: {
        fixtureId: input.fixtureId,
        authorship: preparedWorkpieceAuthorship,
        claimBoundary: preparedWorkpieceClaimBoundary,
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
    (message) => message.signal?.tagName === preparedWorkpieceSignalTag,
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
        authorship: preparedWorkpieceAuthorship,
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
