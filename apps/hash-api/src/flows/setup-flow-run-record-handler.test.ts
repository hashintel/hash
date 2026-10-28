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

import {
  getFlowRunRecordUrl,
  setupFlowRunRecordHandler,
} from "./setup-flow-run-record-handler";

import type { ActorEntityUuid, EntityId } from "@blockprotocol/type-system";
import type { FileStorageProvider } from "@local/hash-backend-utils/file-storage";
import type { TemporalClient } from "@local/hash-backend-utils/temporal";
import type { GraphApi } from "@local/hash-graph-client";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type { FlowRun } from "@local/hash-isomorphic-utils/system-types/shared";
import type { Express, Request, Response } from "express";

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

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetFlowRunEntityById.mockResolvedValue({
    properties: {
      "https://hash.ai/@h/types/property-type/workflow-id/": workflowId,
    },
  } as HashEntity<FlowRun>);
});

describe("getFlowRunRecordUrl", () => {
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

describe("setupFlowRunRecordHandler", () => {
  const flowRunEntityId =
    "f3a8c1d2-6b4e-4f7a-9c2d-1e5b8a7f6c3d~0b9e2a4c-7d1f-4e8b-a6c3-5f2d9e1b8a7c";

  const callRoute = async ({
    entityId = flowRunEntityId,
    query = {},
  }: {
    entityId?: string;
    query?: Record<string, string>;
  } = {}) => {
    let handler:
      | ((request: Request, response: Response) => Promise<void>)
      | undefined;
    setupFlowRunRecordHandler({
      get: (_path: string, routeHandler: typeof handler) => {
        handler = routeHandler;
      },
    } as unknown as Express);

    let statusCode = 200;
    let body: unknown;
    let redirectedTo: string | undefined;
    const response = {
      status: (value: number) => {
        statusCode = value;
        return response;
      },
      json: (value: unknown) => {
        body = value;
        return response;
      },
      redirect: (url: string) => {
        statusCode = 302;
        redirectedTo = url;
      },
    } as unknown as Response;

    await handler!(
      {
        params: { flowRunEntityId: entityId },
        query,
        context: {
          graphApi: {},
          temporalClient: {},
          uploadProvider: { presignDownloadByKey },
        },
      } as unknown as Request,
      response,
    );

    return { statusCode, body, redirectedTo };
  };

  it("rejects an invalid entity id without looking up the run", async () => {
    await expect(callRoute({ entityId: "not-an-entity-id" })).resolves.toEqual(
      expect.objectContaining({ statusCode: 400 }),
    );
    expect(mockedGetFlowRunEntityById).not.toHaveBeenCalled();
  });

  it("responds 404 for a run the user can't view", async () => {
    mockedGetFlowRunEntityById.mockResolvedValue(null);

    await expect(callRoute()).resolves.toEqual(
      expect.objectContaining({ statusCode: 404 }),
    );
  });

  it("responds 409 for a running run", async () => {
    mockedGetStoredFlowRunRecordKey.mockResolvedValue(null);

    await expect(callRoute()).resolves.toEqual(
      expect.objectContaining({ statusCode: 409 }),
    );
  });

  it("redirects to the record of an ended run", async () => {
    mockedGetStoredFlowRunRecordKey.mockResolvedValue(key);

    await expect(callRoute()).resolves.toStrictEqual({
      statusCode: 302,
      body: undefined,
      redirectedTo: `https://storage.example/${key}`,
    });
  });

  it("gives the URL instead with `urlOnly`", async () => {
    mockedGetStoredFlowRunRecordKey.mockResolvedValue(key);

    await expect(
      callRoute({ query: { urlOnly: "true" } }),
    ).resolves.toStrictEqual({
      statusCode: 200,
      body: { url: `https://storage.example/${key}` },
      redirectedTo: undefined,
    });
  });
});
