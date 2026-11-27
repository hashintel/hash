/**
 * @vitest-environment jsdom
 */
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_PETRINAUT_EXTENSIONS } from "@hashintel/petrinaut-core";

import {
  SDCPNContext,
  type SDCPNContextValue,
} from "../document/sdcpn-context";
import { ActualModeContext } from "../host/actual-mode-context";
import { queueNet } from "./trace.test-helpers";
import { useActualModeTrace } from "./use-actual-mode-trace";

import type {
  ActualModeContextValue,
  ActualModeTransitionFiring,
} from "@hashintel/petrinaut-core";
import type { PropsWithChildren } from "react";

type Execution = Extract<ActualModeContextValue, { available: true }>;

const sdcpnContextValue: SDCPNContextValue = {
  petriNetId: "actual-test",
  petriNetDefinition: queueNet,
  readonly: true,
  extensions: DEFAULT_PETRINAUT_EXTENSIONS,
  getItemType: () => null,
};

const startedAtMs = Date.parse("2026-06-05T10:00:00.000Z");

const finishAt = (seconds: number): ActualModeTransitionFiring => ({
  transitionId: "finish",
  input: { queued: 1 },
  output: { done: 1 },
  ts: new Date(startedAtMs + seconds * 1000).toISOString(),
});

const execution = (overrides: Partial<Execution> = {}): Execution => ({
  available: true,
  source: { id: "run-1", label: "Run 1" },
  status: "streaming",
  title: "Run",
  definition: queueNet,
  initialState: { queued: 2, done: 0 },
  transitionFirings: [finishAt(4)],
  timelineStartedAtMs: startedAtMs,
  timelineNowMs: null,
  error: null,
  ...overrides,
});

const renderTrace = (initial: Execution, enabled = true) =>
  renderHook(
    ({ enabled: isEnabled }: { value: Execution; enabled: boolean }) =>
      useActualModeTrace({ enabled: isEnabled }),
    {
      initialProps: { value: initial, enabled },
      wrapper: ({
        children,
        value,
      }: PropsWithChildren<{ value?: Execution }>) => (
        <ActualModeContext value={value ?? initial}>
          <SDCPNContext value={sdcpnContextValue}>{children}</SDCPNContext>
        </ActualModeContext>
      ),
    },
  );

afterEach(cleanup);

describe("useActualModeTrace", () => {
  it("maps nothing while another execution is viewed", () => {
    expect(renderTrace(execution(), false).result.current).toBeNull();
  });

  it("maps nothing until the host supplies an initial state", () => {
    expect(
      renderTrace(execution({ initialState: null })).result.current,
    ).toBeNull();
  });

  it("maps the host's execution to a trace on the wall clock, complete on the first render", () => {
    const trace = renderTrace(execution()).result.current!;

    expect(trace).toMatchObject({
      clock: "time",
      continuity: "discrete",
      epochMs: startedAtMs,
    });
    expect(trace.coverage.get()).toEqual({
      eventCount: 2,
      startTime: 0,
      coveredTime: 4,
      ended: false,
    });
    expect(trace.getStateAt(4)?.toFrameState().places).toEqual({
      queued: { tokenCount: 1 },
      done: { tokenCount: 1 },
    });
  });

  it("grows the same trace as the host reports more, and ends it with the execution", () => {
    const wrapperValue = { current: execution() };
    const { result, rerender } = renderHook(
      () => useActualModeTrace({ enabled: true }),
      {
        wrapper: ({ children }: PropsWithChildren) => (
          <ActualModeContext value={wrapperValue.current}>
            <SDCPNContext value={sdcpnContextValue}>{children}</SDCPNContext>
          </ActualModeContext>
        ),
      },
    );
    const trace = result.current!;

    // A host that rebuilds its list on every update still reports the same
    // execution.
    wrapperValue.current = execution({
      transitionFirings: [finishAt(4), finishAt(9)],
      timelineNowMs: startedAtMs + 12_000,
    });
    rerender();
    expect(result.current).toBe(trace);
    expect(trace.coverage.get()).toMatchObject({
      eventCount: 3,
      coveredTime: 12,
      ended: false,
    });

    wrapperValue.current = execution({
      status: "complete",
      transitionFirings: [finishAt(4), finishAt(9)],
    });
    rerender();
    expect(result.current).toBe(trace);
    expect(trace.coverage.get().ended).toBe(true);
  });

  it("starts a new trace for another execution, and for a list that is not the one it holds continued", () => {
    const wrapperValue = { current: execution() };
    const { result, rerender } = renderHook(
      () => useActualModeTrace({ enabled: true }),
      {
        wrapper: ({ children }: PropsWithChildren) => (
          <ActualModeContext value={wrapperValue.current}>
            <SDCPNContext value={sdcpnContextValue}>{children}</SDCPNContext>
          </ActualModeContext>
        ),
      },
    );
    const first = result.current!;

    wrapperValue.current = execution({ source: { id: "run-2" } });
    rerender();
    const second = result.current!;
    expect(second).not.toBe(first);

    wrapperValue.current = execution({
      source: { id: "run-2" },
      transitionFirings: [],
    });
    rerender();
    expect(result.current).not.toBe(second);
    expect(result.current?.coverage.get().eventCount).toBe(1);
  });
});
