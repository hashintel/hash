import { NetworkStatus } from "@apollo/client";
import { describe, expect, it } from "vitest";

import { FlowRunStatus } from "../../../../../../../graphql/api-types.gen";
import { loadAllRuns } from "./use-flow-runs";

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
  openInputRequests: [],
  ...overrides,
});

const page = (runs: Run[], nextCursor: string | null): Page => ({
  __typename: "PaginatedFlowRuns",
  flowRuns: runs,
  nextCursor,
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
