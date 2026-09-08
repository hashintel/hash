import {
  preparedWorkpieceInitialDataMode,
  selectRunbookWorkpiece,
} from "@hashintel/brunch-agent/workpiece";

import {
  crewReservationFixtureId,
  preparedCrewReservationDelivery,
} from "./prepared-crew-reservation-fixture";

import type { CrewReservationHistory } from "./crew-reservation-history";
import type { AgentSendResult } from "@flue/sdk";

export interface PreparedFixtureConversationClient {
  readonly history: () => Promise<CrewReservationHistory>;
  readonly send: (input: {
    readonly idempotencyKey: string;
    readonly initialData: {
      readonly mode: typeof preparedWorkpieceInitialDataMode;
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
  history: CrewReservationHistory,
): CrewReservationHistory => {
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
    preparedSource?.signal?.attributes?.fixtureId !== crewReservationFixtureId
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
): Promise<CrewReservationHistory> => {
  try {
    return assertPreparedFixtureHistory(await client.history());
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }

  const admission = await client.send({
    uid: null,
    initialData: { mode: preparedWorkpieceInitialDataMode },
    ...preparedCrewReservationDelivery,
  });
  await client.wait(admission);
  return assertPreparedFixtureHistory(await client.history());
};
