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

const sha256 = async (value: string): Promise<Sha256Digest> => {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return asSha256Digest(
    [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join(""),
  );
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

  const [contentSha256, documentSha256, sourceMessageSha256] =
    await Promise.all([
      sha256(workpiece.content),
      sha256(JSON.stringify(input.definition)),
      sha256(JSON.stringify(workpiece.sourceMessage)),
    ]);
  if (workpiece.authorship === "test-authored") {
    const preparedDocumentSha256 = await sha256(
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
  const revision = (input.previous?.revision ?? -1) + 1;
  const withoutId = {
    version: 1 as const,
    fixtureId: crewReservationFixtureId,
    revision,
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
      manifestId: asManifestId(await sha256(JSON.stringify(withoutId))),
    },
  };
};
