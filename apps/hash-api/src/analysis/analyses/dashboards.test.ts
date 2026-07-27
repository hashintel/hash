import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  generateDashboardItemConfigHash,
  getDashboardItemDataStorageKey,
} from "@local/hash-backend-utils/dashboards";

import type {
  ActorEntityUuid,
  MachineId,
  RoleName,
  WebId,
} from "@blockprotocol/type-system";
import type { FileStorageProvider } from "@local/hash-backend-utils/file-storage";
import type Keyv from "keyv";

vi.mock("@local/hash-graph-sdk/principal/actor-group", () => ({
  getActorGroupRole: vi.fn(),
}));

vi.mock("@local/hash-backend-utils/machine-actors", () => ({
  getWebMachineId: vi.fn(),
}));

vi.mock("@local/hash-graph-sdk/entity", () => ({
  queryEntities: vi.fn(),
}));

vi.mock("../../logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { getWebMachineId } from "@local/hash-backend-utils/machine-actors";
import { queryEntities } from "@local/hash-graph-sdk/entity";
import { getActorGroupRole } from "@local/hash-graph-sdk/principal/actor-group";
import { systemPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { resolveInvocation } from "../setup-analysis-handler/resolve-analysis";
import {
  clearAnalysisRegistry,
  registerAnalyses,
} from "../shared/analysis-registry";
import { dashboardAnalyses } from "./dashboards";

import type { GraphApi } from "../../graph/context-types";
import type { TemporalClient } from "@local/hash-backend-utils/temporal";

const mockedGetRole = vi.mocked(getActorGroupRole);
const mockedGetWebMachineId = vi.mocked(getWebMachineId);
const mockedQueryEntities = vi.mocked(queryEntities);

const WEB_ID = "00000000-0000-4000-8000-000000000001" as WebId;
const ACTOR_ID = "00000000-0000-4000-8000-0000000000aa" as ActorEntityUuid;
const WEB_MACHINE_ID = "00000000-0000-4000-8000-0000000000bb" as MachineId;
const ITEM_UUID = "00000000-0000-4000-8000-00000000feed";

const structuralQuery = {
  all: [
    {
      equal: [
        { path: ["type", "baseUrl"] },
        { parameter: "https://hash.ai/@h/types/entity-type/crm-deal/" },
      ],
    },
  ],
};
const pythonScript = "print('[]')";

const configHash = generateDashboardItemConfigHash({
  structuralQuery,
  pythonScript,
});
const storageKey = getDashboardItemDataStorageKey({
  webId: WEB_ID,
  configHash,
});

const itemEntity = {
  properties: {
    [systemPropertyTypes.structuralQuery.propertyTypeBaseUrl]: structuralQuery,
    [systemPropertyTypes.pythonScript.propertyTypeBaseUrl]: pythonScript,
    [systemPropertyTypes.configurationStatus.propertyTypeBaseUrl]: "ready",
  },
};

const workflowStart = vi.fn();
const workflowDescribe = vi.fn();
const workflowResult = vi.fn();
const workflowGetHandle = vi.fn(() => ({
  describe: workflowDescribe,
  result: workflowResult,
}));

const temporalClient = {
  workflow: { start: workflowStart, getHandle: workflowGetHandle },
} as unknown as TemporalClient;

/** Per-test control over the artifact's last-modified timestamp. */
let artifactLastModified: Date | null = null;
let artifactMetadata: Buffer | null = null;

const uploadProvider = {
  getObjectLastModified: async () => artifactLastModified,
  downloadDirect: async () => {
    if (!artifactMetadata) {
      throw new Error("Object not found");
    }
    return artifactMetadata;
  },
  presignDownloadByKey: async ({ key }: { key: string }) =>
    `https://signed.example/${key}`,
} as unknown as FileStorageProvider;

const cache = {
  get: async () => undefined,
  set: async () => true,
} as unknown as Keyv;

const resolve = (args: Record<string, unknown>) =>
  resolveInvocation({
    invocation: {
      id: "test",
      analysis: "dashboardItemData",
      args,
      webId: WEB_ID,
    },
    actorId: ACTOR_ID,
    graphApi: {} as GraphApi,
    temporalClient,
    uploadProvider,
    cache,
  });

describe("generateDashboardItemConfigHash", () => {
  it("hashes a legacy bare filter and its definition wrapper identically", () => {
    const wrappedHash = generateDashboardItemConfigHash({
      structuralQuery: { filter: structuralQuery, traversalPaths: [] },
      pythonScript,
    });
    expect(wrappedHash).toBe(configHash);
  });

  it("ignores UI-only traversal path labels", () => {
    const traversalPaths = [
      {
        edges: [
          { kind: "has-left-entity", direction: "incoming" },
          { kind: "has-right-entity", direction: "outgoing" },
        ],
      },
    ];

    const withoutLabel = generateDashboardItemConfigHash({
      structuralQuery: { filter: structuralQuery, traversalPaths },
      pythonScript,
    });
    const withLabel = generateDashboardItemConfigHash({
      structuralQuery: {
        filter: structuralQuery,
        traversalPaths: [
          { ...traversalPaths[0], label: "Associated with → Account" },
        ],
      },
      pythonScript,
    });

    expect(withLabel).toBe(withoutLabel);
    // Traversal paths themselves do change the hash
    expect(withoutLabel).not.toBe(configHash);
  });
});

describe("dashboardItemData analysis", () => {
  beforeEach(() => {
    clearAnalysisRegistry();
    registerAnalyses(dashboardAnalyses);

    mockedGetRole.mockReset();
    mockedGetRole.mockResolvedValue("member" as RoleName);

    mockedGetWebMachineId.mockReset();
    mockedGetWebMachineId.mockResolvedValue(WEB_MACHINE_ID);

    mockedQueryEntities.mockReset();
    mockedQueryEntities.mockResolvedValue({
      entities: [itemEntity],
    } as unknown as Awaited<ReturnType<typeof queryEntities>>);

    workflowStart.mockReset();
    workflowStart.mockResolvedValue({});
    workflowGetHandle.mockClear();
    workflowDescribe.mockReset();
    workflowDescribe.mockResolvedValue({ status: { name: "RUNNING" } });
    workflowResult.mockReset();
    workflowResult.mockResolvedValue({});

    artifactLastModified = null;
    artifactMetadata = null;
  });

  it("rejects a non-uuid itemUuid", async () => {
    const result = await resolve({ itemUuid: "../not-a-uuid" });
    expect(result.status).toBe("error");
    expect(result.error).toMatch(/itemUuid/i);
    expect(mockedQueryEntities).not.toHaveBeenCalled();
  });

  it("errors when the item does not exist in the web", async () => {
    mockedQueryEntities.mockResolvedValue({
      entities: [],
    } as unknown as Awaited<ReturnType<typeof queryEntities>>);

    const result = await resolve({ itemUuid: ITEM_UUID });
    expect(result.status).toBe("error");
    expect(result.error).toMatch(/unknown dashboard item/i);
  });

  it("errors when the item is not fully configured", async () => {
    mockedQueryEntities.mockResolvedValue({
      entities: [{ properties: {} }],
    } as unknown as Awaited<ReturnType<typeof queryEntities>>);

    const result = await resolve({ itemUuid: ITEM_UUID });
    expect(result.status).toBe("error");
    expect(result.error).toMatch(/not fully configured/i);
  });

  it("waits without computing the stale configuration while the item is configuring", async () => {
    mockedQueryEntities.mockResolvedValue({
      entities: [
        {
          properties: {
            ...itemEntity.properties,
            [systemPropertyTypes.configurationStatus.propertyTypeBaseUrl]:
              "configuring",
          },
        },
      ],
    } as unknown as Awaited<ReturnType<typeof queryEntities>>);

    const result = await resolve({ itemUuid: ITEM_UUID });

    expect(result.status).toBe("computing");
    expect(result.retryAfterMs).toBeGreaterThan(0);
    expect(workflowStart).not.toHaveBeenCalled();
  });

  it("starts the compute workflow and returns computing when no artifact exists", async () => {
    const result = await resolve({ itemUuid: ITEM_UUID });

    expect(result.status).toBe("computing");
    expect(result.retryAfterMs).toBeGreaterThan(0);
    expect(workflowStart).toHaveBeenCalledTimes(1);

    const [workflowName, options] = workflowStart.mock.calls[0]!;
    expect(workflowName).toBe("computeDashboardItemData");
    expect(options.workflowId).toBe(
      `compute-dashboard-item-${WEB_ID}-${configHash}`,
    );
    expect(options.workflowIdReusePolicy).toBe("REJECT_DUPLICATE");
    expect(options.args[0]).toMatchObject({
      authentication: { actorId: WEB_MACHINE_ID },
      webId: WEB_ID,
      pythonScript,
      storageKey,
    });
  });

  it("does not compute without a web machine", async () => {
    mockedGetWebMachineId.mockResolvedValue(null);

    const result = await resolve({ itemUuid: ITEM_UUID });

    expect(result.status).toBe("error");
    expect(workflowStart).not.toHaveBeenCalled();
  });

  it("serves a fresh artifact without recomputing", async () => {
    artifactLastModified = new Date();
    artifactMetadata = Buffer.from(
      JSON.stringify({
        generatedAt: "2026-07-16T09:59:59.000Z",
        generationDurationMs: 12_345,
      }),
    );

    const result = await resolve({ itemUuid: ITEM_UUID });

    expect(result.status).toBe("ready");
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts![0]!.url).toContain(configHash);
    expect(result.metadata).toEqual({
      generatedAt: "2026-07-16T09:59:59.000Z",
      generationDurationMs: 12_345,
      isRefreshing: false,
    });
    expect(workflowStart).not.toHaveBeenCalled();
  });

  it("serves a stale artifact but kicks off a background recompute", async () => {
    artifactLastModified = new Date(Date.now() - 60 * 60 * 1000); // 1h old
    const staleArtifactLastModified = artifactLastModified;

    const result = await resolve({ itemUuid: ITEM_UUID });

    expect(result.status).toBe("ready");
    expect(result.metadata).toMatchObject({ isRefreshing: true });
    expect(workflowStart).toHaveBeenCalledTimes(1);
    expect(workflowStart.mock.calls[0]![1].workflowId).toBe(
      `compute-dashboard-item-${WEB_ID}-${configHash}-${staleArtifactLastModified.getTime()}`,
    );
  });

  it("recomputes even a fresh artifact when force is set", async () => {
    artifactLastModified = new Date();
    artifactMetadata = Buffer.from(
      JSON.stringify({ generationDurationMs: 5_000 }),
    );

    const result = await resolve({ itemUuid: ITEM_UUID, force: true });

    expect(result.status).toBe("computing");
    expect(result.metadata).toMatchObject({
      generationDurationMs: 5_000,
      isRefreshing: true,
    });
    expect(workflowStart).toHaveBeenCalledTimes(1);
  });

  it("waits for a forced refresh to supersede the previous artifact", async () => {
    artifactLastModified = new Date();
    const initialResult = await resolve({ itemUuid: ITEM_UUID, force: true });
    const refreshAfter = initialResult.metadata?.refreshAfter as string;

    const waitingResult = await resolve({ itemUuid: ITEM_UUID, refreshAfter });
    expect(waitingResult.status).toBe("computing");

    artifactLastModified = new Date(new Date(refreshAfter).getTime() + 1_000);
    const completedResult = await resolve({
      itemUuid: ITEM_UUID,
      refreshAfter,
    });
    expect(completedResult.status).toBe("ready");
  });

  it("falls back to artifact last-modified when metadata is corrupt", async () => {
    artifactLastModified = new Date();
    artifactMetadata = Buffer.from("{not-json");

    const result = await resolve({ itemUuid: ITEM_UUID });

    expect(result.status).toBe("ready");
    expect(result.metadata).toEqual({
      generatedAt: artifactLastModified.toISOString(),
      isRefreshing: false,
    });
  });

  it("treats an already-started workflow as computing (dedupe)", async () => {
    workflowStart.mockRejectedValue(
      new WorkflowExecutionAlreadyStartedError(
        "already started",
        `compute-dashboard-item-${WEB_ID}-${configHash}`,
        "computeDashboardItemData",
      ),
    );

    const result = await resolve({ itemUuid: ITEM_UUID });

    expect(result.status).toBe("computing");
    expect(workflowDescribe).toHaveBeenCalledTimes(1);
    expect(workflowResult).not.toHaveBeenCalled();
  });

  it("returns a completed workflow's artifact when it becomes available", async () => {
    workflowStart.mockRejectedValue(
      new WorkflowExecutionAlreadyStartedError(
        "already started",
        `compute-dashboard-item-${WEB_ID}-${configHash}`,
        "computeDashboardItemData",
      ),
    );
    workflowDescribe.mockResolvedValue({ status: { name: "COMPLETED" } });
    workflowResult.mockImplementation(async () => {
      artifactLastModified = new Date();
      return {};
    });

    const result = await resolve({ itemUuid: ITEM_UUID });

    expect(result.status).toBe("ready");
    expect(result.artifacts).toHaveLength(1);
    expect(workflowResult).toHaveBeenCalledTimes(1);
  });

  it("errors when a completed workflow did not produce an artifact", async () => {
    workflowStart.mockRejectedValue(
      new WorkflowExecutionAlreadyStartedError(
        "already started",
        `compute-dashboard-item-${WEB_ID}-${configHash}`,
        "computeDashboardItemData",
      ),
    );
    workflowDescribe.mockResolvedValue({ status: { name: "COMPLETED" } });

    const result = await resolve({ itemUuid: ITEM_UUID });

    expect(result.status).toBe("error");
    expect(result.error).toMatch(/without producing a chart data artifact/i);
    expect(workflowResult).toHaveBeenCalledTimes(1);
  });

  it("surfaces the result of a failed workflow without starting another run", async () => {
    workflowStart.mockRejectedValue(
      new WorkflowExecutionAlreadyStartedError(
        "already started",
        `compute-dashboard-item-${WEB_ID}-${configHash}`,
        "computeDashboardItemData",
      ),
    );
    workflowDescribe.mockResolvedValue({ status: { name: "FAILED" } });
    workflowResult.mockRejectedValue(
      new Error("Python script did not print valid JSON"),
    );

    const result = await resolve({ itemUuid: ITEM_UUID });

    expect(result.status).toBe("error");
    expect(result.error).toMatch(/did not print valid JSON/);
    expect(workflowStart).toHaveBeenCalledTimes(1);
    expect(workflowResult).toHaveBeenCalledTimes(1);
  });

  it("denies access when the actor has no role in the web", async () => {
    mockedGetRole.mockResolvedValue(null);

    const result = await resolve({ itemUuid: ITEM_UUID });

    expect(result.status).toBe("error");
    expect(result.error).toMatch(/access/i);
    expect(workflowStart).not.toHaveBeenCalled();
  });
});
