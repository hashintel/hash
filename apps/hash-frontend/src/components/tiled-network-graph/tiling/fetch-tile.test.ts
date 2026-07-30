import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildResponse,
  cborArray,
  cborBool,
  cborBstr,
  cborMap,
  cborNull,
  cborTstr,
  cborUint,
  f32le,
  u32le,
} from "../atlas-decode/fixtures";
import { SALTILE_MEDIA_TYPE } from "../atlas-decode/wire";
import {
  ATLAS_API_BASE_URL,
  clearAtlasSessionCache,
  fetchTile,
  FetchTileError,
  getAtlasSessionRevision,
  subscribeToAtlasSessionRevision,
  withAtlasRetry,
} from "./fetch-tile";
import { WORLD_SIZE } from "./tile-geometry";

// Zero-delay backoff keeps the retry tests fast while still exercising the loop.
const FAST = { retries: 3, baseDelayMs: 0, maxDelayMs: 0 } as const;

/** Rejects `failures` times with `error`, then resolves with `value`. */
const flaky = <T>(failures: number, error: Error, value: T) => {
  let calls = 0;
  return vi.fn((): Promise<T> => {
    calls += 1;
    return calls <= failures ? Promise.reject(error) : Promise.resolve(value);
  });
};

describe("withAtlasRetry", () => {
  it("retries a transport failure (no status) and returns the eventual success", async () => {
    const operation = flaky(2, new FetchTileError("offline"), "ok");

    await expect(withAtlasRetry(operation, FAST)).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it.each([429, 500, 503])(
    "retries a retryable %i response",
    async (status) => {
      const operation = flaky(1, new FetchTileError("busy", { status }), "ok");

      await expect(withAtlasRetry(operation, FAST)).resolves.toBe("ok");
      expect(operation).toHaveBeenCalledTimes(2);
    },
  );

  it.each([400, 404, 422])(
    "does not retry a terminal %i response",
    async (status) => {
      const error = new FetchTileError("nope", { status });
      const operation = vi.fn(() => Promise.reject(error));

      await expect(withAtlasRetry(operation, FAST)).rejects.toBe(error);
      expect(operation).toHaveBeenCalledTimes(1);
    },
  );

  it("does not retry a non-HTTP error (e.g. a decode failure)", async () => {
    const error = new Error("decode mismatch");
    const operation = vi.fn(() => Promise.reject(error));

    await expect(withAtlasRetry(operation, FAST)).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("gives up after exhausting the retry budget and throws the last error", async () => {
    const error = new FetchTileError("still down", { status: 503 });
    const operation = vi.fn(() => Promise.reject(error));

    await expect(
      withAtlasRetry(operation, { retries: 2, baseDelayMs: 0, maxDelayMs: 0 }),
    ).rejects.toBe(error);
    // First attempt plus two retries.
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("stops retrying once the signal aborts", async () => {
    const controller = new AbortController();
    const operation = vi.fn(() => {
      // Abort as the first attempt fails, so no retry should follow.
      controller.abort();
      return Promise.reject(new FetchTileError("offline"));
    });

    await expect(
      withAtlasRetry(operation, { ...FAST, signal: controller.signal }),
    ).rejects.toBeInstanceOf(FetchTileError);
    expect(operation).toHaveBeenCalledTimes(1);
  });
});

const BASE = "http://api.test/atlas";

const genHex = (byte: number): string =>
  byte.toString(16).padStart(2, "0").repeat(32);

const manifestBody = (generation: string, maxZoom = 16): unknown => ({
  generation,
  wireVersion: 1,
  variants: ["plain"],
  bucketSchedule: { span: 64, cut: "z+m", maxZoom },
  limits: {
    coloredTypeIds: 8,
    edgesTiles: 32,
    locateEdges: 512,
    locateProperties: 20,
    locateLinkTypeIds: 5,
    locateLinkProperties: 10,
  },
  createdAt: "2026-07-19T16:00:00Z",
});

const wirePositions = [0.25, -0.5, 0.125, 0.75, -1, 1];
const rowIds = [7, 11, 13];

/** A 3-point delta tile at `(z, x, y)` for a `generationByte`-filled identity. */
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

/**
 * A 3-point delta tile carrying the detail trailer (per-point labels + icons),
 * as the server ships when `includeDetailedData` is set. The last label is null
 * (that point has no label).
 */
const detailedTileBytes = (
  generationByte: number,
  z: number,
  x: number,
  y: number,
): ArrayBuffer =>
  buildResponse(
    "tile",
    [
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
        [10, cborBool(true)], // trailer declared
      ]),
      f32le(wirePositions),
      u32le(rowIds),
      null,
      null,
    ],
    cborMap([
      [0, cborArray([cborTstr("Alpha"), cborTstr("Beta"), cborNull()])],
      [1, cborArray([cborNull(), cborNull(), cborNull()])],
    ]),
  );

/**
 * A 3-point delta tile carrying the TYPE_MASK column, as the server ships when
 * the request sends `coloredTypeIds`. With three queried types the mask is one
 * byte per point: point 0 is type 0, point 1 is types 1 and 2, point 2 is none.
 */
const coloredTileBytes = (
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
    // TYPE_MASK, LSB-first: 0b001, 0b110, 0b000.
    [0x01, 0x06, 0x00],
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
    {
      status: 404,
      headers: { "content-type": "application/problem+json" },
    },
  );

/** Stubs the global fetch with canned routes and records every path hit. */
const stubTransport = (routes: Record<string, () => Response>): string[] => {
  const paths: string[] = [];
  vi.stubGlobal("fetch", ((url: string) => {
    const path = new URL(url, BASE).pathname;
    paths.push(path);
    const route = routes[path];
    return Promise.resolve(route === undefined ? notFound() : route());
  }) as typeof fetch);
  return paths;
};

describe("fetchTile", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearAtlasSessionCache();
  });

  it("fetches a tile and maps wire positions onto the tiling world", async () => {
    const generation = genHex(0x11);
    stubTransport({
      "/atlas/current": () => json({ generation }),
      [`/atlas/generation/${generation}/manifest`]: () =>
        json(manifestBody(generation)),
      [`/atlas/tile/${generation}/plain/3/5/1`]: () =>
        saltile(tileBytes(0x11, 3, 5, 1)),
    });

    // Row-major tileIndex: y * 2^z + x = 1 * 8 + 5.
    const { nodes, complete } = await fetchTile(3, 13, { baseUrl: BASE });

    const scale = WORLD_SIZE / 2;
    expect(nodes).toEqual([
      { id: 7, x: (0.25 + 1) * scale, y: (-0.5 + 1) * scale },
      { id: 11, x: (0.125 + 1) * scale, y: (0.75 + 1) * scale },
      { id: 13, x: 0, y: WORLD_SIZE },
    ]);
    // `children` was non-zero, so deeper tiles hold the rest.
    expect(complete).toBe(false);
  });

  it("bootstraps once and reuses the session, but does not cache tiles", async () => {
    const generation = genHex(0x22);
    const paths = stubTransport({
      "/atlas/current": () => json({ generation }),
      [`/atlas/generation/${generation}/manifest`]: () =>
        json(manifestBody(generation)),
      [`/atlas/tile/${generation}/plain/1/1/0`]: () =>
        saltile(tileBytes(0x22, 1, 1, 0)),
    });

    await fetchTile(1, 1, { baseUrl: BASE });
    await fetchTile(1, 1, { baseUrl: BASE });

    const bootstraps = paths.filter((path) =>
      path.endsWith("/atlas/current"),
    ).length;
    expect(bootstraps).toBe(1);

    // Tile caching is the TileCache's job, not the transport's: both loads hit
    // the network.
    const tilePosts = paths.filter((path) =>
      path.includes("/atlas/tile/"),
    ).length;
    expect(tilePosts).toBe(2);
  });

  it("re-bootstraps once when the pinned generation rotates out", async () => {
    const oldGeneration = genHex(0x33);
    const newGeneration = genHex(0x44);
    let active = oldGeneration;
    const paths = stubTransport({
      "/atlas/current": () => json({ generation: active }),
      [`/atlas/generation/${oldGeneration}/manifest`]: () =>
        json(manifestBody(oldGeneration)),
      [`/atlas/generation/${newGeneration}/manifest`]: () =>
        json(manifestBody(newGeneration)),
      [`/atlas/tile/${oldGeneration}/plain/2/1/3`]: () => notFound(),
      [`/atlas/tile/${newGeneration}/plain/2/1/3`]: () =>
        saltile(tileBytes(0x44, 2, 1, 3)),
    });

    // Pin the stale generation, rotate the server, then fetch: the 404 triggers
    // exactly one re-bootstrap and the retry succeeds.
    const pinned = fetchTile(2, 13, { baseUrl: BASE }); // y = 3, x = 1
    active = newGeneration;
    const { nodes } = await pinned;

    expect(nodes).toHaveLength(3);
    const bootstraps = paths.filter((path) =>
      path.endsWith("/atlas/current"),
    ).length;
    expect(bootstraps).toBe(2);
  });

  it("requests the detail trailer and attaches per-point labels", async () => {
    const generation = genHex(0x66);
    const bodies: (string | undefined)[] = [];
    vi.stubGlobal("fetch", ((url: string, init?: RequestInit) => {
      const path = new URL(url, BASE).pathname;
      if (path.includes("/atlas/tile/")) {
        bodies.push(typeof init?.body === "string" ? init.body : undefined);
        return Promise.resolve(saltile(detailedTileBytes(0x66, 3, 5, 1)));
      }
      if (path.endsWith("/atlas/current")) {
        return Promise.resolve(json({ generation }));
      }
      if (path.endsWith("/manifest")) {
        return Promise.resolve(json(manifestBody(generation)));
      }
      return Promise.resolve(notFound());
    }) as typeof fetch);

    const { nodes } = await fetchTile(3, 13, {
      baseUrl: BASE,
      includeDetailedData: true,
    });

    // The trailer's label column rides delivered order; a null entry leaves the
    // node without a label.
    expect(nodes.map((node) => node.label)).toEqual([
      "Alpha",
      "Beta",
      undefined,
    ]);
    // The request body opts into the detail trailer.
    expect(bodies).toEqual([
      expect.stringContaining('"includeDetailedData":true'),
    ]);
  });

  it("sends coloredTypeIds and decodes the per-point type mask", async () => {
    const generation = genHex(0x77);
    const bodies: (string | undefined)[] = [];
    vi.stubGlobal("fetch", ((url: string, init?: RequestInit) => {
      const path = new URL(url, BASE).pathname;
      if (path.includes("/atlas/tile/")) {
        bodies.push(typeof init?.body === "string" ? init.body : undefined);
        return Promise.resolve(saltile(coloredTileBytes(0x77, 3, 5, 1)));
      }
      if (path.endsWith("/atlas/current")) {
        return Promise.resolve(json({ generation }));
      }
      if (path.endsWith("/manifest")) {
        return Promise.resolve(json(manifestBody(generation)));
      }
      return Promise.resolve(notFound());
    }) as typeof fetch);

    const { nodes } = await fetchTile(3, 13, {
      baseUrl: BASE,
      coloredTypeIds: ["type://a", "type://b", "type://c"],
    });

    // The request body lists the queried types in order.
    expect(bodies).toEqual([
      '{"coloredTypeIds":["type://a","type://b","type://c"]}',
    ]);
    // Each point's mask decodes into the ascending indices it matched; a point
    // matching none carries an empty list.
    expect(nodes.map((node) => node.typeIndices)).toEqual([[0], [1, 2], []]);
  });

  it("carries no typeIndices when no coloredTypeIds are requested", async () => {
    const generation = genHex(0x78);
    stubTransport({
      "/atlas/current": () => json({ generation }),
      [`/atlas/generation/${generation}/manifest`]: () =>
        json(manifestBody(generation)),
      [`/atlas/tile/${generation}/plain/3/5/1`]: () =>
        saltile(tileBytes(0x78, 3, 5, 1)),
    });

    const { nodes } = await fetchTile(3, 13, { baseUrl: BASE });

    expect(nodes.every((node) => node.typeIndices === undefined)).toBe(true);
  });

  it("rejects out-of-range zooms and tile indexes without a request", async () => {
    const paths = stubTransport({});

    await expect(fetchTile(-1, 0, { baseUrl: BASE })).rejects.toThrow(
      FetchTileError,
    );
    await expect(fetchTile(17, 0, { baseUrl: BASE })).rejects.toThrow(
      FetchTileError,
    );
    await expect(fetchTile(1, 4, { baseUrl: BASE })).rejects.toThrow(
      FetchTileError,
    );
    await expect(fetchTile(1, 1.5, { baseUrl: BASE })).rejects.toThrow(
      FetchTileError,
    );
    expect(paths).toEqual([]);
  });

  it("rejects zooms beyond the manifest's maxZoom", async () => {
    const generation = genHex(0x55);
    stubTransport({
      "/atlas/current": () => json({ generation }),
      [`/atlas/generation/${generation}/manifest`]: () =>
        json(manifestBody(generation, 2)),
    });

    await expect(fetchTile(3, 0, { baseUrl: BASE })).rejects.toThrow(
      /maxZoom/u,
    );
  });
});

describe("the atlas base", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearAtlasSessionCache();
  });

  it("addresses hash-api's mount, naming no atlas listener", () => {
    // The atlas answers under the actor its caller names, so the browser must reach it only through
    // hash-api, which states that actor from the session. A default naming the atlas directly would
    // put an unauthenticated corpus one forgotten `baseUrl` away.
    expect(ATLAS_API_BASE_URL.endsWith("/atlas")).toBe(true);
    expect(ATLAS_API_BASE_URL).not.toContain(":4003");
    expect(new URL(ATLAS_API_BASE_URL).port).not.toBe("4003");
  });

  it("sends the session cookie with the bootstrap and the tile request", async () => {
    const generation = genHex(0x99);
    const routes: Record<string, () => Response> = {
      "/atlas/current": () => json({ generation }),
      [`/atlas/generation/${generation}/manifest`]: () =>
        json(manifestBody(generation)),
      [`/atlas/tile/${generation}/plain/3/5/1`]: () =>
        saltile(tileBytes(0x99, 3, 5, 1)),
    };
    const credentials: (RequestCredentials | undefined)[] = [];
    vi.stubGlobal("fetch", ((url: string, init?: RequestInit) => {
      credentials.push(init?.credentials);
      const route = routes[new URL(url, BASE).pathname];
      return Promise.resolve(route === undefined ? notFound() : route());
    }) as typeof fetch);

    await fetchTile(3, 13, { baseUrl: BASE });

    // hash-api is a different origin from the frontend, so an uncredentialed request would be
    // answered as the public user rather than refused: every request carries the cookie.
    expect(credentials).toHaveLength(3);
    expect(credentials.every((value) => value === "include")).toBe(true);
  });
});

describe("the atlas session revision", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearAtlasSessionCache();
  });

  it("holds while the pinned generation does", async () => {
    const generation = genHex(0xaa);
    stubTransport({
      "/atlas/current": () => json({ generation }),
      [`/atlas/generation/${generation}/manifest`]: () =>
        json(manifestBody(generation)),
      [`/atlas/tile/${generation}/plain/1/1/0`]: () =>
        saltile(tileBytes(0xaa, 1, 1, 0)),
    });

    const before = getAtlasSessionRevision();
    await fetchTile(1, 1, { baseUrl: BASE });
    await fetchTile(1, 1, { baseUrl: BASE });

    // Bootstrapping and serving tiles is not a change of binding: a revision
    // that moved here would throw away live, correctly-attributed tiles.
    expect(getAtlasSessionRevision()).toBe(before);
  });

  it("changes and notifies when the pinned generation rotates out", async () => {
    const oldGeneration = genHex(0xbb);
    const newGeneration = genHex(0xcc);
    let active = oldGeneration;
    stubTransport({
      "/atlas/current": () => json({ generation: active }),
      [`/atlas/generation/${oldGeneration}/manifest`]: () =>
        json(manifestBody(oldGeneration)),
      [`/atlas/generation/${newGeneration}/manifest`]: () =>
        json(manifestBody(newGeneration)),
      [`/atlas/tile/${oldGeneration}/plain/2/1/3`]: () => notFound(),
      [`/atlas/tile/${newGeneration}/plain/2/1/3`]: () =>
        saltile(tileBytes(0xcc, 2, 1, 3)),
    });

    const notified = vi.fn();
    const unsubscribe = subscribeToAtlasSessionRevision(notified);
    const before = getAtlasSessionRevision();

    // The 404 re-bootstrap is the re-pin: every wire row id is salted by the
    // generation identity, so tiles decoded under the retired one now name
    // different, existing rows. Whoever composites them must be told.
    const pinned = fetchTile(2, 13, { baseUrl: BASE });
    active = newGeneration;
    await pinned;
    unsubscribe();

    expect(getAtlasSessionRevision()).not.toBe(before);
    expect(notified).toHaveBeenCalledTimes(1);
  });

  it("does not change when the clear dropped nothing", () => {
    const notified = vi.fn();
    const unsubscribe = subscribeToAtlasSessionRevision(notified);
    clearAtlasSessionCache();
    const before = getAtlasSessionRevision();

    clearAtlasSessionCache();
    clearAtlasSessionCache(BASE);
    unsubscribe();

    // Nothing was pinned, so nothing decoded under it can be misattributed.
    expect(getAtlasSessionRevision()).toBe(before);
    expect(notified).not.toHaveBeenCalled();
  });

  it("stops notifying an unsubscribed listener", async () => {
    const generation = genHex(0xdd);
    stubTransport({
      "/atlas/current": () => json({ generation }),
      [`/atlas/generation/${generation}/manifest`]: () =>
        json(manifestBody(generation)),
      [`/atlas/tile/${generation}/plain/1/1/0`]: () =>
        saltile(tileBytes(0xdd, 1, 1, 0)),
    });

    const notified = vi.fn();
    subscribeToAtlasSessionRevision(notified)();
    await fetchTile(1, 1, { baseUrl: BASE });
    clearAtlasSessionCache(BASE);

    expect(notified).not.toHaveBeenCalled();
  });
});
