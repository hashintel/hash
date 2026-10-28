import { afterEach, describe, expect, it, vi } from "vitest";

import { createRunningFlowRunHistoryCache } from "./running-flow-run-history-cache.js";

import type { Client as TemporalClient } from "@temporalio/client";

const runId = "run-id";

/** A Temporal client with one running run of each workflow, of `historyLengths[workflowId]` events. */
const createTemporalClient = (historyLengths: Record<string, number>) => {
  const getHistory = (workflowId: string) =>
    Array.from({ length: historyLengths[workflowId] ?? 0 }, (_, index) => ({
      eventId: index + 1,
    }));

  const getWorkflowExecutionHistory = vi.fn(
    ({ execution }: { execution: { workflowId: string } }) =>
      Promise.resolve({
        history: { events: getHistory(execution.workflowId) },
        nextPageToken: new Uint8Array(),
      }),
  );

  return {
    temporalClient: {
      workflowService: {
        getWorkflowExecutionHistory,
        getWorkflowExecutionHistoryReverse: ({
          execution,
        }: {
          execution: { workflowId: string };
        }) =>
          Promise.resolve({
            history: { events: getHistory(execution.workflowId).reverse() },
            nextPageToken: new Uint8Array(),
          }),
      },
    } as unknown as TemporalClient,
    getWorkflowExecutionHistory,
  };
};

describe("createRunningFlowRunHistoryCache", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("drops a history that hasn't been read for `maxIdleMs`", async () => {
    vi.useFakeTimers();
    const historyLengths = { a: 5, b: 5 };
    const { temporalClient, getWorkflowExecutionHistory } =
      createTemporalClient(historyLengths);
    const cache = createRunningFlowRunHistoryCache({ maxIdleMs: 1000 });
    const read = (workflowId: "a" | "b") =>
      cache.readHistory({
        temporalClient,
        workflowId,
        runId,
        historyLength: historyLengths[workflowId],
      });

    await read("a");
    await read("b");
    vi.advanceTimersByTime(600);
    await read("b");
    vi.advanceTimersByTime(600);
    await read("a");
    await read("b");

    expect(
      getWorkflowExecutionHistory.mock.calls.map(
        ([{ execution }]) => execution.workflowId,
      ),
    ).toStrictEqual(["a", "b", "a"]);
  });

  it("drops the least recently read histories when it holds more than `maxEvents` events", async () => {
    const historyLengths = { a: 4, b: 3, c: 3 };
    const { temporalClient, getWorkflowExecutionHistory } =
      createTemporalClient(historyLengths);
    const cache = createRunningFlowRunHistoryCache({ maxEvents: 7 });
    const read = (workflowId: "a" | "b" | "c") =>
      cache.readHistory({
        temporalClient,
        workflowId,
        runId,
        historyLength: historyLengths[workflowId],
      });

    await read("a");
    await read("b");
    /* `a` is now read more recently than `b`. */
    await read("a");
    /* 10 events: `b` is dropped, leaving 7. */
    await read("c");
    await read("a");
    await read("c");
    await read("b");

    expect(
      getWorkflowExecutionHistory.mock.calls.map(
        ([{ execution }]) => execution.workflowId,
      ),
    ).toStrictEqual(["a", "b", "c", "b"]);
  });
});
