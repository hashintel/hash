import { act, cleanup, render } from "@testing-library/react";
/**
 * @vitest-environment jsdom
 */
import { use } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EVENT_PLAY_MODE_LEAD } from "@hashintel/petrinaut-core";

import {
  ExecutionTraceContext,
  NO_VIEWED_EXECUTION,
  type ViewedExecution,
} from "../execution-trace/context";
import { createQueueTrace } from "../execution-trace/trace.test-helpers";
import {
  DEFAULT_SIMULATION_CONTEXT,
  SimulationContext,
  type SimulationContextValue,
} from "../simulation/context";
import {
  EventPlaybackContext,
  type EventPlaybackContextValue,
} from "./context";
import { EventPlaybackProvider } from "./provider";

/** The viewed execution a trace stands for, as the provider above would say it. */
const viewing = (
  trace: ViewedExecution["trace"],
  origin: ViewedExecution["origin"] = "simulation",
): ViewedExecution => ({
  origin,
  trace,
  playable: trace,
  clock: trace?.clock ?? "time",
  continuity: trace?.continuity ?? "continuous",
});

const mount = (
  simulation: Partial<SimulationContextValue>,
  viewed: ViewedExecution = NO_VIEWED_EXECUTION,
) => {
  const read: { value: EventPlaybackContextValue | null } = { value: null };
  const Probe: React.FC = () => {
    read.value = use(EventPlaybackContext);
    return null;
  };
  const tree = (
    overrides: Partial<SimulationContextValue>,
    execution: ViewedExecution,
  ) => (
    <SimulationContext value={{ ...DEFAULT_SIMULATION_CONTEXT, ...overrides }}>
      <ExecutionTraceContext value={execution}>
        <EventPlaybackProvider>
          <Probe />
        </EventPlaybackProvider>
      </ExecutionTraceContext>
    </SimulationContext>
  );
  const view = render(tree(simulation, viewed));
  return {
    playback: () => {
      if (!read.value) {
        throw new Error("The playback context was not read");
      }
      return read.value;
    },
    update: (
      next: Partial<SimulationContextValue>,
      execution: ViewedExecution = NO_VIEWED_EXECUTION,
    ) => view.rerender(tree(next, execution)),
  };
};

afterEach(cleanup);

describe("EventPlaybackProvider", () => {
  it("starts the run it initialized, and plays", async () => {
    const initialize = vi.fn(() => Promise.resolve(true));
    const run = vi.fn();
    const { playback } = mount({ initialize, run });

    await act(() => playback().play());

    expect(initialize).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(1);
    expect(playback().playbackState).toBe("Playing");
  });

  it("plays nothing when a change of configuration overtook the start", async () => {
    const run = vi.fn();
    const { playback } = mount({
      initialize: () => Promise.resolve(false),
      run,
    });

    await act(() => playback().play());

    expect(run).not.toHaveBeenCalled();
    expect(playback().playbackState).toBe("Stopped");
  });

  it("joins a start already under way when Play is pressed again", async () => {
    let finish: (started: boolean) => void = () => {};
    const initialize = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    const run = vi.fn();
    const { playback } = mount({ initialize, run });

    let presses: Promise<void>[] = [];
    act(() => {
      presses = [playback().play(), playback().play()];
    });
    expect(initialize).toHaveBeenCalledTimes(1);

    await act(async () => {
      finish(true);
      await Promise.all(presses);
    });
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(1);
    expect(playback().playbackState).toBe("Playing");
  });

  it("starts the run itself when the start it joined was overtaken", async () => {
    const finishers: ((started: boolean) => void)[] = [];
    const initialize = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finishers.push(resolve);
        }),
    );
    const run = vi.fn();
    const { playback } = mount({ initialize, run });

    let presses: Promise<void>[] = [];
    act(() => {
      presses = [playback().play(), playback().play()];
    });
    await act(async () => {
      finishers[0]!(false);
      await presses[0];
    });
    expect(initialize).toHaveBeenCalledTimes(2);
    expect(run).not.toHaveBeenCalled();

    await act(async () => {
      finishers[1]!(true);
      await presses[1];
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(playback().playbackState).toBe("Playing");
  });

  it("keeps the play pressed before the run existed once its trace is viewed", async () => {
    const { playback, update } = mount({
      initialize: () => Promise.resolve(true),
    });
    await act(() => playback().play());

    update({ state: "Running" }, viewing(createQueueTrace().trace));

    expect(playback().playbackState).toBe("Playing");
    expect(playback().coveredTime).toBe(5);
  });

  it("asks the run for the viewed time plus the mode's lead, and for nothing in view-only mode", () => {
    const onDemand = vi.fn<(time: number) => void>();
    const pause = vi.fn();
    const { trace } = createQueueTrace({ continuity: "continuous", onDemand });
    const { playback } = mount({ state: "Paused", pause }, viewing(trace));
    expect(onDemand).toHaveBeenLastCalledWith(
      EVENT_PLAY_MODE_LEAD.computeBuffer,
    );

    act(() => playback().setTime(2));
    expect(onDemand).toHaveBeenLastCalledWith(
      2 + EVENT_PLAY_MODE_LEAD.computeBuffer,
    );

    act(() => playback().setPlayMode("viewOnly"));
    expect(pause).toHaveBeenCalledTimes(1);
    const demandsSoFar = onDemand.mock.calls.length;
    act(() => playback().setTime(4));
    expect(onDemand).toHaveBeenCalledTimes(demandsSoFar);
  });

  it("views a continuous run at any time it covers", () => {
    const { trace } = createQueueTrace({ continuity: "continuous" });
    const { playback } = mount({ state: "Paused" }, viewing(trace));

    act(() => playback().setTime(2));
    expect(playback().playbackStore.get().time).toBe(2);
    act(() => playback().setTime(9));
    expect(playback().playbackStore.get().time).toBe(5);
  });

  it("views a discrete run at the event at or before the time it is put at", () => {
    const { playback } = mount(
      { state: "Paused" },
      viewing(createQueueTrace().trace),
    );

    act(() => playback().setTime(2));
    expect(playback().playbackStore.get().time).toBe(1.5);
    act(() => playback().stepToEvent(1));
    expect(playback().playbackStore.get().time).toBe(3);
  });

  it("returns to the start when the run is discarded", () => {
    const { trace } = createQueueTrace({ continuity: "continuous" });
    const { playback, update } = mount({ state: "Paused" }, viewing(trace));
    act(() => playback().setTime(2));
    expect(playback().playbackStore.get().time).toBe(2);

    update({ state: "NotRun" });
    expect(playback().playbackStore.get()).toMatchObject({
      playState: "Stopped",
      time: 0,
    });
  });

  describe("over an execution the host reports", () => {
    it("opens at the end and follows the execution as it happens", () => {
      const { trace, finish } = createQueueTrace();
      const { playback } = mount({}, viewing(trace, "host"));
      expect(playback().playbackStore.get()).toMatchObject({
        playState: "Playing",
        time: 5,
        following: true,
      });

      act(() => finish(8));
      expect(playback().playbackStore.get().time).toBe(8);
      expect(playback().eventCount).toBe(4);
    });

    it("moves the view and never starts, runs or pauses a simulation", async () => {
      const simulation = {
        initialize: vi.fn(() => Promise.resolve(true)),
        run: vi.fn(),
        pause: vi.fn(),
      };
      const { playback } = mount(
        simulation,
        viewing(createQueueTrace().trace, "host"),
      );

      act(() => playback().pause());
      expect(playback().playbackStore.get()).toMatchObject({
        playState: "Paused",
        following: false,
      });
      act(() => playback().setTime(2));
      await act(() => playback().play());

      expect(playback().playbackStore.get()).toMatchObject({
        playState: "Playing",
        time: 1.5,
        following: false,
      });
      expect(playback().isComputeAvailable).toBe(false);
      expect(simulation.initialize).not.toHaveBeenCalled();
      expect(simulation.run).not.toHaveBeenCalled();
      expect(simulation.pause).not.toHaveBeenCalled();
    });
  });
});
