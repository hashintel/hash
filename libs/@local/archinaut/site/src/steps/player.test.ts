import { describe, expect, it } from "vitest";

import {
  advancePlayer,
  armPlayer,
  completePlayerStep,
  registerPlayerSteps,
  replayPlayer,
  startPlayer,
  stillPlayer,
  type PlayerState,
} from "./player";

const playThrough = (state: PlayerState): number[] => {
  const steps = [state.step];
  let current = state;
  while (current.phase === "playing") {
    current = advancePlayer(current);
    steps.push(current.step);
  }
  return steps;
};

describe("the Steps player", () => {
  it("starts still on its last step", () => {
    expect(stillPlayer(4)).toEqual({ step: 3, count: 4, phase: "still" });
    expect(stillPlayer(0)).toEqual({ step: 0, count: 1, phase: "still" });
  });

  it("rewinds, then plays every step once and stops on the last", () => {
    const armed = armPlayer(stillPlayer(4));
    expect(armed).toEqual({ step: 0, count: 4, phase: "armed" });
    const playing = startPlayer(armed);
    expect(playThrough(playing)).toEqual([0, 1, 2, 3]);
    expect(advancePlayer(advancePlayer(advancePlayer(playing))).phase).toBe(
      "done",
    );
  });

  it("does not rewind a block of one step, or one that has played", () => {
    expect(armPlayer(stillPlayer(1)).phase).toBe("still");
    const done: PlayerState = { step: 2, count: 3, phase: "done" };
    expect(armPlayer(done)).toBe(done);
    expect(startPlayer(stillPlayer(3)).phase).toBe("still");
  });

  it("advances early when the shown step's animation ends", () => {
    const playing = startPlayer(armPlayer(stillPlayer(3)));
    expect(completePlayerStep(playing, 0).step).toBe(1);
    expect(completePlayerStep(playing, 1)).toBe(playing);
  });

  it("replays from the first step", () => {
    const done: PlayerState = { step: 2, count: 3, phase: "done" };
    expect(replayPlayer(done)).toEqual({ step: 0, count: 3, phase: "playing" });
  });

  it("takes a larger step count a component declares", () => {
    expect(registerPlayerSteps(stillPlayer(1), 5)).toEqual({
      step: 4,
      count: 5,
      phase: "still",
    });
    const playing = startPlayer(armPlayer(stillPlayer(2)));
    expect(registerPlayerSteps(playing, 5)).toEqual({
      ...playing,
      count: 5,
    });
    expect(registerPlayerSteps(playing, 1)).toBe(playing);
  });
});
