import { NetworkStatus } from "@apollo/client";
import { describe, expect, it } from "vitest";

import { FlowRunStatus } from "../../../../../../../graphql/api-types.gen";
import { loadAllRuns, loadRecentRuns } from "./use-flow-runs";

import type { GetFlowDefinitionRunsQuery } from "../../../../../../../graphql/api-types.gen";
import type { FlowRunsClient } from "./use-flow-runs";
import type { EntityId, WebId } from "@blockprotocol/type-system";

type Page = GetFlowDefinitionRunsQuery["getFlowRuns"];
type Run = Page["flowRuns"][number];

const webId = "0b5a5c4c-6d4d-4cd8-9d5e-2f2b0f7a6a11" as WebId;
const flowDefinitionEntityId =
  `${webId}~1a2b3c4d-0000-4000-8000-000000000000` as EntityId;

/** A run, by the last characters of its uuid, as a page of the API's response holds it. */
const run = (idEnd: string, overrides: Partial<Run> = {}): Run => ({
  __typename: "FlowRunSummary",
  flowRunEntityId:
    `${webId}~7f9d2b1e-3c4a-4e5f-8a6b-9c0d1e${idEnd}` as EntityId,
  flowScheduleId: null,
  webId,
  status: FlowRunStatus.Completed,
  startedAt: "2026-11-09T08:00:00Z",
  closedAt: "2026-11-09T08:05:00Z",
  updatedAt: "2026-11-09T08:05:00Z",
  openInputRequests: [],
  ...overrides,
});

const page = (
  runs: Run[],
  nextCursor: string | null,
  totalCount = 0,
): Page => ({
  __typename: "PaginatedFlowRuns",
  flowRuns: runs,
  nextCursor,
  totalCount,
});

/** A client that answers each query with the next of `pages`, and records the cursor each asked for. */
const clientServing = (pages: Page[]) => {
  const cursorsAsked: (string | null | undefined)[] = [];

  const client: FlowRunsClient = {
    query: ({ variables }) => {
      cursorsAsked.push(variables?.cursor);

      const served = pages[cursorsAsked.length - 1];

      if (!served) {
        return Promise.reject(
          new Error(`No page ${cursorsAsked.length} to serve`),
        );
      }

      return Promise.resolve({
        data: { getFlowRuns: served },
        loading: false,
        networkStatus: NetworkStatus.ready,
      });
    },
    readQuery: () => null,
  };

  return { client, cursorsAsked };
};

describe("loadAllRuns", () => {
  it("follows the cursor through every page, from the first", async () => {
    const { client, cursorsAsked } = clientServing([
      page([run("0001"), run("0002")], "after-0002"),
      page([run("0003")], "after-0003"),
      page([], null),
    ]);

    const runs = await loadAllRuns(
      client,
      flowDefinitionEntityId,
      "network-only",
    );

    expect(cursorsAsked).toEqual([null, "after-0002", "after-0003"]);
    expect(runs.map(({ flowRunEntityId }) => flowRunEntityId)).toEqual([
      run("0001").flowRunEntityId,
      run("0002").flowRunEntityId,
      run("0003").flowRunEntityId,
    ]);
  });

  it("keeps a run read on two pages once, as last read", async () => {
    const { client } = clientServing([
      page(
        [run("0001", { status: FlowRunStatus.Running, closedAt: null })],
        "after-0001",
      ),
      page([run("0002"), run("0001")], null),
    ]);

    const runs = await loadAllRuns(
      client,
      flowDefinitionEntityId,
      "network-only",
    );

    expect(runs).toHaveLength(2);
    expect(
      runs.find(
        ({ flowRunEntityId }) =>
          flowRunEntityId === run("0001").flowRunEntityId,
      )?.status,
    ).toBe(FlowRunStatus.Completed);
  });
});

describe("loadRecentRuns", () => {
  it("reads pages until one reaches a run that changed before the latest change read, updating and adding runs", async () => {
    const { client, cursorsAsked } = clientServing([
      page(
        [
          run("0003", { updatedAt: "2026-11-09T08:20:00Z" }),
          run("0001", { updatedAt: "2026-11-09T08:10:00Z" }),
        ],
        "after-0001",
      ),
      page(
        [
          run("0004", { updatedAt: "2026-11-09T08:06:00Z" }),
          run("0005", { updatedAt: "2026-11-09T08:05:00Z" }),
          run("0002", { updatedAt: "2026-11-09T08:03:00Z" }),
        ],
        "after-0002",
        5,
      ),
    ]);

    const runs = await loadRecentRuns(client, flowDefinitionEntityId, [
      run("0001", {
        status: FlowRunStatus.Running,
        closedAt: null,
        updatedAt: "2026-11-09T08:01:00Z",
      }),
      run("0002", { updatedAt: "2026-11-09T08:03:00Z" }),
      run("0005", { updatedAt: "2026-11-09T08:05:00Z" }),
    ]);

    expect(cursorsAsked).toEqual([null, "after-0001"]);
    expect(
      runs.map(({ flowRunEntityId, status }) => [flowRunEntityId, status]),
    ).toEqual([
      [run("0001").flowRunEntityId, FlowRunStatus.Completed],
      [run("0002").flowRunEntityId, FlowRunStatus.Completed],
      [run("0005").flowRunEntityId, FlowRunStatus.Completed],
      [run("0003").flowRunEntityId, FlowRunStatus.Completed],
      [run("0004").flowRunEntityId, FlowRunStatus.Completed],
    ]);
  });

  it("reads every page when no runs were read before", async () => {
    const { client, cursorsAsked } = clientServing([
      page([run("0001")], "after-0001", 2),
      page([run("0002")], null, 2),
    ]);

    const runs = await loadRecentRuns(client, flowDefinitionEntityId, []);

    expect(cursorsAsked).toEqual([null, "after-0001"]);
    expect(runs).toHaveLength(2);
  });

  it("reads every page again when a run read before is gone", async () => {
    const recentPage = page(
      [
        run("0003", { updatedAt: "2026-11-09T08:20:00Z" }),
        run("0001", { updatedAt: "2026-11-09T08:01:00Z" }),
      ],
      null,
      2,
    );
    const { client, cursorsAsked } = clientServing([recentPage, recentPage]);

    const runs = await loadRecentRuns(client, flowDefinitionEntityId, [
      run("0001", { updatedAt: "2026-11-09T08:01:00Z" }),
      run("0002", { updatedAt: "2026-11-09T08:05:00Z" }),
    ]);

    expect(cursorsAsked).toEqual([null, null]);
    expect(runs.map(({ flowRunEntityId }) => flowRunEntityId)).toEqual([
      run("0003").flowRunEntityId,
      run("0001").flowRunEntityId,
    ]);
  });
});
