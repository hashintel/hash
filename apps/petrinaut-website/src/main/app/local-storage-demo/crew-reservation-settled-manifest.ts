import {
  selectRunbookWorkpiece,
  type WorkpieceHistory,
} from "@hashintel/brunch-agent/workpiece";
import { isSDCPNEqual, type SDCPN } from "@hashintel/petrinaut-core";

import {
  CREW_RESERVATION_CONVERSATION_ID,
  CREW_RESERVATION_DOCUMENT_ID,
  CREW_RESERVATION_FIXTURE_ID,
  DISPATCH_CREW_PLACE_ID,
  preparedCrewReservationNet,
  START_FINAL_INSPECTION_TRANSITION_ID,
} from "./prepared-crew-reservation-fixture";

export const CREW_RESERVATION_SETTLED_MANIFEST_STORAGE_KEY =
  "brunch:prepared-fixture:crew-reservation-v1:settled";

export interface CrewReservationSettledManifest {
  readonly conversation: {
    readonly canonicalId: string;
    readonly logicalId: typeof CREW_RESERVATION_CONVERSATION_ID;
    readonly offset: string;
  };
  readonly document: {
    readonly id: typeof CREW_RESERVATION_DOCUMENT_ID;
    readonly sha256: string;
    readonly targetArc: "absent" | "present";
  };
  readonly fixtureId: typeof CREW_RESERVATION_FIXTURE_ID;
  readonly latestWorkpiece: {
    readonly authorship: "model-produced" | "test-authored";
    readonly contentSha256: string;
    readonly sourceKind: "assistant" | "prepared-signal";
    readonly sourceMessageId: string;
    readonly sourceMessageSha256: string;
    readonly sourceSubmissionId: string;
  };
  readonly manifestId: string;
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

export type CrewReservationSettledHistory = WorkpieceHistory & {
  readonly offset: string;
  readonly settlements: readonly {
    readonly outcome: string;
    readonly submissionId: string;
  }[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const targetMutationCallIds = (
  history: CrewReservationSettledHistory,
): readonly string[] =>
  history.messages.flatMap((message) =>
    message.parts.flatMap((part) => {
      if (
        !isRecord(part) ||
        part.type !== "dynamic-tool" ||
        part.toolName !== "addArc" ||
        typeof part.toolCallId !== "string" ||
        !isRecord(part.input) ||
        part.input.transitionId !== START_FINAL_INSPECTION_TRANSITION_ID ||
        part.input.arcDirection !== "input" ||
        part.input.placeId !== DISPATCH_CREW_PLACE_ID ||
        part.input.weight !== 1
      ) {
        return [];
      }
      return [part.toolCallId];
    }),
  );

const successfulMutationResultIds = (
  history: CrewReservationSettledHistory,
): readonly string[] =>
  history.messages.flatMap((message) => {
    if (
      message.signal?.tagName !== "client-tool-result" &&
      message.signal?.type !== "client-tool-result"
    ) {
      return [];
    }
    const body = message.parts
      .flatMap((part) =>
        part.type === "text" && typeof part.text === "string"
          ? [part.text]
          : [],
      )
      .join("");
    try {
      const results: unknown = JSON.parse(body);
      if (!Array.isArray(results)) return [];
      return results.flatMap((result) => {
        if (
          !isRecord(result) ||
          result.toolName !== "addArc" ||
          typeof result.toolCallId !== "string" ||
          !isRecord(result.output) ||
          result.output.applied !== true
        ) {
          return [];
        }
        return [result.toolCallId];
      });
    } catch {
      return [];
    }
  });

const hasOneCorrelatedTargetMutation = (
  history: CrewReservationSettledHistory,
): boolean => {
  const targetCallIds = targetMutationCallIds(history);
  const successfulResultIds = successfulMutationResultIds(history);
  return (
    targetCallIds.length === 1 &&
    successfulResultIds.length === 1 &&
    targetCallIds[0] === successfulResultIds[0]
  );
};

const sha256 = async (value: string): Promise<string> => {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

export const hasCrewReservationTargetArc = (definition: SDCPN): boolean => {
  const transition = definition.transitions.find(
    ({ id }) => id === START_FINAL_INSPECTION_TRANSITION_ID,
  );
  return (
    transition?.inputArcs.some(
      (arc) =>
        arc.placeId === DISPATCH_CREW_PLACE_ID &&
        arc.type === "standard" &&
        arc.weight === 1,
    ) ?? false
  );
};

const preparedCrewReservationNetWithTargetArc = (): SDCPN => {
  const definition = structuredClone(preparedCrewReservationNet);
  const transition = definition.transitions.find(
    ({ id }) => id === START_FINAL_INSPECTION_TRANSITION_ID,
  );
  if (transition === undefined) {
    throw new Error("The prepared fixture has no start-inspection transition.");
  }
  transition.inputArcs.push({
    placeId: DISPATCH_CREW_PLACE_ID,
    type: "standard",
    weight: 1,
  });
  return definition;
};

export const settleCrewReservationManifest = async (input: {
  readonly definition: SDCPN;
  readonly history: CrewReservationSettledHistory;
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
    fixtureId: CREW_RESERVATION_FIXTURE_ID,
    revision,
    settledAt: input.settledAt,
    conversation: {
      logicalId: CREW_RESERVATION_CONVERSATION_ID,
      canonicalId: input.history.conversationId,
      offset: input.history.offset,
    },
    latestWorkpiece: {
      authorship: workpiece.authorship,
      contentSha256,
      sourceKind: workpiece.sourceKind,
      sourceMessageId: workpiece.sourceMessageId,
      sourceMessageSha256,
      sourceSubmissionId: workpiece.sourceSubmissionId,
    },
    document: {
      id: CREW_RESERVATION_DOCUMENT_ID,
      sha256: documentSha256,
      targetArc: targetArcPresent ? ("present" as const) : ("absent" as const),
    },
  } satisfies Omit<CrewReservationSettledManifest, "manifestId">;

  return {
    status: "settled",
    manifest: {
      ...withoutId,
      manifestId: await sha256(JSON.stringify(withoutId)),
    },
  };
};
