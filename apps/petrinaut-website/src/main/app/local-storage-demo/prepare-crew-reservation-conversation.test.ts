import { describe, expect, test, vi } from "vitest";

import {
  PREPARED_WORKPIECE_INITIAL_DATA_MODE,
  PREPARED_WORKPIECE_SIGNAL_TAG,
} from "@hashintel/brunch-agent/workpiece";

import { prepareCrewReservationConversation } from "./prepare-crew-reservation-conversation";
import {
  CREW_RESERVATION_FIXTURE_ID,
  preparedCrewReservationDelivery,
  preparedCrewReservationWorkpiece,
} from "./prepared-crew-reservation-fixture";

const preparedHistory = {
  conversationId: "canonical-conversation",
  offset: "2",
  settlements: [{ submissionId: "prepare-submission", outcome: "completed" }],
  messages: [
    {
      id: "prepared-message",
      role: "system",
      purpose: "dispatch",
      submissionId: "prepare-submission",
      signal: {
        tagName: PREPARED_WORKPIECE_SIGNAL_TAG,
        attributes: {
          fixtureId: CREW_RESERVATION_FIXTURE_ID,
          authorship: "test-authored",
          claimBoundary: "prepared-not-model-produced",
        },
      },
      parts: [{ type: "text", text: preparedCrewReservationWorkpiece }],
    },
  ],
};

describe("prepareCrewReservationConversation", () => {
  test("recovers an existing prepared conversation without resubmitting", async () => {
    const send = vi.fn();
    const wait = vi.fn();

    await expect(
      prepareCrewReservationConversation({
        history: vi.fn().mockResolvedValue(preparedHistory),
        send,
        wait,
      }),
    ).resolves.toEqual(preparedHistory);
    expect(send).not.toHaveBeenCalled();
    expect(wait).not.toHaveBeenCalled();
  });

  test("creates revision zero once through the tagged signal delivery", async () => {
    const history = vi
      .fn()
      .mockRejectedValueOnce({ status: 404 })
      .mockResolvedValueOnce(preparedHistory);
    const admission = { submissionId: "prepare-submission" };
    const send = vi.fn().mockResolvedValue(admission);
    const wait = vi.fn().mockResolvedValue(undefined);

    await expect(
      prepareCrewReservationConversation({ history, send, wait }),
    ).resolves.toEqual(preparedHistory);
    expect(send).toHaveBeenCalledWith({
      uid: null,
      initialData: { mode: PREPARED_WORKPIECE_INITIAL_DATA_MODE },
      ...preparedCrewReservationDelivery,
    });
    expect(wait).toHaveBeenCalledWith(admission);
    expect(history).toHaveBeenCalledTimes(2);
  });

  test("refuses an existing conversation without this fixture source", async () => {
    await expect(
      prepareCrewReservationConversation({
        history: vi.fn().mockResolvedValue({
          ...preparedHistory,
          messages: [],
        }),
        send: vi.fn(),
        wait: vi.fn(),
      }),
    ).rejects.toThrow(/no recoverable workpiece/u);
  });
});
