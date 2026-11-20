/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DEFAULT_PETRINAUT_EXTENSIONS } from "@hashintel/petrinaut-core";

import { ActualModeContext } from "../actual-mode-context";
import { SDCPNContext, type SDCPNContextValue } from "../state/sdcpn-context";
import { useActualExecutionFrameSource } from "./use-actual-execution-frame-source";

import type { ActualModeContextValue, SDCPN } from "@hashintel/petrinaut-core";
import type { PropsWithChildren } from "react";

const definition: SDCPN = {
  places: [
    {
      id: "queued",
      name: "Queued",
      colorId: null,
      dynamicsEnabled: false,
      x: 0,
      y: 0,
    },
    {
      id: "done",
      name: "Done",
      colorId: null,
      dynamicsEnabled: false,
      x: 100,
      y: 0,
    },
  ],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
};

const sdcpnContextValue: SDCPNContextValue = {
  petriNetId: "actual-test",
  petriNetDefinition: definition,
  readonly: true,
  extensions: DEFAULT_PETRINAUT_EXTENSIONS,
  getItemType: () => null,
};

const availableActualMode: ActualModeContextValue = {
  available: true,
  source: { id: "run-1", label: "Run 1" },
  status: "complete",
  title: "Run",
  definition,
  initialState: { queued: 2, done: 0 },
  transitionFirings: [
    {
      transitionId: "finish",
      input: { queued: 1 },
      output: { done: 1 },
      ts: "2026-06-05T10:00:00.000Z",
    },
  ],
  timelineStartedAtMs: Date.parse("2026-06-05T10:00:00.000Z"),
  timelineNowMs: Date.parse("2026-06-05T10:00:05.000Z"),
  error: null,
};

const Contexts = ({ children }: PropsWithChildren) => (
  <ActualModeContext value={availableActualMode}>
    <SDCPNContext value={sdcpnContextValue}>{children}</SDCPNContext>
  </ActualModeContext>
);

const renderActualSource = (enabled: boolean) =>
  renderHook(() => useActualExecutionFrameSource({ enabled }), {
    wrapper: Contexts,
  }).result;

describe("useActualExecutionFrameSource", () => {
  it("returns an empty source while disabled", () => {
    const source = renderActualSource(false);

    expect(source.current.totalFrames).toBe(0);
    expect(source.current.currentFrameReader).toBeNull();
  });

  it("derives frames from the initial state and transition firings", async () => {
    const source = renderActualSource(true);

    // One initial point plus one transition firing; no live ticks because the
    // stream is complete.
    expect(source.current.sourceId).toMatch(/^actual:run-1:/);
    expect(source.current.totalFrames).toBe(2);
    expect(source.current.currentFrameIndex).toBe(0);
    expect(source.current.currentViewedFrame?.places).toEqual({
      queued: { tokenCount: 2 },
      done: { tokenCount: 0 },
    });

    const frames = await source.current.getFramesInRange(0);
    expect(frames.map((frame) => frame.number)).toEqual([0, 1]);
    expect(frames[1]?.toFrameState().places).toEqual({
      queued: { tokenCount: 1 },
      done: { tokenCount: 1 },
    });
  });

  it("clamps scrubbing to the available frame range", () => {
    const source = renderActualSource(true);

    act(() => {
      source.current.scrubToFrame(5);
    });

    expect(source.current.currentFrameIndex).toBe(1);
    expect(source.current.currentViewedFrame?.places).toEqual({
      queued: { tokenCount: 1 },
      done: { tokenCount: 1 },
    });

    act(() => {
      source.current.scrubToFrame(-3);
    });

    expect(source.current.currentFrameIndex).toBe(0);
  });
});
