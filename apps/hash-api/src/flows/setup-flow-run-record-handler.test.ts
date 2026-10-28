import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@local/hash-backend-utils/flows", () => ({
  getFlowRunEntityById: vi.fn(),
}));

vi.mock(
  "@local/hash-backend-utils/flows/run-record",
  async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    getStoredFlowRunRecordKey: vi.fn(),
  }),
);

import { getFlowRunEntityById } from "@local/hash-backend-utils/flows";
import {
  FlowRunRecordNotFoundError,
  getStoredFlowRunRecordKey,
} from "@local/hash-backend-utils/flows/run-record";

import { getFlowRunRecordUrl } from "./setup-flow-run-record-handler";

import type { ActorEntityUuid, EntityId } from "@blockprotocol/type-system";
import type { FileStorageProvider } from "@local/hash-backend-utils/file-storage";
import type { TemporalClient } from "@local/hash-backend-utils/temporal";
import type { GraphApi } from "@local/hash-graph-client";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type { FlowRun } from "@local/hash-isomorphic-utils/system-types/shared";

const mockedGetFlowRunEntityById = vi.mocked(getFlowRunEntityById);
const mockedGetStoredFlowRunRecordKey = vi.mocked(getStoredFlowRunRecordKey);

const workflowId = "workflow-id";
const key = `flows/${workflowId}/run.jsonl`;

const presignDownloadByKey = vi.fn(({ key: presignedKey }: { key: string }) =>
  Promise.resolve(`https://storage.example/${presignedKey}`),
);

const params = {
  flowRunEntityId: "web~run" as EntityId,
  graphApiClient: {} as GraphApi,
  storageProvider: { presignDownloadByKey } as unknown as FileStorageProvider,
  temporalClient: {} as TemporalClient,
  userAuthentication: { actorId: "actor" as ActorEntityUuid },
};

describe("getFlowRunRecordUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetFlowRunEntityById.mockResolvedValue({
      properties: {
        "https://hash.ai/@h/types/property-type/workflow-id/": workflowId,
      },
    } as HashEntity<FlowRun>);
  });

  it("finds nothing for a run the user can't view", async () => {
    mockedGetFlowRunEntityById.mockResolvedValue(null);

    await expect(getFlowRunRecordUrl(params)).resolves.toStrictEqual({
      status: "notFound",
    });
    expect(mockedGetStoredFlowRunRecordKey).not.toHaveBeenCalled();
  });

  it("finds nothing for a run with no record left", async () => {
    mockedGetStoredFlowRunRecordKey.mockRejectedValue(
      new FlowRunRecordNotFoundError(workflowId),
    );

    await expect(getFlowRunRecordUrl(params)).resolves.toStrictEqual({
      status: "notFound",
    });
  });

  it("gives no URL for a running run", async () => {
    mockedGetStoredFlowRunRecordKey.mockResolvedValue(null);

    await expect(getFlowRunRecordUrl(params)).resolves.toStrictEqual({
      status: "running",
    });
    expect(presignDownloadByKey).not.toHaveBeenCalled();
  });

  it("gives a short-lived URL for the record of an ended run", async () => {
    mockedGetStoredFlowRunRecordKey.mockResolvedValue(key);

    await expect(getFlowRunRecordUrl(params)).resolves.toStrictEqual({
      status: "found",
      url: `https://storage.example/${key}`,
    });
    expect(mockedGetStoredFlowRunRecordKey).toHaveBeenCalledWith(
      expect.objectContaining({ workflowId }),
    );
    expect(presignDownloadByKey).toHaveBeenCalledWith({
      key,
      expiresInSeconds: 300,
    });
  });

  it("passes on other errors", async () => {
    mockedGetStoredFlowRunRecordKey.mockRejectedValue(
      new Error("Temporal down"),
    );

    await expect(getFlowRunRecordUrl(params)).rejects.toThrow("Temporal down");
  });
});
