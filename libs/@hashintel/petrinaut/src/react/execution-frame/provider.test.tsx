/**
 * @vitest-environment jsdom
 */
import { act, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DEFAULT_PETRINAUT_EXTENSIONS } from "@hashintel/petrinaut-core";

import { ActualModeContext } from "../actual-mode-context";
import { SDCPNContext, type SDCPNContextValue } from "../state/sdcpn-context";
import { useActualExecutionFrameSource } from "./provider";

import type { ExecutionFrameSource } from "./context";
import type { ActualModeContextValue, SDCPN } from "@hashintel/petrinaut-core";

const definition: SDCPN = {
  places: [
    {
      id: "queued",
      name: "Queued",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    },
    {
      id: "done",
      name: "Done",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
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
  createNewNet: () => {},
  existingNets: [],
  loadPetriNet: () => {},
  petriNetId: "actual-test",
  petriNetDefinition: definition,
  readonly: true,
  extensions: DEFAULT_PETRINAUT_EXTENSIONS,
  setTitle: () => {},
  title: "Actual test",
  getItemType: () => null,
};

const availableActualMode: ActualModeContextValue = {
  available: true,
  source: {
    kind: "brunch",
    endpoint: "http://127.0.0.1:5184/stream",
    runId: "run-1",
  },
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
  receivedEvents: [],
  timelineStartedAtMs: Date.parse("2026-06-05T10:00:00.000Z"),
  timelineNowMs: Date.parse("2026-06-05T10:00:05.000Z"),
  error: null,
};

/**
 * A test component that runs the adapter hook and exposes its value.
 */
const ActualSourceProbe = ({
  enabled,
  onSource,
}: {
  enabled: boolean;
  onSource: (source: ExecutionFrameSource) => void;
}) => {
  const source = useActualExecutionFrameSource({ enabled });
  // Call the callback during render to capture the value
  onSource(source);
  return null;
};

const renderActualSource = (params: {
  actualMode: ActualModeContextValue;
  enabled: boolean;
}) => {
  // Use an object to hold the value so we can mutate it from the callback
  const captured: { source: ExecutionFrameSource | null } = { source: null };
  const captureSource = (source: ExecutionFrameSource) => {
    captured.source = source;
  };

  render(
    <ActualModeContext value={params.actualMode}>
      <SDCPNContext value={sdcpnContextValue}>
        <ActualSourceProbe enabled={params.enabled} onSource={captureSource} />
      </SDCPNContext>
    </ActualModeContext>,
  );

  return captured;
};

describe("useActualExecutionFrameSource", () => {
  it("returns an empty source while disabled", () => {
    const captured = renderActualSource({
      actualMode: availableActualMode,
      enabled: false,
    });

    expect(captured.source?.totalFrames).toBe(0);
    expect(captured.source?.currentFrameReader).toBeNull();
  });

  it("derives frames from the initial state and transition firings", async () => {
    const captured = renderActualSource({
      actualMode: availableActualMode,
      enabled: true,
    });

    // One initial point plus one transition firing; no live ticks because the
    // stream is complete.
    expect(captured.source?.totalFrames).toBe(2);
    expect(captured.source?.currentFrameIndex).toBe(0);
    expect(captured.source?.currentViewedFrame?.places).toEqual({
      queued: { tokenCount: 2 },
      done: { tokenCount: 0 },
    });

    const frames = (await captured.source?.getFramesInRange(0)) ?? [];
    expect(frames.map((frame) => frame.number)).toEqual([0, 1]);
    expect(frames[1]?.toFrameState().places).toEqual({
      queued: { tokenCount: 1 },
      done: { tokenCount: 1 },
    });
  });

  it("clamps scrubbing to the available frame range", () => {
    const captured = renderActualSource({
      actualMode: availableActualMode,
      enabled: true,
    });

    act(() => {
      captured.source?.scrubToFrame(5);
    });

    expect(captured.source?.currentFrameIndex).toBe(1);
    expect(captured.source?.currentViewedFrame?.places).toEqual({
      queued: { tokenCount: 1 },
      done: { tokenCount: 1 },
    });

    act(() => {
      captured.source?.scrubToFrame(-3);
    });

    expect(captured.source?.currentFrameIndex).toBe(0);
  });
});
