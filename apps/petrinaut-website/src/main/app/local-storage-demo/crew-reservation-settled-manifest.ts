import { sha256 as sha256Bytes } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

import { clientToolHistoryFrom } from "@hashintel/brunch-agent-transport-aisdk";
import { selectRunbookWorkpiece } from "@hashintel/brunch-agent/workpiece";
import { isSDCPNEqual, type SDCPN } from "@hashintel/petrinaut-core";
import { normalizePetrinautAiToolInput } from "@hashintel/petrinaut-core/ai";

import {
  crewReservationConversationId,
  crewReservationDocumentId,
  crewReservationFixtureId,
  dispatchCrewPlaceId,
  preparedCrewReservationNet,
  startFinalInspectionTransitionId,
} from "./prepared-crew-reservation-fixture";

import type { CrewReservationHistory } from "./crew-reservation-history";

export const crewReservationSettledManifestStorageKey =
  "brunch:prepared-fixture:crew-reservation-v1:settled";

declare const manifestValueBrand: unique symbol;
type ManifestValue<Kind extends string> = string & {
  readonly [manifestValueBrand]: Kind;
};

export type CanonicalConversationId = ManifestValue<"canonical-conversation">;
export type ConversationOffset = ManifestValue<"conversation-offset">;
export type FlueMessageId = ManifestValue<"flue-message">;
export type FlueSubmissionId = ManifestValue<"flue-submission">;
export type ManifestId = ManifestValue<"manifest">;
export type Sha256Digest = ManifestValue<"sha256">;

export const asCanonicalConversationId = (
  value: string,
): CanonicalConversationId => value as CanonicalConversationId;
export const asConversationOffset = (value: string): ConversationOffset =>
  value as ConversationOffset;
export const asFlueMessageId = (value: string): FlueMessageId =>
  value as FlueMessageId;
export const asFlueSubmissionId = (value: string): FlueSubmissionId =>
  value as FlueSubmissionId;
export const asManifestId = (value: string): ManifestId => value as ManifestId;
export const asSha256Digest = (value: string): Sha256Digest =>
  value as Sha256Digest;
export const sha256Digest = (value: string): Sha256Digest =>
  asSha256Digest(bytesToHex(sha256Bytes(new TextEncoder().encode(value))));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export interface CrewReservationSettledManifest {
  readonly conversation: {
    readonly canonicalId: CanonicalConversationId;
    readonly logicalId: typeof crewReservationConversationId;
    readonly offset: ConversationOffset;
  };
  readonly document: {
    readonly id: typeof crewReservationDocumentId;
    readonly sha256: Sha256Digest;
    readonly targetArc: "absent" | "present";
  };
  readonly fixtureId: typeof crewReservationFixtureId;
  readonly latestWorkpiece: {
    readonly authorship: "model-produced" | "test-authored";
    readonly contentSha256: Sha256Digest;
    readonly sourceKind: "assistant" | "prepared-signal";
    readonly sourceMessageId: FlueMessageId;
    readonly sourceMessageSha256: Sha256Digest;
    readonly sourceSubmissionId: FlueSubmissionId;
  };
  readonly manifestId: ManifestId;
  readonly revision: number;
  readonly settledAt: string;
  readonly version: 1;
}

const sha256Pattern = /^[0-9a-f]{64}$/u;

const isNonBlankString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

/**
 * Establishes trust in a manifest read from local storage. The literal
 * fixture identities and the content-addressed manifest id prevent a stale or
 * foreign fixture record from being treated as this fixture's settlement.
 */
export const parseCrewReservationSettledManifest = (
  value: unknown,
): CrewReservationSettledManifest | null => {
  if (!isRecord(value)) return null;
  const conversation = value.conversation;
  const latestWorkpiece = value.latestWorkpiece;
  const document = value.document;
  if (
    value.version !== 1 ||
    value.fixtureId !== crewReservationFixtureId ||
    !Number.isSafeInteger(value.revision) ||
    (value.revision as number) < 0 ||
    !isNonBlankString(value.settledAt) ||
    !isRecord(conversation) ||
    conversation.logicalId !== crewReservationConversationId ||
    !isNonBlankString(conversation.canonicalId) ||
    !isNonBlankString(conversation.offset) ||
    !isRecord(latestWorkpiece) ||
    (latestWorkpiece.authorship !== "model-produced" &&
      latestWorkpiece.authorship !== "test-authored") ||
    !isNonBlankString(latestWorkpiece.contentSha256) ||
    !sha256Pattern.test(latestWorkpiece.contentSha256) ||
    (latestWorkpiece.sourceKind !== "assistant" &&
      latestWorkpiece.sourceKind !== "prepared-signal") ||
    !isNonBlankString(latestWorkpiece.sourceMessageId) ||
    !isNonBlankString(latestWorkpiece.sourceMessageSha256) ||
    !sha256Pattern.test(latestWorkpiece.sourceMessageSha256) ||
    !isNonBlankString(latestWorkpiece.sourceSubmissionId) ||
    !isRecord(document) ||
    document.id !== crewReservationDocumentId ||
    !isNonBlankString(document.sha256) ||
    !sha256Pattern.test(document.sha256) ||
    (document.targetArc !== "absent" && document.targetArc !== "present") ||
    !isNonBlankString(value.manifestId)
  ) {
    return null;
  }
  const withoutId = {
    version: 1 as const,
    fixtureId: crewReservationFixtureId,
    revision: value.revision as number,
    settledAt: value.settledAt,
    conversation: {
      logicalId: crewReservationConversationId,
      canonicalId: asCanonicalConversationId(conversation.canonicalId),
      offset: asConversationOffset(conversation.offset),
    },
    latestWorkpiece: {
      authorship: latestWorkpiece.authorship,
      contentSha256: asSha256Digest(latestWorkpiece.contentSha256),
      sourceKind: latestWorkpiece.sourceKind,
      sourceMessageId: asFlueMessageId(latestWorkpiece.sourceMessageId),
      sourceMessageSha256: asSha256Digest(latestWorkpiece.sourceMessageSha256),
      sourceSubmissionId: asFlueSubmissionId(
        latestWorkpiece.sourceSubmissionId,
      ),
    },
    document: {
      id: crewReservationDocumentId,
      sha256: asSha256Digest(document.sha256),
      targetArc: document.targetArc,
    },
  } satisfies Omit<CrewReservationSettledManifest, "manifestId">;
  const expectedManifestId = sha256Digest(JSON.stringify(withoutId));
  if (value.manifestId !== expectedManifestId) return null;
  return {
    ...withoutId,
    manifestId: asManifestId(value.manifestId),
  };
};

export type CrewReservationSettlementResult =
  | {
      readonly manifest: CrewReservationSettledManifest;
      readonly status: "settled";
    }
  | {
      readonly reason:
        | "bundle-mismatch"
        | "conversation-mismatch"
        | "missing-correlated-mutation"
        | "missing-completed-settlement"
        | "missing-workpiece";
      readonly status: "refused";
    };

const targetMutationCallIds = (
  history: CrewReservationHistory,
): readonly string[] => {
  const { calls } = clientToolHistoryFrom(history.messages);
  return calls.flatMap(({ input, toolCallId, toolName }) => {
    if (toolName !== "addArc") return [];
    const normalizedInput = normalizePetrinautAiToolInput("addArc", input);
    return isRecord(normalizedInput) &&
      normalizedInput.transitionId === startFinalInspectionTransitionId &&
      normalizedInput.arcDirection === "input" &&
      normalizedInput.placeId === dispatchCrewPlaceId &&
      normalizedInput.weight === 1
      ? [toolCallId]
      : [];
  });
};

const successfulMutationResultIds = (
  history: CrewReservationHistory,
): readonly string[] => {
  const { results } = clientToolHistoryFrom(history.messages);
  return results.flatMap(({ output, toolCallId, toolName }) =>
    toolName === "addArc" &&
    typeof output === "object" &&
    output !== null &&
    "applied" in output &&
    output.applied === true
      ? [toolCallId]
      : [],
  );
};

const hasOneCorrelatedTargetMutation = (
  history: CrewReservationHistory,
): boolean => {
  const successfulResultIds = new Set(successfulMutationResultIds(history));
  const correlatedTargetCallIds = new Set(
    targetMutationCallIds(history).filter((toolCallId) =>
      successfulResultIds.has(toolCallId),
    ),
  );
  return correlatedTargetCallIds.size === 1;
};

export const hasCrewReservationTargetArc = (definition: SDCPN): boolean => {
  const transition = definition.transitions.find(
    ({ id }) => id === startFinalInspectionTransitionId,
  );
  return (
    transition?.inputArcs.some(
      (arc) =>
        arc.placeId === dispatchCrewPlaceId &&
        arc.type === "standard" &&
        arc.weight === 1,
    ) ?? false
  );
};

const preparedCrewReservationNetWithTargetArc = (): SDCPN => {
  const definition = structuredClone(preparedCrewReservationNet);
  const transition = definition.transitions.find(
    ({ id }) => id === startFinalInspectionTransitionId,
  );
  if (transition === undefined) {
    throw new Error("The prepared fixture has no start-inspection transition.");
  }
  transition.inputArcs.push({
    placeId: dispatchCrewPlaceId,
    type: "standard",
    weight: 1,
  });
  return definition;
};

export const settleCrewReservationManifest = async (input: {
  readonly definition: SDCPN;
  readonly history: CrewReservationHistory;
  readonly previous?: CrewReservationSettledManifest;
  readonly settledAt: string;
}): Promise<CrewReservationSettlementResult> => {
  if (
    input.previous !== undefined &&
    input.previous.conversation.canonicalId !== input.history.conversationId
  ) {
    return { status: "refused", reason: "conversation-mismatch" };
  }

  const workpiece = selectRunbookWorkpiece(input.history);
  if (workpiece === undefined || workpiece.sourceSubmissionId === undefined) {
    return { status: "refused", reason: "missing-workpiece" };
  }
  const sourceSettlement = input.history.settlements.find(
    ({ submissionId }) => submissionId === workpiece.sourceSubmissionId,
  );
  if (sourceSettlement?.outcome !== "completed") {
    return {
      status: "refused",
      reason: "missing-completed-settlement",
    };
  }
  const targetArcPresent = hasCrewReservationTargetArc(input.definition);
  if (
    workpiece.authorship === "model-produced" &&
    (!targetArcPresent ||
      !isSDCPNEqual(
        input.definition,
        preparedCrewReservationNetWithTargetArc(),
      ) ||
      !hasOneCorrelatedTargetMutation(input.history))
  ) {
    return {
      status: "refused",
      reason: "missing-correlated-mutation",
    };
  }

  const contentSha256 = sha256Digest(workpiece.content);
  const documentSha256 = sha256Digest(JSON.stringify(input.definition));
  const sourceMessageSha256 = sha256Digest(
    JSON.stringify(workpiece.sourceMessage),
  );
  if (workpiece.authorship === "test-authored") {
    const preparedDocumentSha256 = sha256Digest(
      JSON.stringify(preparedCrewReservationNet),
    );
    if (
      targetArcPresent ||
      documentSha256 !== preparedDocumentSha256 ||
      !isSDCPNEqual(input.definition, preparedCrewReservationNet)
    ) {
      return { status: "refused", reason: "bundle-mismatch" };
    }
  }
  if (
    input.previous?.latestWorkpiece.sourceMessageId ===
    workpiece.sourceMessageId
  ) {
    if (
      input.previous.document.sha256 !== documentSha256 ||
      input.previous.latestWorkpiece.sourceMessageSha256 !==
        sourceMessageSha256 ||
      input.previous.latestWorkpiece.contentSha256 !== contentSha256
    ) {
      return { status: "refused", reason: "bundle-mismatch" };
    }
    return { status: "settled", manifest: input.previous };
  }
  const withoutId = {
    version: 1 as const,
    fixtureId: crewReservationFixtureId,
    // Numbered by the history, not by how many manifests this browser has
    // settled: a model revision that settles before the prepared bundle did
    // must not be labelled the test-authored revision zero.
    revision: workpiece.revision,
    settledAt: input.settledAt,
    conversation: {
      logicalId: crewReservationConversationId,
      canonicalId: asCanonicalConversationId(input.history.conversationId),
      offset: asConversationOffset(input.history.offset),
    },
    latestWorkpiece: {
      authorship: workpiece.authorship,
      contentSha256,
      sourceKind: workpiece.sourceKind,
      sourceMessageId: asFlueMessageId(workpiece.sourceMessageId),
      sourceMessageSha256,
      sourceSubmissionId: asFlueSubmissionId(workpiece.sourceSubmissionId),
    },
    document: {
      id: crewReservationDocumentId,
      sha256: documentSha256,
      targetArc: targetArcPresent ? ("present" as const) : ("absent" as const),
    },
  } satisfies Omit<CrewReservationSettledManifest, "manifestId">;

  return {
    status: "settled",
    manifest: {
      ...withoutId,
      manifestId: asManifestId(sha256Digest(JSON.stringify(withoutId))),
    },
  };
};
