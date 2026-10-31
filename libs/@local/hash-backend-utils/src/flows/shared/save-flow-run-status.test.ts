import { describe, expect, it } from "vitest";

import { FlowRunStatus } from "@local/hash-isomorphic-utils/graphql/api-types.gen";

import {
  getFlowRunStatusFieldsToCorrect,
  getFlowRunStatusPatches,
} from "./save-flow-run-status.js";

import type { FlowRun as FlowRunEntity } from "@local/hash-isomorphic-utils/system-types/shared";

const entityHolding = (
  properties: Partial<FlowRunEntity["properties"]>,
): Pick<FlowRunEntity, "properties"> => ({
  properties: properties as FlowRunEntity["properties"],
});

const runningEntity = entityHolding({
  "https://hash.ai/@h/types/property-type/status/": FlowRunStatus.Running,
  "https://hash.ai/@h/types/property-type/started-at/":
    "2026-10-26T10:00:00.000Z",
});

const completedEntity = entityHolding({
  "https://hash.ai/@h/types/property-type/status/": FlowRunStatus.Completed,
  "https://hash.ai/@h/types/property-type/started-at/":
    "2026-10-26T10:00:00.000Z",
  "https://hash.ai/@h/types/property-type/closed-at/":
    "2026-10-26T10:05:00.000Z",
});

const patchedPaths = (patches: ReturnType<typeof getFlowRunStatusPatches>) =>
  patches.map(({ op, path }) => `${op} ${path.join(".")}`);

describe("getFlowRunStatusPatches", () => {
  it("patches nothing when the entity holds the status, whatever moment its close time is from", () => {
    expect(
      getFlowRunStatusPatches(completedEntity, {
        status: FlowRunStatus.Completed,
        closedAt: "2026-10-26T10:05:01.000Z",
      }),
    ).toEqual([]);
  });

  it("saves the status and close time of a run that ended without saving them", () => {
    expect(
      patchedPaths(
        getFlowRunStatusPatches(runningEntity, {
          status: FlowRunStatus.Terminated,
          closedAt: "2026-10-26T10:07:00.000Z",
        }),
      ),
    ).toEqual([
      "add https://hash.ai/@h/types/property-type/status/",
      "add https://hash.ai/@h/types/property-type/closed-at/",
    ]);
  });

  it("reopens a run that was reset after it ended", () => {
    expect(
      patchedPaths(
        getFlowRunStatusPatches(completedEntity, {
          status: FlowRunStatus.Running,
        }),
      ),
    ).toEqual([
      "add https://hash.ai/@h/types/property-type/status/",
      "remove https://hash.ai/@h/types/property-type/closed-at/",
    ]);
  });
});

describe("getFlowRunStatusFieldsToCorrect", () => {
  const runningHeader = {
    workflowId: "workflow-1",
    runId: "run-1",
    status: FlowRunStatus.Running,
    startedAt: "2026-10-26T10:00:00.000Z",
  };

  it("doesn't reopen a run read between saving how it ended and closing", () => {
    expect(
      getFlowRunStatusFieldsToCorrect(completedEntity, runningHeader),
    ).toBeNull();
  });

  it("reopens a run reset after it ended", () => {
    expect(
      getFlowRunStatusFieldsToCorrect(completedEntity, {
        ...runningHeader,
        runId: "run-2",
        startedAt: "2026-10-26T11:00:00.000Z",
      }),
    ).toEqual({ status: FlowRunStatus.Running });
  });
});
