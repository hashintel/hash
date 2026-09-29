import { expect, test } from "vitest";

import { describePlaybackChange } from "./playback-voice-note";

import type { SDCPN } from "@hashintel/petrinaut-core";

const place = (id: string, name: string): SDCPN["places"][number] => ({
  id,
  name,
  x: 0,
  y: 0,
  colorId: null,
  dynamicsEnabled: false,
  differentialEquationId: null,
});

const definition: SDCPN = {
  places: [
    place("p_queue", "Queue"),
    place("p_agents", "Agents busy"),
    place("p_done", "Done"),
    place("p_unnamed", ""),
  ],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
};

const frame = {
  number: 47,
  places: {
    p_queue: { tokenCount: 12 },
    p_agents: { tokenCount: 5 },
    p_done: { tokenCount: 40 },
    p_missing: { tokenCount: 3 },
  },
};

test("a pause reports the frame and the tokens per named place, in model order", () => {
  expect(
    describePlaybackChange({
      previous: "Playing",
      next: "Paused",
      frame,
      definition,
    }),
  ).toBe(
    "The simulation on the canvas paused at frame 47. Tokens now: Queue 12, Agents busy 5, Done 40. Describe what is on the canvas only from these numbers.",
  );
});

test("start, resume and stop are distinguished; no change says nothing", () => {
  expect(
    describePlaybackChange({
      previous: "Stopped",
      next: "Playing",
      frame: null,
      definition,
    }),
  ).toBe("The simulation on the canvas started playing.");
  expect(
    describePlaybackChange({
      previous: "Paused",
      next: "Playing",
      frame,
      definition,
    }),
  ).toBe("The simulation on the canvas resumed at frame 47.");
  expect(
    describePlaybackChange({
      previous: "Playing",
      next: "Stopped",
      frame,
      definition,
    }),
  ).toBe("The simulation on the canvas was stopped and reset to the start.");
  expect(
    describePlaybackChange({
      previous: "Paused",
      next: "Paused",
      frame,
      definition,
    }),
  ).toBeNull();
});

test("a wide model lists twelve places and counts the rest", () => {
  const wide: SDCPN = {
    ...definition,
    places: Array.from({ length: 15 }, (_, index) =>
      place(`p${index}`, `Place ${index}`),
    ),
  };
  const note = describePlaybackChange({
    previous: "Playing",
    next: "Paused",
    frame: {
      number: 1,
      places: Object.fromEntries(
        wide.places.map((entry, index) => [entry.id, { tokenCount: index }]),
      ),
    },
    definition: wide,
  });
  expect(note).toContain("Place 11 11, and 3 more places.");
  expect(note).not.toContain("Place 12");
});
