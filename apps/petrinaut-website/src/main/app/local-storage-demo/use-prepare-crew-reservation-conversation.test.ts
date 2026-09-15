/**
 * @vitest-environment jsdom
 */
import { act, render, renderHook, waitFor } from "@testing-library/react";
import { createElement, Suspense } from "react";
import { expect, test, vi } from "vitest";

import {
  selectCrewReservationPreparationBrowser,
  usePrepareCrewReservationConversation,
} from "./use-prepare-crew-reservation-conversation";

import type { FlueClient } from "@flue/sdk";

test("does not prepare a conversation for an abandoned render", async () => {
  const history = vi.fn().mockResolvedValue({ messages: [] });
  const client = { history } as unknown as FlueClient;
  const never = new Promise<void>(() => {});
  const Probe = () => {
    usePrepareCrewReservationConversation(Promise.resolve(client), true);
    throw never;
  };

  render(createElement(Suspense, { fallback: null }, createElement(Probe)));
  await act(async () => {
    await Promise.resolve();
  });

  expect(history).not.toHaveBeenCalled();
});

test("keeps ordinary batched construction off the prepared-fixture dispatch", () => {
  const tracerBrowser = {
    binding: "fixture",
    requestedBaseHash: "abc",
  };

  expect(
    selectCrewReservationPreparationBrowser(true, {
      requestedBaseHash: "abc",
    }),
  ).toBeUndefined();
  expect(
    selectCrewReservationPreparationBrowser(true, undefined),
  ).toBeUndefined();
  expect(selectCrewReservationPreparationBrowser(false, tracerBrowser)).toBe(
    tracerBrowser,
  );
  expect(
    selectCrewReservationPreparationBrowser(false, { construction: true }),
  ).toBeUndefined();
  expect(
    selectCrewReservationPreparationBrowser(false, undefined),
  ).toBeUndefined();
});

test("reports preparation failure without rejecting the shared client", async () => {
  const client = {
    history: vi.fn().mockRejectedValue({ status: 404 }),
    send: vi.fn().mockResolvedValue({ submissionId: "preparation" }),
    wait: vi
      .fn()
      .mockRejectedValue(new Error("Provider authentication failed")),
  } as unknown as FlueClient;
  const clientPromise = Promise.resolve(client);

  const { result } = renderHook(() =>
    usePrepareCrewReservationConversation(clientPromise, true),
  );

  await waitFor(() => expect(result.current.status.state).toBe("failed"));
  expect(result.current.status).toEqual({
    state: "failed",
    error: "Provider authentication failed",
  });
  await expect(clientPromise).resolves.toBe(client);
  await expect(result.current.clientPromise).rejects.toThrow(
    "Provider authentication failed",
  );
});
