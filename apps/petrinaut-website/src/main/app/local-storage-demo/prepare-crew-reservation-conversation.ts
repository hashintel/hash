import {
  PREPARED_WORKPIECE_INITIAL_DATA_MODE,
  selectRunbookWorkpiece,
  type WorkpieceHistory,
} from "@hashintel/brunch-agent/workpiece";

import {
  CREW_RESERVATION_FIXTURE_ID,
  preparedCrewReservationDelivery,
} from "./prepared-crew-reservation-fixture";

import type { AgentSendResult } from "@flue/sdk";

export type PreparedCrewReservationHistory = WorkpieceHistory & {
  readonly offset: string;
  readonly settlements: readonly {
    readonly outcome: string;
    readonly submissionId: string;
  }[];
};

export interface PreparedFixtureConversationClient {
  readonly history: () => Promise<PreparedCrewReservationHistory>;
  readonly send: (input: {
    readonly idempotencyKey: string;
    readonly initialData: {
      readonly mode: typeof PREPARED_WORKPIECE_INITIAL_DATA_MODE;
    };
    readonly message: typeof preparedCrewReservationDelivery.message;
    readonly uid: null;
  }) => Promise<AgentSendResult>;
  readonly wait: (admission: AgentSendResult) => Promise<unknown>;
}

const isNotFound = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "status" in error &&
  error.status === 404;

const assertPreparedFixtureHistory = (
  history: PreparedCrewReservationHistory,
): PreparedCrewReservationHistory => {
  const currentWorkpiece = selectRunbookWorkpiece(history);
  if (
    currentWorkpiece?.sourceKind !== "prepared-signal" &&
    currentWorkpiece?.sourceKind !== "assistant"
  ) {
    throw new Error(
      "The prepared fixture conversation has no recoverable workpiece.",
    );
  }
  const preparedSource = history.messages.find(
    (message) =>
      message.signal?.tagName ===
      preparedCrewReservationDelivery.message.tagName,
  );
  if (
    preparedSource?.signal?.attributes?.fixtureId !==
    CREW_RESERVATION_FIXTURE_ID
  ) {
    throw new Error(
      "The prepared fixture conversation belongs to a different fixture.",
    );
  }
  return history;
};

/**
 * Create revision zero through Flue's public signal delivery, or recover the
 * already-created append-only conversation. Concurrent tabs converge through
 * the delivery's deterministic idempotency key.
 */
export const prepareCrewReservationConversation = async (
  client: PreparedFixtureConversationClient,
): Promise<PreparedCrewReservationHistory> => {
  try {
    return assertPreparedFixtureHistory(await client.history());
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }

  const admission = await client.send({
    uid: null,
    initialData: { mode: PREPARED_WORKPIECE_INITIAL_DATA_MODE },
    ...preparedCrewReservationDelivery,
  });
  await client.wait(admission);
  return assertPreparedFixtureHistory(await client.history());
};
