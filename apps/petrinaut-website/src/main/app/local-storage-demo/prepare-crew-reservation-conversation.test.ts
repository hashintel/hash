import { describe, expect, test, vi } from "vitest";

import {
  preparedWorkpieceInitialDataMode,
  preparedWorkpieceSignalTag,
} from "@hashintel/brunch-agent/workpiece";

import { prepareCrewReservationConversation } from "./prepare-crew-reservation-conversation";
import {
  crewReservationFixtureId,
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
        tagName: preparedWorkpieceSignalTag,
        attributes: {
          fixtureId: crewReservationFixtureId,
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
      initialData: { mode: preparedWorkpieceInitialDataMode },
      ...preparedCrewReservationDelivery,
    });
    expect(wait).toHaveBeenCalledWith(admission);
    expect(history).toHaveBeenCalledTimes(2);
  });

  test("pins the issued incarnation and base in initial data and refuses reuse under a changed binding", async () => {
    const browser = {
      binding: {
        conversationId: "root-arc:incarnation",
        documentId: "tracer-document",
        incarnationId: "incarnation",
      },
      requestedBaseHash: "a".repeat(64),
    };
    const historyValue = {
      ...preparedHistory,
      messages: preparedHistory.messages.map((message) => ({
        ...message,
        signal: {
          ...message.signal,
          attributes: {
            ...message.signal.attributes,
            rootArcContext: JSON.stringify(browser),
          },
        },
      })),
    };
    const history = vi
      .fn()
      .mockRejectedValueOnce({ status: 404 })
      .mockResolvedValue(historyValue);
    const send = vi
      .fn()
      .mockResolvedValue({ submissionId: "prepare-submission" });
    const wait = vi.fn().mockResolvedValue(undefined);
    await expect(
      prepareCrewReservationConversation({ history, send, wait }, browser),
    ).resolves.toEqual(historyValue);
    expect(send).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        initialData: { mode: preparedWorkpieceInitialDataMode, browser },
      }),
    );
    await expect(
      prepareCrewReservationConversation({ history, send, wait }, browser),
    ).resolves.toEqual(historyValue);
    for (const changed of [
      { ...browser, requestedBaseHash: "b".repeat(64) },
      { ...browser, binding: { ...browser.binding, incarnationId: "another" } },
      {
        ...browser,
        binding: { ...browser.binding, conversationId: "another" },
      },
    ]) {
      await expect(
        prepareCrewReservationConversation({ history, send, wait }, changed),
      ).rejects.toThrow(/incarnation or issued base/u);
    }
    expect(send).toHaveBeenCalledTimes(1);
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
