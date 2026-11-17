import { describe, expect, it } from "vitest";

import { FlowRunStatus } from "../../../../../../../../graphql/api-types.gen";
import { getShortRunId } from "../../shared/run-id";
import { getSwitcherRuns } from "./switcher-runs";

import type { RunSummary } from "../../shared/use-flow-runs";
import type { EntityId, WebId } from "@blockprotocol/type-system";

const webId = "0b5a5c4c-6d4d-4cd8-9d5e-2f2b0f7a6a11" as WebId;

/** A run, by the last characters of its uuid, started at the hour given on 9 Nov. */
const run = (idEnd: string, startedAtHour: number): RunSummary => ({
  flowRunEntityId:
    `${webId}~7f9d2b1e-3c4a-4e5f-8a6b-9c0d1e${idEnd}` as EntityId,
  flowScheduleId: null,
  webId,
  status: FlowRunStatus.Completed,
  startedAt: `2026-11-09T${String(startedAtHour).padStart(2, "0")}:00:00Z`,
  closedAt: null,
  updatedAt: `2026-11-09T${String(startedAtHour).padStart(2, "0")}:00:00Z`,
  openInputRequests: [],
});

/*
 * Nine runs started an hour apart, from 01:00 to 09:00, whose IDs don't sort in that order. They're in the order the
 * API might give them, by when each last changed.
 */
const runs = [
  run("0000f2", 3),
  run("0000d4", 1),
  run("0000a8", 9),
  run("00001c", 5),
  run("000a17", 2),
  run("000c55", 8),
  run("000b31", 4),
  run("00002a", 7),
  run("000e90", 6),
];

const idOf = (idEnd: string) =>
  `${webId}~7f9d2b1e-3c4a-4e5f-8a6b-9c0d1e${idEnd}` as EntityId;

const shortIdsOf = (switcherRuns: RunSummary[]) =>
  switcherRuns.map(({ flowRunEntityId }) => getShortRunId(flowRunEntityId));

const shortIdOf = (switcherRun: RunSummary | null) =>
  switcherRun && getShortRunId(switcherRun.flowRunEntityId);

describe("getSwitcherRuns", () => {
  it("lists the six newest runs, newest first", () => {
    expect(
      shortIdsOf(getSwitcherRuns(runs, idOf("00002a"), null).menuRuns),
    ).toEqual(["0000A8", "000C55", "00002A", "000E90", "00001C", "000B31"]);
  });

  it("adds the open run to the six newest if it's older than them", () => {
    expect(
      shortIdsOf(getSwitcherRuns(runs, idOf("000a17"), null).menuRuns),
    ).toEqual([
      "0000A8",
      "000C55",
      "00002A",
      "000E90",
      "00001C",
      "000B31",
      "000A17",
    ]);
  });

  it("opens the next older and the next newer run from the arrows", () => {
    const { older, newer } = getSwitcherRuns(runs, idOf("000a17"), null);

    expect(shortIdOf(older)).toBe("0000D4");
    expect(shortIdOf(newer)).toBe("0000F2");
  });

  it("has no newer run from the newest, and no older run from the oldest", () => {
    const newest = getSwitcherRuns(runs, idOf("0000a8"), null);
    const oldest = getSwitcherRuns(runs, idOf("0000d4"), null);

    expect(shortIdOf(newest.older)).toBe("000C55");
    expect(newest.newer).toBeNull();
    expect(oldest.older).toBeNull();
    expect(shortIdOf(oldest.newer)).toBe("000A17");
  });

  it("has neither arrow for a flow's only run", () => {
    const { menuRuns, older, newer } = getSwitcherRuns(
      [run("0000d4", 1)],
      idOf("0000d4"),
      null,
    );

    expect(shortIdsOf(menuRuns)).toEqual(["0000D4"]);
    expect(older).toBeNull();
    expect(newer).toBeNull();
  });

  it("has neither arrow, and lists only the newest, for a run not among the flow's", () => {
    const { menuRuns, older, newer } = getSwitcherRuns(
      runs,
      idOf("0000ff"),
      null,
    );

    expect(shortIdsOf(menuRuns)).toEqual([
      "0000A8",
      "000C55",
      "00002A",
      "000E90",
      "00001C",
      "000B31",
    ]);
    expect(older).toBeNull();
    expect(newer).toBeNull();
  });

  it("orders runs started at the same time by their short ID, as the Logs table does", () => {
    const { menuRuns, older } = getSwitcherRuns(
      [run("000002", 1), run("000001", 1)],
      idOf("000001"),
      null,
    );

    expect(shortIdsOf(menuRuns)).toEqual(["000001", "000002"]);
    expect(shortIdOf(older)).toBe("000002");
  });

  it("adds the open run as the run view read it, for a run just started that the flow's runs don't have yet", () => {
    const justStarted = run("00b5e7", 10);
    const { menuRuns, older, newer } = getSwitcherRuns(
      runs,
      idOf("00b5e7"),
      justStarted,
    );

    expect(shortIdsOf(menuRuns)).toEqual([
      "00B5E7",
      "0000A8",
      "000C55",
      "00002A",
      "000E90",
      "00001C",
    ]);
    expect(shortIdOf(older)).toBe("0000A8");
    expect(newer).toBeNull();
  });

  it("takes the open run as the run view read it over its entry in the flow's runs", () => {
    const { menuRuns } = getSwitcherRuns(runs, idOf("00002a"), {
      ...run("00002a", 7),
      status: FlowRunStatus.Cancelled,
    });

    expect(menuRuns.map(({ status }) => status)).toEqual([
      FlowRunStatus.Completed,
      FlowRunStatus.Completed,
      FlowRunStatus.Cancelled,
      FlowRunStatus.Completed,
      FlowRunStatus.Completed,
      FlowRunStatus.Completed,
    ]);
  });
});
