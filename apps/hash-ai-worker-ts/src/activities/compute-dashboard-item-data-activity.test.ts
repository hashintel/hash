import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorEntityUuid, WebId } from "@blockprotocol/type-system";
import type { FileStorageProvider } from "@local/hash-backend-utils/file-storage";
import type { GraphApi } from "@local/hash-graph-client";

vi.mock("@temporalio/activity", () => ({
  Context: {
    current: () => ({
      heartbeat: vi.fn(),
      info: {
        activityId: "test-activity",
        workflowExecution: { workflowId: "test-workflow" },
      },
    }),
  },
}));

vi.mock("@local/hash-graph-sdk/entity", () => ({
  queryEntitySubgraph: vi.fn(),
}));

vi.mock("@local/hash-backend-utils/simplified-graph", () => ({
  getSimpleGraph: vi.fn(),
}));

vi.mock("./shared/run-python-code.js", () => ({
  runPythonCode: vi.fn(),
}));

import { getSimpleGraph } from "@local/hash-backend-utils/simplified-graph";
import { queryEntitySubgraph } from "@local/hash-graph-sdk/entity";

import { computeDashboardItemDataActivity } from "./compute-dashboard-item-data-activity.js";
import { runPythonCode } from "./shared/run-python-code.js";

const mockedQueryEntitySubgraph = vi.mocked(queryEntitySubgraph);
const mockedGetSimpleGraph = vi.mocked(getSimpleGraph);
const mockedRunPythonCode = vi.mocked(runPythonCode);

const WEB_ID = "00000000-0000-4000-8000-000000000001" as WebId;
const ACTOR_ID = "00000000-0000-4000-8000-0000000000aa" as ActorEntityUuid;

const uploadDirect = vi.fn();
const storageProvider = {
  uploadDirect,
} as unknown as FileStorageProvider;

const graphApiClient = {} as GraphApi;

const baseParams = {
  authentication: { actorId: ACTOR_ID },
  webId: WEB_ID,
  structuralQuery: JSON.stringify({ all: [] }),
  pythonScript: "print('[]')",
  storageKey: `analysis/${WEB_ID}/dashboards/abc123.json`,
};

const run = (params: Partial<typeof baseParams> = {}) =>
  computeDashboardItemDataActivity(
    { graphApiClient, storageProvider },
    { ...baseParams, ...params },
  );

describe("computeDashboardItemDataActivity", () => {
  beforeEach(() => {
    mockedQueryEntitySubgraph.mockReset();
    mockedQueryEntitySubgraph.mockResolvedValue({
      subgraph: {},
    } as unknown as Awaited<ReturnType<typeof queryEntitySubgraph>>);

    mockedGetSimpleGraph.mockReset();
    mockedGetSimpleGraph.mockReturnValue({
      entities: [{ properties: { Name: "Deal 1", Amount: 100 } }],
      entityTypes: [{ title: "Deal" }],
    } as unknown as ReturnType<typeof getSimpleGraph>);

    mockedRunPythonCode.mockReset();
    uploadDirect.mockReset();
    uploadDirect.mockResolvedValue(undefined);
  });

  it("queries the graph, runs the script, and writes the artifact", async () => {
    const chartData = [{ category: "A", value: 1 }];
    mockedRunPythonCode.mockResolvedValue({
      stdout: JSON.stringify(chartData),
      stderr: "",
    });

    const result = await run();

    expect(result).toEqual({
      itemCount: 1,
      storageKey: baseParams.storageKey,
    });

    expect(mockedQueryEntitySubgraph).toHaveBeenCalledWith(
      { graphApi: graphApiClient },
      baseParams.authentication,
      expect.objectContaining({
        filter: {
          all: [
            {
              equal: [{ path: ["webId"] }, { parameter: WEB_ID }],
            },
            { all: [] },
          ],
        },
      }),
    );

    // The script receives the simplified entity data as its dataset.
    const pythonCall = mockedRunPythonCode.mock.calls[0]![0];
    expect(pythonCall.code).toBe(baseParams.pythonScript);
    expect(JSON.parse(pythonCall.dataJson)).toMatchObject({
      entities: [{ properties: { Name: "Deal 1" } }],
    });

    expect(uploadDirect).toHaveBeenCalledWith({
      key: baseParams.storageKey,
      body: JSON.stringify(chartData),
      contentType: "application/json",
    });
  });

  it("tolerates warnings on stderr when stdout is valid JSON", async () => {
    mockedRunPythonCode.mockResolvedValue({
      stdout: "[]",
      stderr: "FutureWarning: something is deprecated",
    });

    const result = await run();
    expect(result.itemCount).toBe(0);
    expect(uploadDirect).toHaveBeenCalled();
  });

  it("throws when the structural query is not valid JSON", async () => {
    await expect(run({ structuralQuery: "{nope" })).rejects.toThrow(
      /could not parse structuralQuery/i,
    );
    expect(mockedQueryEntitySubgraph).not.toHaveBeenCalled();
    expect(uploadDirect).not.toHaveBeenCalled();
  });

  it("throws (including stderr) when the script does not print JSON", async () => {
    mockedRunPythonCode.mockResolvedValue({
      stdout: "not json",
      stderr: "Traceback: KeyError 'Amount'",
    });

    await expect(run()).rejects.toThrow(/KeyError 'Amount'/);
    expect(uploadDirect).not.toHaveBeenCalled();
  });

  it("throws when the script prints JSON that is not an array", async () => {
    mockedRunPythonCode.mockResolvedValue({
      stdout: '{"rows": []}',
      stderr: "",
    });

    await expect(run()).rejects.toThrow(/not a JSON array/i);
    expect(uploadDirect).not.toHaveBeenCalled();
  });
});
