import { act, cleanup, render } from "@testing-library/react";
/**
 * @vitest-environment jsdom
 */
import { use } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EVENT_PLAY_MODE_LEAD,
  type EventTraceSummary,
} from "@hashintel/petrinaut-core";

import {
  DEFAULT_SIMULATION_CONTEXT,
  SimulationContext,
  type SimulationContextValue,
} from "../simulation/context";
import { constantStore } from "../use-store";
import {
  EventPlaybackContext,
  type EventPlaybackContextValue,
} from "./context";
import { EventPlaybackProvider } from "./provider";

/** A run that has recorded three events over five simulated seconds. */
const runningSource = () => ({
  coverage: constantStore<EventTraceSummary>({
    eventCount: 3,
    coveredTime: 5,
    latest: null,
  }),
  status: constantStore("Running" as const),
  demand: vi.fn<(time: number) => void>(),
});

const mount = (simulation: Partial<SimulationContextValue>) => {
  const read: { value: EventPlaybackContextValue | null } = { value: null };
  const Probe: React.FC = () => {
    read.value = use(EventPlaybackContext);
    return null;
  };
  const tree = (overrides: Partial<SimulationContextValue>) => (
    <SimulationContext value={{ ...DEFAULT_SIMULATION_CONTEXT, ...overrides }}>
      <EventPlaybackProvider>
        <Probe />
      </EventPlaybackProvider>
    </SimulationContext>
  );
  const view = render(tree(simulation));
  return {
    playback: () => {
      if (!read.value) {
        throw new Error("The playback context was not read");
      }
      return read.value;
    },
    update: (next: Partial<SimulationContextValue>) =>
      view.rerender(tree(next)),
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

  it("asks the run for the viewed time plus the mode's lead, and for nothing in view-only mode", () => {
    const source = runningSource();
    const pause = vi.fn();
    const { playback } = mount({
      state: "Paused",
      playbackSource: source,
      pause,
    });
    expect(source.demand).toHaveBeenLastCalledWith(
      EVENT_PLAY_MODE_LEAD.computeBuffer,
    );

    act(() => playback().setTime(2));
    expect(source.demand).toHaveBeenLastCalledWith(
      2 + EVENT_PLAY_MODE_LEAD.computeBuffer,
    );

    act(() => playback().setPlayMode("viewOnly"));
    expect(pause).toHaveBeenCalledTimes(1);
    const demandsSoFar = source.demand.mock.calls.length;
    act(() => playback().setTime(4));
    expect(source.demand).toHaveBeenCalledTimes(demandsSoFar);
  });

  it("returns to the start when the run is discarded", () => {
    const { playback, update } = mount({
      state: "Paused",
      playbackSource: runningSource(),
    });
    act(() => playback().setTime(2));
    expect(playback().playbackStore.get().time).toBe(2);

    update({ state: "NotRun", playbackSource: null });
    expect(playback().playbackStore.get().time).toBe(0);
  });
});
