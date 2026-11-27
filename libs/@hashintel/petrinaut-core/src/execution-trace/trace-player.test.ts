import { describe, expect, it, vi } from "vitest";

import { createTracePlayer, EVENT_PLAY_MODE_LEAD } from "./trace-player";
import { createQueueTrace } from "./trace.test-helpers";

/** A player on a trace, with a clock to tick it by seconds. */
const playing = (
  trace: ReturnType<typeof createQueueTrace>["trace"],
  options?: Parameters<ReturnType<typeof createTracePlayer>["load"]>[1],
) => {
  const player = createTracePlayer();
  player.load(trace, options);
  let now = 0;
  return {
    player,
    time: () => player.state.get().time,
    /** Ticks once to start the clock, then again `seconds` later. */
    advance: (seconds: number) => {
      player.tick(now);
      now += seconds * 1000;
      player.tick(now);
    },
  };
};

describe("createTracePlayer", () => {
  it("moves the viewed position by the wall clock, scaled by the speed", () => {
    const { trace, writer } = createQueueTrace({ continuity: "continuous" });
    writer.cover(100);
    const { player, time, advance } = playing(trace);

    player.play();
    advance(1.5);
    expect(time()).toBeCloseTo(1.5);

    player.setSpeed(10);
    advance(2);
    expect(time()).toBeCloseTo(21.5);
  });

  it("waits at the end of what the trace covers, and goes on when it grows", () => {
    const { trace, writer } = createQueueTrace({ continuity: "continuous" });
    writer.cover(1);
    const { player, time, advance } = playing(trace);

    player.play();
    advance(5);
    expect(player.state.get()).toMatchObject({ playState: "Playing", time: 1 });

    writer.cover(10);
    advance(2);
    expect(time()).toBeCloseTo(3);
  });

  it("pauses at the end of an execution that is over, and plays it again from the start", () => {
    const { trace, writer, finish } = createQueueTrace();
    finish(2);
    writer.end();
    const { player, advance } = playing(trace);

    player.play();
    advance(5);
    expect(player.state.get()).toMatchObject({ playState: "Paused", time: 2 });

    player.play();
    expect(player.state.get()).toMatchObject({ playState: "Playing", time: 0 });
  });

  it("jumps to the end of what is covered at the max speed", () => {
    const { trace, writer } = createQueueTrace({ continuity: "continuous" });
    writer.cover(40);
    const { player, time, advance } = playing(trace);

    player.setSpeed(Number.POSITIVE_INFINITY);
    player.play();
    advance(0.016);
    expect(time()).toBe(40);
  });

  it("keeps a play that was pressed before the trace existed", () => {
    const { trace, writer } = createQueueTrace({ continuity: "continuous" });
    writer.cover(10);
    const player = createTracePlayer();

    player.play();
    player.load(trace);
    expect(player.state.get().playState).toBe("Playing");

    player.load(null);
    expect(player.state.get()).toMatchObject({ playState: "Stopped", time: 0 });
  });

  describe("demand", () => {
    it("asks the source to cover the mode's lead past the viewed position", () => {
      const onDemand = vi.fn();
      const { trace, writer } = createQueueTrace({
        continuity: "continuous",
        onDemand,
      });
      writer.cover(100);
      const { player } = playing(trace);
      expect(onDemand).toHaveBeenLastCalledWith(
        EVENT_PLAY_MODE_LEAD.computeBuffer,
      );

      player.seek(30);
      expect(onDemand).toHaveBeenLastCalledWith(
        30 + EVENT_PLAY_MODE_LEAD.computeBuffer,
      );

      // A position behind what was already asked for asks nothing new.
      onDemand.mockClear();
      player.seek(10);
      expect(onDemand).not.toHaveBeenCalled();
    });

    it("asks afresh when the mode changes, and nothing in view-only mode", () => {
      const onDemand = vi.fn();
      const { trace, writer } = createQueueTrace({
        continuity: "continuous",
        onDemand,
      });
      writer.cover(100);
      const { player } = playing(trace);

      player.setMode("computeMax");
      expect(onDemand).toHaveBeenLastCalledWith(Number.POSITIVE_INFINITY);

      player.setMode("computeBuffer");
      expect(onDemand).toHaveBeenLastCalledWith(
        EVENT_PLAY_MODE_LEAD.computeBuffer,
      );

      onDemand.mockClear();
      player.setMode("viewOnly");
      player.seek(50);
      expect(onDemand).not.toHaveBeenCalled();
    });

    it("asks nothing of an execution that is over", () => {
      const onDemand = vi.fn();
      const { trace, writer } = createQueueTrace({ onDemand });
      writer.end();
      playing(trace).player.seek(0);
      expect(onDemand).not.toHaveBeenCalled();
    });
  });

  describe("a discrete trace", () => {
    it("rests on the last event at or before where it is put", () => {
      const { trace, finish } = createQueueTrace();
      finish(2);
      finish(6);
      const { player, time } = playing(trace);

      player.seek(5);
      expect(time()).toBe(2);
      player.seek(1);
      expect(time()).toBe(0);
    });

    it("moves between its events while it plays, and rests when it pauses", () => {
      const { trace, finish } = createQueueTrace();
      finish(2);
      finish(6);
      const { player, time, advance } = playing(trace);

      player.play();
      advance(3.5);
      expect(time()).toBeCloseTo(3.5);

      player.pause();
      expect(time()).toBe(2);
    });

    it("steps from event to event, over the reference events between them", () => {
      const { trace, writer, encoder, finish } = createQueueTrace();
      finish(2);
      writer.append([encoder.state(3, { queued: 2, done: 1 })]);
      finish(6);
      const { player, time } = playing(trace);

      player.step(1);
      expect(time()).toBe(2);
      player.step(1);
      expect(time()).toBe(6);
      player.step(1);
      expect(time()).toBe(6);
      player.step(-1);
      expect(time()).toBe(2);
      player.step(-1);
      expect(time()).toBe(0);
    });
  });

  describe("a trace that does not start at position 0", () => {
    it("opens at its start, returns there on stop and never views before it", () => {
      const { trace, finish } = createQueueTrace({ startTime: 100 });
      finish(130);
      const { player, time } = playing(trace);
      expect(time()).toBe(100);

      player.seek(130);
      player.seek(20);
      expect(time()).toBe(100);

      player.seek(130);
      player.stop();
      expect(player.state.get()).toMatchObject({
        playState: "Stopped",
        time: 100,
      });
    });
  });

  describe("following an execution that happens on its own", () => {
    it("opens at the end, plays there and shows each event as it arrives", () => {
      const { trace, finish } = createQueueTrace();
      finish(4);
      const { player, time } = playing(trace, { follow: true });
      expect(player.state.get()).toMatchObject({
        playState: "Playing",
        time: 4,
        following: true,
      });

      // No tick: the view moves with the trace.
      finish(9);
      expect(time()).toBe(9);
    });

    it("lets go when paused or put back, and catches up when played to the end", () => {
      const { trace, finish } = createQueueTrace();
      finish(4);
      const { player, time, advance } = playing(trace, { follow: true });

      player.pause();
      finish(9);
      expect(player.state.get()).toMatchObject({ time: 4, following: false });

      player.seek(0);
      player.play();
      advance(2);
      expect(player.state.get()).toMatchObject({ following: false });
      expect(time()).toBeCloseTo(2);

      advance(60);
      expect(player.state.get()).toMatchObject({ time: 9, following: true });
      finish(12);
      expect(time()).toBe(12);
    });

    it("follows again once put back at the end, paused or not", () => {
      const { trace, finish } = createQueueTrace();
      finish(4);
      const { player } = playing(trace, { follow: true });

      player.seek(0);
      expect(player.state.get().following).toBe(false);
      player.seek(4);
      expect(player.state.get().following).toBe(true);

      player.pause();
      expect(player.state.get()).toMatchObject({
        playState: "Paused",
        following: false,
      });
      player.seek(4);
      expect(player.state.get()).toMatchObject({
        playState: "Playing",
        following: true,
      });
    });

    it("stops following where the execution ends", () => {
      const { trace, writer, finish } = createQueueTrace();
      const { player } = playing(trace, { follow: true });
      finish(4);
      writer.end();
      expect(player.state.get()).toMatchObject({
        playState: "Paused",
        time: 4,
        following: false,
      });
    });

    it("opens an execution that is already over at its end, without playing", () => {
      const { trace, writer, finish } = createQueueTrace();
      finish(4);
      writer.end();
      const { player } = playing(trace, { follow: true });
      expect(player.state.get()).toMatchObject({
        playState: "Stopped",
        time: 4,
        following: false,
      });
    });

    it("never follows a trace it was not asked to", () => {
      const { trace, finish } = createQueueTrace();
      finish(4);
      const { player, advance } = playing(trace);
      player.play();
      advance(10);
      finish(9);
      expect(player.state.get()).toMatchObject({ time: 4, following: false });
    });
  });
});
