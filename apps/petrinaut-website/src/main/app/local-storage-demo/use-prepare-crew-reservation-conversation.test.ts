/**
 * @vitest-environment jsdom
 */
import { renderHook, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import { usePrepareCrewReservationConversation } from "./use-prepare-crew-reservation-conversation";

import type { FlueClient } from "@flue/sdk";

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
