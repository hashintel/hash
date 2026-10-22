// @vitest-environment jsdom
import { MockedProvider } from "@apollo/client/testing";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getFlowRunEventsQuery } from "@local/hash-isomorphic-utils/graphql/queries/flow.queries";

import { useFlowRunEvents } from "./use-flow-run-events";

import type { MockedResponse } from "@apollo/client/testing";
import type { EntityId } from "@blockprotocol/type-system";
import type { ReactNode } from "react";

const flowRunEntityId = "web~run" as EntityId;

const eventsPage = ({
  after,
  events,
  endCursor,
}: {
  after: string | null;
  events: object[];
  endCursor: string | null;
}): MockedResponse => ({
  request: {
    query: getFlowRunEventsQuery,
    variables: { flowRunEntityId, after, first: 2_000 },
  },
  result: {
    data: {
      getFlowRunById: {
        flowRunEntityId,
        events: {
          endCursor,
          hasNextPage: false,
          runId: "run",
          restarted: false,
          keptUpTo: null,
          events,
        },
      },
    },
  },
});

const runStartedEvent = {
  __typename: "FlowRunStartedEvent",
  position: "1.0",
  occurredAt: "2026-10-22T10:00:00.000Z",
  flowInputs: {},
};

const renderWithMocks = (mocks: MockedResponse[]) =>
  renderHook(() => useFlowRunEvents({ flowRunEntityId, live: true }), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <MockedProvider mocks={mocks} addTypename={false}>
        {children}
      </MockedProvider>
    ),
  });

describe("useFlowRunEvents", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the events it has and checks again after a check fails", async () => {
    const { result, unmount } = renderWithMocks([
      eventsPage({ after: null, events: [runStartedEvent], endCursor: "1.0" }),
      {
        request: eventsPage({ after: "1.0", events: [], endCursor: null })
          .request,
        error: new Error("Network down"),
      },
      eventsPage({ after: "1.0", events: [], endCursor: null }),
    ]);

    await waitFor(() => expect(result.current.status).toBe("loaded"));

    await act(() => vi.advanceTimersByTimeAsync(2_000));

    await waitFor(() =>
      expect(result.current).toMatchObject({
        status: "loaded",
        events: [expect.objectContaining({ kind: "runStarted" })],
        checkFailure: "Network down",
      }),
    );

    await act(() => vi.advanceTimersByTimeAsync(2_000));

    await waitFor(() =>
      expect(result.current).not.toHaveProperty("checkFailure"),
    );
    expect(result.current).toMatchObject({
      status: "loaded",
      events: [expect.objectContaining({ kind: "runStarted" })],
    });

    unmount();
  });

  it("tries again when its first read fails", async () => {
    const { result, unmount } = renderWithMocks([
      {
        request: eventsPage({ after: null, events: [], endCursor: null })
          .request,
        error: new Error("Network down"),
      },
      eventsPage({ after: null, events: [runStartedEvent], endCursor: "1.0" }),
    ]);

    await waitFor(() =>
      expect(result.current).toEqual({
        status: "failed",
        message: "Network down",
      }),
    );

    await act(() => vi.advanceTimersByTimeAsync(2_000));

    await waitFor(() => expect(result.current.status).toBe("loaded"));

    unmount();
  });
});
