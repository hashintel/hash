import type { WorkpieceHistory } from "@hashintel/brunch-agent/workpiece";

/**
 * Canonical Flue history plus the durable offset observed by the browser.
 * Preparation and settlement share this shape rather than independently
 * extending the workpiece projection.
 */
export type CrewReservationHistory = WorkpieceHistory & {
  readonly offset: string;
  readonly settlements: readonly {
    readonly outcome: string;
    readonly submissionId: string;
  }[];
};
