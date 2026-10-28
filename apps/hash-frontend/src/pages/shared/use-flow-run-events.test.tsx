// @vitest-environment jsdom
import { ApolloClient } from "@apollo/client";
import { MockedProvider } from "@apollo/client/testing";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getFlowRunEventsQuery } from "@local/hash-isomorphic-utils/graphql/queries/flow.queries";

import { FlowRunStatus } from "../../graphql/api-types.gen";
import { useFlowRunEvents } from "./use-flow-run-events";

import type { MockedResponse } from "@apollo/client/testing";
import type { EntityId } from "@blockprotocol/type-system";
import type { FlowRunEvent } from "@local/hash-isomorphic-utils/flows/run-events";
import type { ReactNode } from "react";

const flowRunEntityId = "web~run" as EntityId;

const eventsPage = ({
  after,
  events,
  endCursor,
  hasNextPage = false,
  runId = "run",
  restarted = false,
  keptUpTo = null,
}: {
  after: string | null;
  events: FlowRunEvent[];
  endCursor: string | null;
  hasNextPage?: boolean;
  runId?: string;
  restarted?: boolean;
  keptUpTo?: string | null;
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
          hasNextPage,
          runId,
          restarted,
          keptUpTo,
          events,
        },
      },
    },
  },
});

const runStartedEvent: FlowRunEvent = {
  kind: "runStarted",
  position: "1.0",
  occurredAt: "2026-10-22T10:00:00.000Z",
  flowInputs: {},
};

const runFinishedEvent: FlowRunEvent = {
  kind: "runFinished",
  position: "2.0",
  occurredAt: "2026-10-22T10:01:00.000Z",
  status: FlowRunStatus.Completed,
};

const stepStartedEvent = (position: string): FlowRunEvent => ({
  kind: "stepStarted",
  position,
  occurredAt: "2026-10-22T10:00:30.000Z",
  stepRun: { stepId: "research", itemPath: [] },
  stepType: "researchEntities",
  inputs: [],
});

const renderWithMocks = (mocks: MockedResponse[]) =>
  renderHook(({ live }) => useFlowRunEvents({ flowRunEntityId, live }), {
    initialProps: { live: true },
    wrapper: ({ children }: { children: ReactNode }) => (
      <MockedProvider mocks={mocks} addTypename={false}>
        {children}
      </MockedProvider>
    ),
  });

const loadedEvents = (result: ReturnType<typeof useFlowRunEvents>) =>
  result.status === "loaded" ? result.events : null;

describe("useFlowRunEvents", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads nothing without a run", async () => {
    const query = vi.spyOn(ApolloClient.prototype, "query");
    const { result, unmount } = renderHook(
      () => useFlowRunEvents({ flowRunEntityId: null, live: true }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <MockedProvider mocks={[]} addTypename={false}>
            {children}
          </MockedProvider>
        ),
      },
    );

    await act(() => vi.advanceTimersByTimeAsync(4_000));

    expect(result.current).toEqual({ status: "loading" });
    expect(query).not.toHaveBeenCalled();

    query.mockRestore();
    unmount();
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

  it("keeps the same events when a check finds nothing new", async () => {
    const { result, unmount } = renderWithMocks([
      eventsPage({ after: null, events: [runStartedEvent], endCursor: "1.0" }),
      eventsPage({ after: "1.0", events: [], endCursor: null }),
      eventsPage({
        after: "1.0",
        events: [runFinishedEvent],
        endCursor: "2.0",
      }),
    ]);

    await waitFor(() => expect(result.current.status).toBe("loaded"));
    const firstEvents = loadedEvents(result.current);

    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(loadedEvents(result.current)).toBe(firstEvents);

    await act(() => vi.advanceTimersByTimeAsync(2_000));
    await waitFor(() => expect(loadedEvents(result.current)).toHaveLength(2));

    unmount();
  });

  it("drops the events a reset undid, and keeps the ones before it", async () => {
    const { result, unmount } = renderWithMocks([
      eventsPage({
        after: null,
        events: [runStartedEvent, stepStartedEvent("2.0")],
        endCursor: "2.0",
      }),
      eventsPage({
        after: "2.0",
        events: [stepStartedEvent("5.0")],
        endCursor: "5.0",
        runId: "reset-run",
        restarted: true,
        keptUpTo: "1.0",
      }),
    ]);

    await waitFor(() => expect(loadedEvents(result.current)).toHaveLength(2));

    await act(() => vi.advanceTimersByTimeAsync(2_000));

    await waitFor(() =>
      expect(result.current).toEqual({
        status: "loaded",
        runId: "reset-run",
        events: [runStartedEvent, stepStartedEvent("5.0")],
      }),
    );

    unmount();
  });

  it("starts again from the first event when a reset kept none", async () => {
    const { result, unmount } = renderWithMocks([
      eventsPage({
        after: null,
        events: [runStartedEvent, stepStartedEvent("2.0")],
        endCursor: "2.0",
      }),
      eventsPage({
        after: "2.0",
        events: [runStartedEvent],
        endCursor: "1.0",
        runId: "reset-run",
        restarted: true,
      }),
    ]);

    await waitFor(() => expect(loadedEvents(result.current)).toHaveLength(2));

    await act(() => vi.advanceTimersByTimeAsync(2_000));

    await waitFor(() =>
      expect(result.current).toEqual({
        status: "loaded",
        runId: "reset-run",
        events: [runStartedEvent],
      }),
    );

    unmount();
  });

  it("reads again from the start when it doesn't have the event a reset kept up to", async () => {
    const { result, unmount } = renderWithMocks([
      eventsPage({
        after: null,
        events: [runStartedEvent, stepStartedEvent("2.0")],
        endCursor: "2.0",
      }),
      eventsPage({
        after: "2.0",
        events: [stepStartedEvent("5.0")],
        endCursor: "5.0",
        runId: "reset-run",
        restarted: true,
        keptUpTo: "1.5",
      }),
      eventsPage({
        after: null,
        events: [runStartedEvent, stepStartedEvent("5.0")],
        endCursor: "5.0",
        runId: "reset-run",
      }),
    ]);

    await waitFor(() => expect(loadedEvents(result.current)).toHaveLength(2));

    await act(() => vi.advanceTimersByTimeAsync(2_000));

    await waitFor(() =>
      expect(result.current).toEqual({
        status: "loaded",
        runId: "reset-run",
        events: [runStartedEvent, stepStartedEvent("5.0")],
      }),
    );

    unmount();
  });

  it("drops events only on a reset's first page", async () => {
    const { result, unmount } = renderWithMocks([
      eventsPage({
        after: null,
        events: [runStartedEvent, stepStartedEvent("2.0")],
        endCursor: "2.0",
      }),
      eventsPage({
        after: "2.0",
        events: [stepStartedEvent("5.0")],
        endCursor: "5.0",
        hasNextPage: true,
        runId: "reset-run",
        restarted: true,
        keptUpTo: "1.0",
      }),
      eventsPage({
        after: "5.0",
        events: [runFinishedEvent],
        endCursor: "6.0",
        runId: "reset-run",
      }),
    ]);

    await waitFor(() => expect(loadedEvents(result.current)).toHaveLength(2));

    await act(() => vi.advanceTimersByTimeAsync(2_000));

    await waitFor(() =>
      expect(loadedEvents(result.current)).toEqual([
        runStartedEvent,
        stepStartedEvent("5.0"),
        runFinishedEvent,
      ]),
    );

    unmount();
  });

  it("reads on from where it was when the run stops being live", async () => {
    /* There is no second read from the start, which would fail as unmocked. */
    const { result, rerender, unmount } = renderWithMocks([
      eventsPage({ after: null, events: [runStartedEvent], endCursor: "1.0" }),
      eventsPage({
        after: "1.0",
        events: [runFinishedEvent],
        endCursor: "2.0",
      }),
    ]);

    await waitFor(() => expect(result.current.status).toBe("loaded"));

    rerender({ live: false });

    await waitFor(() =>
      expect(result.current).toEqual({
        status: "loaded",
        runId: "run",
        events: [runStartedEvent, runFinishedEvent],
      }),
    );

    unmount();
  });
});
