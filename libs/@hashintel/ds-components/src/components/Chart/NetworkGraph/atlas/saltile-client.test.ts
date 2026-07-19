import { describe, expect, it } from "vitest";

import {
  buildResponse,
  cborArray,
  cborBool,
  cborBstr,
  cborMap,
  cborUint,
  f32le,
  u32le,
} from "./fixtures";
import {
  AtlasClient,
  AtlasContractError,
  AtlasProblemError,
  stableStringify,
  type FetchLike,
} from "./saltile-client";
import { SALTILE_MEDIA_TYPE } from "./saltile-wire";

const generationHex = Array.from({ length: 32 }, (_, index) =>
  index.toString(16).padStart(2, "0"),
).join("");
const generationBytes = Array.from({ length: 32 }, (_, index) => index);

const manifestBody = {
  generation: generationHex,
  wireVersion: 1,
  variants: ["plain"],
  bucketSchedule: { span: 64, cut: "z+m", maxZoom: 16 },
  limits: { coloredTypeIds: 8, edgesTiles: 32, locateNeighbours: 64 },
  createdAt: "2026-07-19T16:00:00Z",
};

const positions = [0.25, -0.5, 0.125, 0.75, -1, 1];
const rowIds = [7, 11, 13];

/** A valid 3-point delta tile at z 3 for the fixture generation, variant 0. */
const tileBytes = (): ArrayBuffer =>
  buildResponse("tile", [
    cborMap([
      [0, cborBstr(generationBytes)],
      [1, cborUint(0)],
      [2, cborArray([cborUint(3), cborUint(5), cborUint(1)])],
      [3, cborUint(0)],
      [4, cborUint(3)],
      [5, cborUint(40)],
      [6, cborUint(9)],
      [7, cborArray([cborUint(3)])],
      [9, cborUint(5)],
      [10, cborBool(false)],
    ]),
    f32le(positions),
    u32le(rowIds),
    null,
    null,
  ]);

interface RecordedCall {
  readonly url: string;
  readonly method: string;
  readonly body: string | undefined;
}

/** Routes requests to canned responses and records every call. */
const mockTransport = (
  routes: Record<string, () => Response>,
): { fetch: FetchLike; calls: RecordedCall[] } => {
  const calls: RecordedCall[] = [];
  const fetchImpl: FetchLike = (url, init) => {
    calls.push({ url, method: init?.method ?? "GET", body: init?.body });
    const path = new URL(url, "http://atlas.test").pathname;
    const route = routes[path];
    if (route === undefined) {
      return Promise.resolve(
        new Response(JSON.stringify({ type: "not-found", detail: path }), {
          status: 404,
          headers: { "content-type": "application/problem+json" },
        }),
      );
    }
    return Promise.resolve(route());
  };
  return { fetch: fetchImpl, calls };
};

const json = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const saltile = (buffer: ArrayBuffer): Response =>
  new Response(buffer, {
    status: 200,
    headers: { "content-type": SALTILE_MEDIA_TYPE },
  });

const bootstrapRoutes = {
  "/v1/atlas/current": () => json({ generation: generationHex }),
  [`/v1/atlas/generation/${generationHex}/manifest`]: () => json(manifestBody),
};

describe("stableStringify", () => {
  it("is key-order independent and drops undefined entries", () => {
    expect(stableStringify({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe(
      stableStringify({ a: [2, { c: 4, d: 3 }], b: 1 }),
    );
    expect(stableStringify({ a: 1, b: undefined })).toBe(
      stableStringify({ a: 1 }),
    );
  });
});

describe("AtlasClient", () => {
  it("bootstraps a session from current and the manifest", async () => {
    const { fetch: fetchImpl } = mockTransport(bootstrapRoutes);
    const client = new AtlasClient("http://atlas.test", fetchImpl);
    const session = await client.bootstrap();

    expect(session.generation).toBe(generationHex);
    expect(session.variant).toBe("plain");
    expect(session.spanLog2).toBe(6);
    expect(session.manifest.limits.coloredTypeIds).toBe(8);
  });

  it("fetches, decodes, and caches a tile", async () => {
    const { fetch: fetchImpl, calls } = mockTransport({
      ...bootstrapRoutes,
      [`/v1/atlas/tile/${generationHex}/plain/3/5/1`]: () =>
        saltile(tileBytes()),
    });
    const client = new AtlasClient("http://atlas.test", fetchImpl);
    const session = await client.bootstrap();

    const first = await client.tile(session, { z: 3, x: 5, y: 1 });
    expect(first.delivered).toBe(3);
    expect([...first.positions]).toEqual(positions);
    expect(first.children).toBe(5);

    const post = calls.at(-1)!;
    expect(post.method).toBe("POST");
    expect(JSON.parse(post.body!)).toEqual({});

    const callsBefore = calls.length;
    const second = await client.tile(session, { z: 3, x: 5, y: 1 });
    expect(calls.length).toBe(callsBefore);
    expect([...second.rowIds]).toEqual([...first.rowIds]);
  });

  it("cache keys are filter-key-order independent", async () => {
    const { fetch: fetchImpl, calls } = mockTransport({
      ...bootstrapRoutes,
      [`/v1/atlas/tile/${generationHex}/plain/3/5/1`]: () =>
        saltile(tileBytes()),
    });
    const client = new AtlasClient("http://atlas.test", fetchImpl);
    const session = await client.bootstrap();

    await client.tile(
      session,
      { z: 3, x: 5, y: 1 },
      {
        filter: { any: [{ type: "a" }, { type: "b" }], all: [] },
      },
    );
    const callsBefore = calls.length;
    await client.tile(
      session,
      { z: 3, x: 5, y: 1 },
      {
        filter: { all: [], any: [{ type: "a" }, { type: "b" }] },
      },
    );
    expect(calls.length).toBe(callsBefore);
  });

  it("enforces manifest limits before any request leaves", async () => {
    const { fetch: fetchImpl, calls } = mockTransport(bootstrapRoutes);
    const client = new AtlasClient("http://atlas.test", fetchImpl);
    const session = await client.bootstrap();
    const callsAfterBootstrap = calls.length;

    await expect(
      client.tile(
        session,
        { z: 3, x: 5, y: 1 },
        { coloredTypeIds: Array.from({ length: 9 }, (_, id) => `t${id}`) },
      ),
    ).rejects.toThrow(AtlasContractError);
    await expect(
      client.edges(session, {
        tiles: Array.from({ length: 33 }, () => ({ z: 1, x: 0, y: 0 })),
      }),
    ).rejects.toThrow(AtlasContractError);
    expect(calls.length).toBe(callsAfterBootstrap);
  });

  it("surfaces RFC 9457 problems with their type and status", async () => {
    const { fetch: fetchImpl } = mockTransport({
      ...bootstrapRoutes,
      [`/v1/atlas/tile/${generationHex}/plain/3/5/1`]: () =>
        new Response(
          JSON.stringify({
            type: "https://hash.ai/problems/atlas/stale-generation",
            detail: "generation rotated",
          }),
          {
            status: 404,
            headers: { "content-type": "application/problem+json" },
          },
        ),
    });
    const client = new AtlasClient("http://atlas.test", fetchImpl);
    const session = await client.bootstrap();

    try {
      await client.tile(session, { z: 3, x: 5, y: 1 });
      throw new Error("expected a problem");
    } catch (error) {
      expect(error).toBeInstanceOf(AtlasProblemError);
      expect((error as AtlasProblemError).status).toBe(404);
      expect((error as AtlasProblemError).type).toMatch(/stale-generation/u);
    }
  });

  it("rejects malformed manifests and wrong response media types", async () => {
    const badManifest = mockTransport({
      "/v1/atlas/current": () => json({ generation: generationHex }),
      [`/v1/atlas/generation/${generationHex}/manifest`]: () =>
        json({
          ...manifestBody,
          bucketSchedule: { span: 63, cut: "z+m", maxZoom: 16 },
        }),
    });
    await expect(
      new AtlasClient("http://atlas.test", badManifest.fetch).bootstrap(),
    ).rejects.toThrow(/span must be a power of two/u);

    const wrongType = mockTransport({
      ...bootstrapRoutes,
      [`/v1/atlas/tile/${generationHex}/plain/3/5/1`]: () =>
        new Response(new ArrayBuffer(8), {
          status: 200,
          headers: { "content-type": "application/octet-stream" },
        }),
    });
    const client = new AtlasClient("http://atlas.test", wrongType.fetch);
    const session = await client.bootstrap();
    await expect(client.tile(session, { z: 3, x: 5, y: 1 })).rejects.toThrow(
      /expected application\/vnd\.hash\.saltile-v1/u,
    );
  });
});
