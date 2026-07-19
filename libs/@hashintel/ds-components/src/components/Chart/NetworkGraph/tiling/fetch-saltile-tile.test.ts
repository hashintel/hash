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
} from "../atlas/fixtures";
import { SALTILE_MEDIA_TYPE } from "../atlas/saltile-wire";
import { createSaltileTileFetcher } from "./fetch-saltile-tile";
import { FetchTileError } from "./fetch-tile";
import { WORLD_SIZE } from "./tile-geometry";

import type { FetchLike } from "../atlas/saltile-client";

const genHex = (byte: number): string =>
  byte.toString(16).padStart(2, "0").repeat(32);

const manifestBody = (generation: string, maxZoom = 16): unknown => ({
  generation,
  wireVersion: 1,
  variants: ["plain"],
  bucketSchedule: { span: 64, cut: "z+m", maxZoom },
  limits: { coloredTypeIds: 8, edgesTiles: 32, locateNeighbours: 64 },
  createdAt: "2026-07-19T16:00:00Z",
});

const wirePositions = [0.25, -0.5, 0.125, 0.75, -1, 1];
const rowIds = [7, 11, 13];

/** A 3-point delta tile at `(z, x, y)` for `generationByte`-filled identity. */
const tileBytes = (
  generationByte: number,
  z: number,
  x: number,
  y: number,
): ArrayBuffer =>
  buildResponse("tile", [
    cborMap([
      [0, cborBstr(Array.from({ length: 32 }, () => generationByte))],
      [1, cborUint(0)],
      [2, cborArray([cborUint(z), cborUint(x), cborUint(y)])],
      [3, cborUint(0)],
      [4, cborUint(3)],
      [5, cborUint(40)],
      [6, cborUint(z + 6)],
      [7, cborArray([cborUint(3)])],
      [9, cborUint(5)],
      [10, cborBool(false)],
    ]),
    f32le(wirePositions),
    u32le(rowIds),
    null,
    null,
  ]);

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

const notFound = (): Response =>
  new Response(
    JSON.stringify({ type: "stale-generation", detail: "rotated" }),
    { status: 404, headers: { "content-type": "application/problem+json" } },
  );

/** Routes requests to canned responses and records every path. */
const mockTransport = (
  routes: Record<string, () => Response>,
): { fetch: FetchLike; paths: string[] } => {
  const paths: string[] = [];
  const fetchImpl: FetchLike = (url) => {
    const path = new URL(url, "http://atlas.test").pathname;
    paths.push(path);
    const route = routes[path];
    if (route === undefined) {
      return Promise.resolve(notFound());
    }
    return Promise.resolve(route());
  };
  return { fetch: fetchImpl, paths };
};

describe("createSaltileTileFetcher", () => {
  it("fetches a tile and maps wire positions onto the tiling world", async () => {
    const generation = genHex(0x11);
    const { fetch: fetchImpl } = mockTransport({
      "/v1/atlas/current": () => json({ generation }),
      [`/v1/atlas/generation/${generation}/manifest`]: () =>
        json(manifestBody(generation)),
      [`/v1/atlas/tile/${generation}/plain/3/5/1`]: () =>
        saltile(tileBytes(0x11, 3, 5, 1)),
    });
    const fetcher = createSaltileTileFetcher({
      baseUrl: "http://atlas.test",
      fetchImpl,
    });

    // Row-major tileIndex: y * 2^z + x = 1 * 8 + 5.
    const nodes = await fetcher(3, 13);

    const scale = WORLD_SIZE / 2;
    expect(nodes).toEqual([
      { id: 7, x: (0.25 + 1) * scale, y: (-0.5 + 1) * scale },
      { id: 11, x: (0.125 + 1) * scale, y: (0.75 + 1) * scale },
      { id: 13, x: 0, y: WORLD_SIZE },
    ]);
  });

  it("bootstraps once and reuses the pinned session across tiles", async () => {
    const generation = genHex(0x22);
    const { fetch: fetchImpl, paths } = mockTransport({
      "/v1/atlas/current": () => json({ generation }),
      [`/v1/atlas/generation/${generation}/manifest`]: () =>
        json(manifestBody(generation)),
      [`/v1/atlas/tile/${generation}/plain/1/1/0`]: () =>
        saltile(tileBytes(0x22, 1, 1, 0)),
    });
    const fetcher = createSaltileTileFetcher({
      baseUrl: "http://atlas.test",
      fetchImpl,
    });

    await fetcher(1, 1);
    await fetcher(1, 1);

    const bootstraps = paths.filter((path) =>
      path.endsWith("/atlas/current"),
    ).length;
    expect(bootstraps).toBe(1);

    // The second identical fetch is served from the client's cache.
    const tilePosts = paths.filter((path) =>
      path.includes("/atlas/tile/"),
    ).length;
    expect(tilePosts).toBe(1);
  });

  it("re-bootstraps once when the pinned generation rotates out", async () => {
    const oldGeneration = genHex(0x33);
    const newGeneration = genHex(0x44);
    let active = oldGeneration;
    const { fetch: fetchImpl, paths } = mockTransport({
      "/v1/atlas/current": () => json({ generation: active }),
      [`/v1/atlas/generation/${oldGeneration}/manifest`]: () =>
        json(manifestBody(oldGeneration)),
      [`/v1/atlas/generation/${newGeneration}/manifest`]: () =>
        json(manifestBody(newGeneration)),
      [`/v1/atlas/tile/${oldGeneration}/plain/2/1/3`]: () => notFound(),
      [`/v1/atlas/tile/${newGeneration}/plain/2/1/3`]: () =>
        saltile(tileBytes(0x44, 2, 1, 3)),
    });
    const fetcher = createSaltileTileFetcher({
      baseUrl: "http://atlas.test",
      fetchImpl,
    });

    // Pin the stale generation, rotate the server, then fetch: the 404
    // triggers exactly one re-bootstrap and the retry succeeds.
    const pinPromise = fetcher(2, 13); // y = 3, x = 1
    active = newGeneration;
    const nodes = await pinPromise;

    expect(nodes).toHaveLength(3);
    const bootstraps = paths.filter((path) =>
      path.endsWith("/atlas/current"),
    ).length;
    expect(bootstraps).toBe(2);
  });

  it("rejects out-of-range zooms and tile indexes without a request", async () => {
    const { fetch: fetchImpl, paths } = mockTransport({});
    const fetcher = createSaltileTileFetcher({
      baseUrl: "http://atlas.test",
      fetchImpl,
    });

    await expect(fetcher(-1, 0)).rejects.toThrow(FetchTileError);
    await expect(fetcher(17, 0)).rejects.toThrow(FetchTileError);
    await expect(fetcher(1, 4)).rejects.toThrow(FetchTileError);
    await expect(fetcher(1, 1.5)).rejects.toThrow(FetchTileError);
    expect(paths).toEqual([]);
  });

  it("rejects zooms beyond the manifest's maxZoom", async () => {
    const generation = genHex(0x55);
    const { fetch: fetchImpl } = mockTransport({
      "/v1/atlas/current": () => json({ generation }),
      [`/v1/atlas/generation/${generation}/manifest`]: () =>
        json(manifestBody(generation, 2)),
    });
    const fetcher = createSaltileTileFetcher({
      baseUrl: "http://atlas.test",
      fetchImpl,
    });

    await expect(fetcher(3, 0)).rejects.toThrow(/maxZoom/u);
  });
});
