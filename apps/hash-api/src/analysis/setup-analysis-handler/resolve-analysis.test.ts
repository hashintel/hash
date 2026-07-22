import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ActorEntityUuid,
  RoleName,
  WebId,
} from "@blockprotocol/type-system";
import type { FileStorageProvider } from "@local/hash-backend-utils/file-storage";
import type Keyv from "keyv";

vi.mock("@local/hash-graph-sdk/principal/actor-group", () => ({
  getActorGroupRole: vi.fn(),
}));

vi.mock("../../logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { getActorGroupRole } from "@local/hash-graph-sdk/principal/actor-group";

import { supplyChainAnalyses } from "../analyses/supply-chain";
import {
  clearAnalysisRegistry,
  registerAnalyses,
} from "../shared/analysis-registry";
import { resolveInvocation } from "./resolve-analysis";

import type { GraphApi } from "../../graph/context-types";
import type { TemporalClient } from "@local/hash-backend-utils/temporal";

const mockedGetRole = vi.mocked(getActorGroupRole);

const temporalClient = {} as TemporalClient;

const WEB_ID = "00000000-0000-4000-8000-000000000001" as WebId;
const ACTOR_ID = "actor-test" as ActorEntityUuid;
const VERSION = "2026-06-15";

const manifest = {
  datasetVersion: VERSION,
  products: ["democat-x100-extr"],
  productionSchedules: ["democat-x100-extr"],
  sites: ["demo-plant"],
  steps: { "democat-x100-extr": ["prod_to_qa_pla"] },
};

const storedFiles: Record<string, string> = {
  [`analysis/${WEB_ID}/supply-chain/current.json`]: JSON.stringify({
    datasetVersion: VERSION,
  }),
  [`analysis/${WEB_ID}/supply-chain/${VERSION}/manifest.json`]:
    JSON.stringify(manifest),
};

const uploadProvider = {
  downloadDirect: async ({ key }: { key: string }) => {
    const value = storedFiles[key];
    if (value === undefined) {
      throw new Error(`missing: ${key}`);
    }
    return Buffer.from(value);
  },
  presignDownloadByKey: async ({ key }: { key: string }) =>
    `https://signed.example/${key}`,
} as unknown as FileStorageProvider;

const cache = {
  get: async () => undefined,
  set: async () => true,
} as unknown as Keyv;

const resolve = (
  analysis: string,
  args: Record<string, unknown> = {},
  webId: WebId = WEB_ID,
) =>
  resolveInvocation({
    invocation: { id: "test", analysis, args, webId },
    actorId: ACTOR_ID,
    graphApi: {} as GraphApi,
    temporalClient,
    uploadProvider,
    cache,
  });

describe("resolveInvocation (supply-chain analyses)", () => {
  beforeEach(() => {
    clearAnalysisRegistry();
    registerAnalyses(supplyChainAnalyses);
    mockedGetRole.mockReset();
    mockedGetRole.mockResolvedValue("member" as RoleName);
  });

  it("resolves productGraph to a presigned graph artifact", async () => {
    const result = await resolve("productGraph", {
      productId: "democat-x100-extr",
    });

    expect(result.status).toBe("ready");
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts![0]!.name).toBe("graph");
    expect(result.artifacts![0]!.url).toContain(
      `${VERSION}/democat-x100-extr/graph.json`,
    );
    expect(result.artifacts![0]!.expiresAt).toBeDefined();
  });

  it("resolves stepDetail when the step is in the manifest", async () => {
    const result = await resolve("stepDetail", {
      productId: "democat-x100-extr",
      stepId: "prod_to_qa_pla",
    });
    expect(result.status).toBe("ready");
    expect(result.artifacts![0]!.url).toContain(
      "democat-x100-extr/steps/prod_to_qa_pla.json",
    );
  });

  it("resolves a production schedule explicitly listed in the manifest", async () => {
    const result = await resolve("productionSchedule", {
      productId: "democat-x100-extr",
    });
    expect(result.status).toBe("ready");
    expect(result.artifacts![0]!.name).toBe("schedule");
    expect(result.artifacts![0]!.url).toContain(
      "democat-x100-extr/production_schedule.json",
    );
  });

  it("fails closed when a product has no production schedule", async () => {
    const original =
      storedFiles[`analysis/${WEB_ID}/supply-chain/${VERSION}/manifest.json`]!;
    storedFiles[`analysis/${WEB_ID}/supply-chain/${VERSION}/manifest.json`] =
      JSON.stringify({ ...manifest, productionSchedules: undefined });
    try {
      const result = await resolve("productionSchedule", {
        productId: "democat-x100-extr",
      });
      expect(result.status).toBe("error");
      expect(result.error).toMatch(/schedule unavailable/i);
    } finally {
      storedFiles[`analysis/${WEB_ID}/supply-chain/${VERSION}/manifest.json`] =
        original;
    }
  });

  it("errors for an unknown product", async () => {
    const result = await resolve("productGraph", {
      productId: "does-not-exist",
    });
    expect(result.status).toBe("error");
    expect(result.error).toMatch(/unknown product/i);
  });

  it("errors for an unknown step", async () => {
    const result = await resolve("stepDetail", {
      productId: "democat-x100-extr",
      stepId: "nope",
    });
    expect(result.status).toBe("error");
    expect(result.error).toMatch(/unknown step/i);
  });

  it("rejects path-traversal product ids before touching storage", async () => {
    const result = await resolve("productGraph", { productId: "../secrets" });
    expect(result.status).toBe("error");
    expect(result.error).toMatch(/slug/i);
  });

  it("denies access when the actor has no role in the web", async () => {
    mockedGetRole.mockResolvedValue(null);
    const result = await resolve("productGraph", {
      productId: "democat-x100-extr",
    });
    expect(result.status).toBe("error");
    expect(result.error).toMatch(/access/i);
  });

  it("errors for an unknown analysis name", async () => {
    const result = await resolve("noSuchAnalysis");
    expect(result.status).toBe("error");
    expect(result.error).toMatch(/unknown analysis/i);
  });

  it("errors when no webId is supplied", async () => {
    const result = await resolveInvocation({
      invocation: {
        id: "test",
        analysis: "listProducts",
        webId: undefined as unknown as WebId,
      },
      actorId: ACTOR_ID,
      graphApi: {} as GraphApi,
      temporalClient,
      uploadProvider,
      cache,
    });
    expect(result.status).toBe("error");
    expect(result.error).toMatch(/webId/i);
  });

  it("rejects a non-UUID webId before authorising", async () => {
    const result = await resolve("listProducts", {}, "not-a-uuid" as WebId);
    expect(result.status).toBe("error");
    expect(result.error).toMatch(/webId/i);
    expect(mockedGetRole).not.toHaveBeenCalled();
  });

  it("rejects non-object args", async () => {
    const result = await resolveInvocation({
      invocation: {
        id: "test",
        analysis: "listProducts",
        args: [] as unknown as Record<string, unknown>,
        webId: WEB_ID,
      },
      actorId: ACTOR_ID,
      graphApi: {} as GraphApi,
      temporalClient,
      uploadProvider,
      cache,
    });
    expect(result.status).toBe("error");
    expect(result.error).toMatch(/args must be an object/i);
  });

  it("refuses to presign an artifact key outside the authorised web", async () => {
    const otherWebId = "00000000-0000-4000-8000-000000000002";
    clearAnalysisRegistry();
    registerAnalyses([
      {
        name: "escaping",
        resolve: async () => ({
          status: "ready",
          artifacts: [
            {
              name: "leak",
              key: `analysis/${otherWebId}/supply-chain/secret.json`,
            },
          ],
        }),
      },
    ]);

    const result = await resolve("escaping");
    expect(result.status).toBe("error");
    expect(result.error).toMatch(
      /Resolved analysis artifact key outside the authorised web/i,
    );
  });

  it("refuses to presign artifact keys with path traversal segments", async () => {
    const otherWebId = "00000000-0000-4000-8000-000000000002";
    const presignDownloadByKey = vi.fn(async ({ key }: { key: string }) => {
      return `https://signed.example/${key}`;
    });

    clearAnalysisRegistry();
    registerAnalyses([
      {
        name: "traversing",
        resolve: async () => ({
          status: "ready",
          artifacts: [
            {
              name: "leak",
              key: `analysis/${WEB_ID}/../${otherWebId}/secret.json`,
            },
          ],
        }),
      },
    ]);

    const result = await resolveInvocation({
      invocation: {
        id: "test",
        analysis: "traversing",
        args: {},
        webId: WEB_ID,
      },
      actorId: ACTOR_ID,
      graphApi: {} as GraphApi,
      temporalClient,
      uploadProvider: {
        ...uploadProvider,
        presignDownloadByKey,
      } as unknown as FileStorageProvider,
      cache,
    });

    expect(result.status).toBe("error");
    expect(result.error).toMatch(
      /Resolved analysis artifact key outside the authorised web/i,
    );
    expect(presignDownloadByKey).not.toHaveBeenCalled();
  });

  it("refuses to presign an artifact key outside the analysis prefix", async () => {
    clearAnalysisRegistry();
    registerAnalyses([
      {
        name: "oldShape",
        resolve: async () => ({
          status: "ready",
          artifacts: [
            { name: "old-shape", key: `${WEB_ID}/supply-chain/secret.json` },
          ],
        }),
      },
    ]);

    const result = await resolve("oldShape");
    expect(result.status).toBe("error");
    expect(result.error).toMatch(
      /Resolved analysis artifact key outside the authorised web/i,
    );
  });

  it("surfaces artifact metadata storage failures as internal errors", async () => {
    clearAnalysisRegistry();
    registerAnalyses([
      {
        name: "artifactMetadata",
        resolve: async (context) => {
          await context.getArtifactLastModified(
            `analysis/${WEB_ID}/artifact.json`,
          );
          return { status: "ready" };
        },
      },
    ]);

    const result = await resolveInvocation({
      invocation: {
        id: "test",
        analysis: "artifactMetadata",
        args: {},
        webId: WEB_ID,
      },
      actorId: ACTOR_ID,
      graphApi: {} as GraphApi,
      temporalClient,
      uploadProvider: {
        ...uploadProvider,
        getObjectLastModified: async () => {
          throw new Error("Storage unavailable");
        },
      } as unknown as FileStorageProvider,
      cache,
    });

    expect(result.status).toBe("error");
    expect(result.error).toBe("Internal error");
  });
});
