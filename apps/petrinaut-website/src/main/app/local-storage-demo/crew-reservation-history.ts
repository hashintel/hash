import type { FlueConversationSnapshot } from "@flue/sdk";
import type { WorkpieceHistory } from "@hashintel/brunch-agent/workpiece";

/**
 * Canonical Flue history plus the durable offset observed by the browser.
 * Preparation and settlement share this read-only projection of the snapshot
 * rather than independently extending the workpiece projection; it remains a
 * `WorkpieceHistory` for core's substrate-neutral selection.
 */
export type CrewReservationHistory = {
  readonly [Key in
    | "conversationId"
    | "messages"
    | "offset"
    | "settlements"]: Readonly<FlueConversationSnapshot[Key]>;
};

const _crewReservationHistoryIsWorkpieceHistory = (
  history: CrewReservationHistory,
): WorkpieceHistory => history;
