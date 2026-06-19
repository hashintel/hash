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

vi.mock("../logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { getActorGroupRole } from "@local/hash-graph-sdk/principal/actor-group";

import { supplyChainQueries } from "./queries/supply-chain";
import { resolveInvocation } from "./resolve-query";
import { clearQueryRegistry, registerQueries } from "./shared/query-registry";

import type { GraphApi } from "../graph/context-types";

const mockedGetRole = vi.mocked(getActorGroupRole);

const WEB_ID = "web-test" as WebId;
const ACTOR_ID = "actor-test" as ActorEntityUuid;
const VERSION = "2026-06-15";

const manifest = {
  datasetVersion: VERSION,
  products: ["democat-x100-extr"],
  sites: ["demo-plant"],
  steps: { "democat-x100-extr": ["prod_to_qa_pla"] },
};

const storedFiles: Record<string, string> = {
  [`supply-chain/${WEB_ID}/current.json`]: JSON.stringify({
    datasetVersion: VERSION,
  }),
  [`supply-chain/${WEB_ID}/${VERSION}/manifest.json`]: JSON.stringify(manifest),
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
  query: string,
  args: Record<string, unknown> = {},
  webIds: WebId[] = [WEB_ID],
) =>
  resolveInvocation({
    invocation: { id: "test", query, args, webIds },
    actorId: ACTOR_ID,
    graphApi: {} as GraphApi,
    uploadProvider,
    cache,
  });

describe("resolveInvocation (supply-chain queries)", () => {
  beforeEach(() => {
    clearQueryRegistry();
    registerQueries(supplyChainQueries);
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

  it("errors for an unknown query name", async () => {
    const result = await resolve("noSuchQuery");
    expect(result.status).toBe("error");
    expect(result.error).toMatch(/unknown query/i);
  });

  it("errors when no webId is supplied", async () => {
    const result = await resolve("listProducts", {}, []);
    expect(result.status).toBe("error");
    expect(result.error).toMatch(/webId/i);
  });
});
