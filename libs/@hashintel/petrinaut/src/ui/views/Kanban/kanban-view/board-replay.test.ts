import { describe, expect, it, vi } from "vitest";

import { createBoardReplay } from "./board-replay";

import type {
  Color,
  Place,
  SimulationFrameReader,
  StatusView,
  TokenRecord,
} from "@hashintel/petrinaut-core";

const ticketColor: Color = {
  id: "type-ticket",
  name: "Ticket",
  iconSlug: "circle",
  displayColor: "#0000FF",
  elements: [
    {
      elementId: "ticket-id",
      name: "ticket_id",
      type: "string",
      identityRef: "identity-ticket",
    },
  ],
};

const makePlace = (id: string, name: string): Place => ({
  id,
  name,
  colorId: "type-ticket",
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: 0,
  y: 0,
});

const places = [makePlace("todo", "Todo"), makePlace("doing", "Doing")];

const statusView: StatusView = {
  id: "view-1",
  name: "Ticket status",
  identityRef: "identity-ticket",
  labels: [
    {
      id: "label-todo",
      name: "Todo",
      displayColor: "#94a3b8",
      places: ["todo"],
    },
    {
      id: "label-doing",
      name: "Doing",
      displayColor: "#2563eb",
      places: ["doing"],
    },
  ],
};

const makeFrame = (
  number: number,
  timeSeconds: number,
  tokensByPlaceId: Record<string, TokenRecord[]>,
): SimulationFrameReader => ({
  number,
  time: timeSeconds,
  getPlaceTokenCount: (placeId) => tokensByPlaceId[placeId]?.length ?? 0,
  getPlaceTokens: (place) => tokensByPlaceId[place.id] ?? [],
  getTransitionState: () => null,
  toFrameState: () => ({ number, places: {} }),
});

const ticket = { ticket_id: "a" };
// The ticket sits in todo for frames 0-1, moves to doing for frames 2+.
const frames = [
  makeFrame(0, 0, { todo: [ticket] }),
  makeFrame(1, 1, { todo: [ticket] }),
  makeFrame(2, 2, { doing: [ticket] }),
  makeFrame(3, 3, { doing: [ticket] }),
  makeFrame(4, 4, { doing: [ticket] }),
];

const makeGetFramesInRange = () =>
  vi.fn((startIndex: number, endIndex: number) =>
    Promise.resolve(frames.slice(startIndex, endIndex)),
  );

const makeReplay = () =>
  createBoardReplay({
    statusView,
    places,
    types: [ticketColor],
    statusConditions: {},
  });

describe("createBoardReplay", () => {
  it("feeds only new frames on forward playback", async () => {
    const replay = makeReplay();
    const getFramesInRange = makeGetFramesInRange();

    const first = await replay.advanceTo(2, getFramesInRange);
    expect(getFramesInRange).toHaveBeenLastCalledWith(0, 3);
    expect(first.instances[0]?.currentLabelId).toBe("label-doing");
    expect(first.nowMs).toBe(2_000);

    const second = await replay.advanceTo(4, getFramesInRange);
    expect(getFramesInRange).toHaveBeenLastCalledWith(2, 5);
    expect(getFramesInRange).toHaveBeenCalledTimes(2);
    expect(second.nowMs).toBe(4_000);
    // Dwell history accumulated across the incremental advances.
    expect(second.instances[0]?.intervals).toEqual([
      { labelId: "label-todo", fromMs: 0, toMs: 2_000 },
      { labelId: "label-doing", fromMs: 2_000, toMs: null },
    ]);
  });

  it("rebuilds from frame zero on a backward scrub", async () => {
    const replay = makeReplay();
    const getFramesInRange = makeGetFramesInRange();

    await replay.advanceTo(4, getFramesInRange);
    const scrubbedBack = await replay.advanceTo(1, getFramesInRange);

    expect(getFramesInRange).toHaveBeenLastCalledWith(0, 2);
    expect(scrubbedBack.nowMs).toBe(1_000);
    expect(scrubbedBack.instances[0]?.currentLabelId).toBe("label-todo");
    expect(scrubbedBack.instances[0]?.intervals).toEqual([
      { labelId: "label-todo", fromMs: 0, toMs: null },
    ]);
  });

  it("surfaces fetch failures and resumes on the next advance", async () => {
    const replay = makeReplay();
    const failing = vi.fn(() => Promise.reject(new Error("worker gone")));

    await expect(replay.advanceTo(2, failing)).rejects.toThrow("worker gone");

    const getFramesInRange = makeGetFramesInRange();
    const recovered = await replay.advanceTo(2, getFramesInRange);
    expect(getFramesInRange).toHaveBeenLastCalledWith(0, 3);
    expect(recovered.instances[0]?.currentLabelId).toBe("label-doing");
  });

  it("rebuilds when a fetched frame's time runs backwards", async () => {
    const replay = makeReplay();
    const getFramesInRange = makeGetFramesInRange();
    await replay.advanceTo(3, getFramesInRange);

    // The timeline was reshaped: index 3 re-points at an earlier time.
    const reshaped = [
      frames[0]!,
      frames[1]!,
      frames[2]!,
      makeFrame(3, 2.5, { todo: [ticket] }),
      frames[4]!,
    ];
    const reshapedFetch = vi.fn((startIndex: number, endIndex: number) =>
      Promise.resolve(reshaped.slice(startIndex, endIndex)),
    );

    const snapshot = await replay.advanceTo(3, reshapedFetch);
    expect(reshapedFetch).toHaveBeenCalledWith(0, 4);
    expect(snapshot.instances[0]?.currentLabelId).toBe("label-todo");
  });
});
