import { afterEach, describe, expect, it, vi } from "vitest";

import { enterPrincipal } from "../../../shared/principal-scoped-state";
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
  AtlasAuthorityEndedError,
  ATLAS_AUTHORITY_HEADER,
  AtlasDeliveryCutChangedError,
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

const manifestBody = (
  generation: string,
  maxZoom = 16,
  scopeOffset = 0,
): unknown => ({
  generation,
  wireVersion: 1,
  variants: ["plain"],
  bucketSchedule: { span: 64, cut: "z+6", maxZoom },
  scopeSchedule: { k: scopeOffset, cut: `z+${6 + scopeOffset}` },
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
  cutAddend = 6,
): ArrayBuffer =>
  buildResponse("tile", [
    cborMap([
      [0, cborBstr(Array.from({ length: 32 }, () => generationByte))],
      [1, cborUint(0)],
      [2, cborArray([cborUint(z), cborUint(x), cborUint(y)])],
      [3, cborUint(0)],
      [4, cborUint(3)],
      [5, cborUint(40)],
      [6, cborUint(z + cutAddend)],
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
    JSON.stringify({
      type: "/problems/atlas/unknown-generation",
      detail: "re-read `current` and retry",
    }),
    {
      status: 404,
      headers: { "content-type": "application/problem+json" },
    },
  );

/**
 * A minted authority token.
 *
 * An obviously arbitrary opaque string, deliberately not the server's width.
 *
 * The client's contract with this value is opacity — retain it, present it — so width has no consumer
 * here, and a fixture that imitated one would only teach a number that goes stale. One test below
 * presents a token of a different length again, to pin that nothing looks.
 */
const token = (byte: number): string =>
  `${byte.toString(16).padStart(2, "0")}-opaque-authority`;

const TOKEN_A = token(0xa1);
const TOKEN_B = token(0xb2);

/**
 * The manifest response as the server always sends it.
 *
 * The immutable document plus a freshly minted authority token in its header, and `no-store` because
 * of that token.
 */
const manifest = (
  generation: string,
  maxZoom = 16,
  minted = TOKEN_A,
  scopeOffset = 0,
): Response =>
  new Response(JSON.stringify(manifestBody(generation, maxZoom, scopeOffset)), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "private, no-store",
      [ATLAS_AUTHORITY_HEADER]: minted,
    },
  });

/**
 * A data route that cannot resolve the caller's scope.
 *
 * Every cause the server maps to this refusal is a store-stage failure - no pool connection, the
 * actor's policy set, the visibility query, its rows, or the held filter document - so a later
 * attempt may succeed and the status alone is the retry signal. The cause stays in the server log,
 * because a resolution failure names store internals.
 */
const scopeUnavailable = (): Response =>
  new Response(
    JSON.stringify({
      type: "/problems/atlas/visibility-unavailable",
      title: "Service Unavailable",
      status: 503,
      detail: "resolving the caller's visibility failed",
    }),
    {
      status: 503,
      headers: { "content-type": "application/problem+json" },
    },
  );

/**
 * The one refusal a data route gives for authority.
 *
 * Whatever the cause — an absent token, a stale one, a foreign one — the client learns only that it
 * must re-fetch the manifest.
 */
const unauthorized = (): Response =>
  new Response(
    JSON.stringify({
      type: "/problems/atlas/unauthorized",
      title: "Unauthorized",
      status: 401,
      detail:
        "the request presents no valid authority token; re-fetch the manifest to obtain one",
    }),
    {
      status: 401,
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
      [`/atlas/generation/${generation}/manifest`]: () => manifest(generation),
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

  it("serves a restricted caller, whose cut carries the manifest's k", async () => {
    // The end-to-end shape of the defect this test was written for: the
    // manifest publishes k = 1, so the server counts the head from
    // z + m + k and the session has to carry that sum. Reading m alone
    // refused every restricted caller at its first tile, with no partial
    // render and no wrong colours - a contract error.
    const generation = genHex(0x1a);
    stubTransport({
      "/atlas/current": () => json({ generation }),
      [`/atlas/generation/${generation}/manifest`]: () =>
        manifest(generation, 16, TOKEN_A, 1),
      [`/atlas/tile/${generation}/plain/3/5/1`]: () =>
        saltile(tileBytes(0x1a, 3, 5, 1, 7)),
    });

    const { nodes } = await fetchTile(3, 13, { baseUrl: BASE });
    expect(nodes).toHaveLength(3);
  });

  it("refuses a restricted tile counted from the corpus span alone", async () => {
    // The same manifest, with the head the server would send if it had
    // ignored k. The refusal is the decoder's, and it names firstBucket -
    // so a desync between the two blocks is loud rather than silent.
    const generation = genHex(0x1b);
    stubTransport({
      "/atlas/current": () => json({ generation }),
      [`/atlas/generation/${generation}/manifest`]: () =>
        manifest(generation, 16, TOKEN_A, 1),
      [`/atlas/tile/${generation}/plain/3/5/1`]: () =>
        saltile(tileBytes(0x1b, 3, 5, 1, 6)),
    });

    // The wrapper names the tile and the cause names the contract, so the
    // detail is one `.cause` away rather than lost.
    const refusal = await fetchTile(3, 13, { baseUrl: BASE }).catch(
      (error: unknown) => error,
    );
    expect(refusal).toBeInstanceOf(FetchTileError);
    expect((refusal as Error).message).toMatch(
      /failed to decode tile 3\/5\/1/u,
    );
    expect(((refusal as Error).cause as Error).message).toMatch(/firstBucket/u);
  });

  it("bootstraps once and reuses the session, but does not cache tiles", async () => {
    const generation = genHex(0x22);
    const paths = stubTransport({
      "/atlas/current": () => json({ generation }),
      [`/atlas/generation/${generation}/manifest`]: () => manifest(generation),
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

  it("re-bootstraps once when the pinned generation is no longer served", async () => {
    const oldGeneration = genHex(0x33);
    const newGeneration = genHex(0x44);
    let active = oldGeneration;
    const paths = stubTransport({
      "/atlas/current": () => json({ generation: active }),
      [`/atlas/generation/${oldGeneration}/manifest`]: () =>
        manifest(oldGeneration),
      [`/atlas/generation/${newGeneration}/manifest`]: () =>
        manifest(newGeneration),
      [`/atlas/tile/${oldGeneration}/plain/2/1/3`]: () => notFound(),
      [`/atlas/tile/${newGeneration}/plain/2/1/3`]: () =>
        saltile(tileBytes(0x44, 2, 1, 3)),
    });

    // Pin the stale generation, re-pin the server, then fetch: the 404 triggers
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

  it("does not drop the session when a data route cannot resolve the scope", async () => {
    const generation = genHex(0x51);
    const paths = stubTransport({
      "/atlas/current": () => json({ generation }),
      [`/atlas/generation/${generation}/manifest`]: () => manifest(generation),
      [`/atlas/tile/${generation}/plain/2/1/3`]: () => scopeUnavailable(),
    });

    await expect(
      fetchTile(2, 13, { baseUrl: BASE, retry: 0 }), // y = 3, x = 1
    ).rejects.toThrow(/503/);

    // The contrast with the test above is the point. A `503` is not a session-ending refusal: every
    // cause the server maps to it is a store stage that a later attempt may clear, so the recovery
    // is this caller's bounded retry. Routing it through the session door instead would discard
    // every painted tile to answer an outage, and the re-bootstrap would meet the same failure -
    // the manifest resolves the caller's scope too. One bootstrap, and the refusal travels.
    expect(
      paths.filter((path) => path.endsWith("/atlas/current")),
    ).toHaveLength(1);
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
        return Promise.resolve(manifest(generation));
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
        return Promise.resolve(manifest(generation));
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
      [`/atlas/generation/${generation}/manifest`]: () => manifest(generation),
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
        manifest(generation, 2),
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
      [`/atlas/generation/${generation}/manifest`]: () => manifest(generation),
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
    //
    // The authority token does not retire this test, and it is worth saying why, because the token
    // seals an actor and that sounds like the same wall. It seals the actor hash-api resolved — and
    // for a cookieless request that is the public user, so the manifest mints a valid public-actor
    // token, every data route admits it, and the whole chain is internally consistent and silently
    // emptier. The token refuses a *different* actor's presentation; only the cookie decides which
    // actor gets resolved in the first place. Two walls, one failure each.
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
      [`/atlas/generation/${generation}/manifest`]: () => manifest(generation),
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

  it("changes and notifies when the pinned generation is no longer served", async () => {
    const oldGeneration = genHex(0xbb);
    const newGeneration = genHex(0xcc);
    let active = oldGeneration;
    stubTransport({
      "/atlas/current": () => json({ generation: active }),
      [`/atlas/generation/${oldGeneration}/manifest`]: () =>
        manifest(oldGeneration),
      [`/atlas/generation/${newGeneration}/manifest`]: () =>
        manifest(newGeneration),
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
      [`/atlas/generation/${generation}/manifest`]: () => manifest(generation),
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

/** One recorded request: where it went, how, what it carried, and which authority token it presented. */
interface RecordedRequest {
  readonly path: string;
  readonly method: string;
  readonly authority: string | null;
  /**
   * The stated request content type, `null` when the request carries no body.
   *
   * Recorded because it decides the CORS envelope: `application/json` is not a safelisted value, so a
   * content type on a bodyless request would buy a preflight for a body that does not exist.
   */
  readonly contentType: string | null;
  readonly body: string | undefined;
}

/**
 * Stubs the global fetch with canned routes.
 *
 * Records every request's path, method, body, stated content type and presented authority token.
 * Unknown paths answer `404`, the generation-retired signal.
 *
 * A route is handed the request it is answering, because the real server's manifest answers a
 * presented token differently from an absent one: presenting is the refresh, absent is a fresh
 * bootstrap. A fixture that could not tell them apart would model a server nobody runs.
 *
 * A route may answer with a promise, which is how a response is held past events that were supposed
 * to have retired it — a bootstrap and a renewal both outlive their callers' signals on purpose, so
 * "the response arrives after everything it was for is gone" is a real ordering, not a contrivance.
 */
const stubAuthorityTransport = (
  routes: Record<
    string,
    (request: RecordedRequest) => Response | Promise<Response>
  >,
): RecordedRequest[] => {
  const seen: RecordedRequest[] = [];
  vi.stubGlobal("fetch", ((url: string, init?: RequestInit) => {
    const request: RecordedRequest = {
      path: new URL(url, BASE).pathname,
      method: init?.method ?? "GET",
      authority: new Headers(init?.headers).get(ATLAS_AUTHORITY_HEADER),
      contentType: new Headers(init?.headers).get("content-type"),
      body: typeof init?.body === "string" ? init.body : undefined,
    };
    seen.push(request);
    const route = routes[request.path];
    return Promise.resolve(route === undefined ? notFound() : route(request));
  }) as typeof fetch);
  return seen;
};

/**
 * The data-route requests: everything that is not the session pair.
 *
 * Selected by path and never by method, because the manifest is a `POST` route as well: a method
 * filter would count every mint and every renewal as a data request, which is the exact misreading
 * the transport states request roles to avoid.
 */
const dataRoutes = (seen: RecordedRequest[]): RecordedRequest[] =>
  seen.filter(
    (request) =>
      !request.path.endsWith("/manifest") && !request.path.endsWith("/current"),
  );

const manifestFetches = (seen: RecordedRequest[]): RecordedRequest[] =>
  seen.filter((request) => request.path.endsWith("/manifest"));

describe("the atlas authority token", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearAtlasSessionCache();
  });

  it("presents the minted token on the data route and nothing on the session pair", async () => {
    const generation = genHex(0x11);
    const seen = stubAuthorityTransport({
      "/atlas/current": () => json({ generation }),
      [`/atlas/generation/${generation}/manifest`]: () => manifest(generation),
      [`/atlas/tile/${generation}/plain/3/5/1`]: () =>
        saltile(tileBytes(0x11, 3, 5, 1)),
    });

    await fetchTile(3, 13, { baseUrl: BASE });

    // The session pair by role: `current` is the one `GET`, the manifest is a bodyless `POST`, and
    // both are tokenless. That keeps them CORS-simple — no custom header, no stated content type —
    // so neither costs a preflight, and the manifest fetch is a bootstrap rather than a renewal.
    expect(seen.slice(0, 2)).toEqual([
      {
        path: "/atlas/current",
        method: "GET",
        authority: null,
        contentType: null,
        body: undefined,
      },
      {
        path: `/atlas/generation/${generation}/manifest`,
        method: "POST",
        authority: null,
        contentType: null,
        body: undefined,
      },
    ]);
    // A data route presents the token and states its body's type.
    expect(dataRoutes(seen)).toEqual([
      {
        path: `/atlas/tile/${generation}/plain/3/5/1`,
        method: "POST",
        authority: TOKEN_A,
        contentType: "application/json",
        body: "{}",
      },
    ]);
  });

  it("warns when a minting response carries no authority header, naming the CORS cause", async () => {
    const generation = genHex(0x13);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // The same manifest document with its header stripped: this is what a cross-origin read looks
    // like when hash-api stops naming the header in `Access-Control-Expose-Headers`, and the read
    // returns `null` with no error raised anywhere.
    const seen = stubAuthorityTransport({
      "/atlas/current": () => json({ generation }),
      [`/atlas/generation/${generation}/manifest`]: () =>
        new Response(JSON.stringify(manifestBody(generation, 16, 0)), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "cache-control": "private, no-store",
          },
        }),
      [`/atlas/tile/${generation}/plain/1/1/0`]: () =>
        saltile(tileBytes(0x13, 1, 1, 0)),
    });

    await fetchTile(1, 1, { baseUrl: BASE });

    // The defect it exists for: the data route presents nothing, which the server answers with the
    // same `401` a genuine expiry earns, so nothing downstream can tell the two apart.
    expect(dataRoutes(seen).map((request) => request.authority)).toEqual([
      null,
    ]);

    expect(warn).toHaveBeenCalledTimes(1);
    const [message] = warn.mock.calls[0]!;
    expect(message).toContain("manifest-bootstrap");
    expect(message).toContain(ATLAS_AUTHORITY_HEADER);
    expect(message).toContain("Access-Control-Expose-Headers");
    warn.mockRestore();
  });

  it("stays silent when a data route carries no authority header, which is every data route", async () => {
    const generation = genHex(0x14);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // The negative control that makes the warning worth having: only the manifest mints, so an absent
    // header on the four data routes is the contract rather than a fault. A warning on every read
    // would fire once per tile and mean nothing.
    const seen = stubAuthorityTransport({
      "/atlas/current": () => json({ generation }),
      [`/atlas/generation/${generation}/manifest`]: () => manifest(generation),
      [`/atlas/tile/${generation}/plain/1/1/0`]: () =>
        saltile(tileBytes(0x14, 1, 1, 0)),
    });

    await fetchTile(1, 1, { baseUrl: BASE });

    expect(dataRoutes(seen).map((request) => request.authority)).toEqual([
      TOKEN_A,
    ]);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("presents a token of any width verbatim", async () => {
    const generation = genHex(0x12);
    // Opacity is permanent by the serving side's commitment: the envelope may grow, and a client
    // that validated the width would refuse a token the server would still open.
    const odd = "0f1e2d";
    const seen = stubAuthorityTransport({
      "/atlas/current": () => json({ generation }),
      [`/atlas/generation/${generation}/manifest`]: () =>
        manifest(generation, 16, odd),
      [`/atlas/tile/${generation}/plain/1/1/0`]: () =>
        saltile(tileBytes(0x12, 1, 1, 0)),
    });

    await fetchTile(1, 1, { baseUrl: BASE });

    expect(dataRoutes(seen).map((request) => request.authority)).toEqual([odd]);
  });

  it("renews on a 401 mid-viewport, retries once, and keeps the painted tiles", async () => {
    const generation = genHex(0x21);
    let expired = false;
    const seen = stubAuthorityTransport({
      "/atlas/current": () => json({ generation }),
      [`/atlas/generation/${generation}/manifest`]: (request) => {
        // A presented token is the refresh: the server reads its sealed view state, forgives the
        // expiry, and re-mints with that state verbatim — which is what un-expires the client.
        if (request.authority === null) {
          return manifest(generation, 16, TOKEN_A);
        }
        expired = false;
        return manifest(generation, 16, TOKEN_B);
      },
      [`/atlas/tile/${generation}/plain/1/1/0`]: () =>
        expired ? unauthorized() : saltile(tileBytes(0x21, 1, 1, 0)),
    });

    const notified = vi.fn();
    const unsubscribe = subscribeToAtlasSessionRevision(notified);
    const first = await fetchTile(1, 1, { baseUrl: BASE });
    const before = getAtlasSessionRevision();

    // The token ages out under a viewport that is still painting.
    expired = true;
    const second = await fetchTile(1, 1, { baseUrl: BASE });
    unsubscribe();

    expect(second.nodes).toEqual(first.nodes);
    // A token rotation is not a change of binding: the tiles already painted stay valid, so the
    // revision must hold. Moving it here would discard every viewport's state once per token
    // window, which reads as a periodic stall rather than as a bug.
    expect(getAtlasSessionRevision()).toBe(before);
    expect(notified).not.toHaveBeenCalled();

    // The renewal presents the expiring token — that is what carries the view state across the
    // re-mint — and it is a manifest fetch, not a re-bootstrap: `current` is read once.
    expect(
      seen.filter((request) => request.path.endsWith("/current")),
    ).toHaveLength(1);
    // The two manifest roles differ in exactly one thing, the presentation. Same route, same method,
    // no body either time: nothing in the request's shape says which role it is, which is why the
    // transport carries the role explicitly instead of reading it off the request.
    const manifestPath = `/atlas/generation/${generation}/manifest`;
    expect(manifestFetches(seen)).toEqual([
      {
        path: manifestPath,
        method: "POST",
        authority: null,
        contentType: null,
        body: undefined,
      },
      {
        path: manifestPath,
        method: "POST",
        authority: TOKEN_A,
        contentType: null,
        body: undefined,
      },
    ]);
    expect(dataRoutes(seen).map((request) => request.authority)).toEqual([
      TOKEN_A,
      TOKEN_A,
      TOKEN_B,
    ]);
  });

  it("spends one renewal on a viewport's simultaneous refusals", async () => {
    const generation = genHex(0x22);
    let expired = false;
    const routes: Record<string, (request: RecordedRequest) => Response> = {
      "/atlas/current": () => json({ generation }),
      [`/atlas/generation/${generation}/manifest`]: (request) => {
        if (request.authority === null) {
          // The bootstrap's token ages out before the viewport's first tile lands.
          expired = true;
          return manifest(generation, 16, TOKEN_A);
        }
        expired = false;
        return manifest(generation, 16, TOKEN_B);
      },
      // The viewport's four tiles, each refused while the held token is stale.
      ...Object.fromEntries(
        [0, 1, 2, 3].map((index) => [
          `/atlas/tile/${generation}/plain/2/${index}/0`,
          () =>
            expired ? unauthorized() : saltile(tileBytes(0x22, 2, index, 0)),
        ]),
      ),
    };
    const seen = stubAuthorityTransport(routes);

    // All four tiles of the viewport are refused together. Row-major at z=2: tileIndex = 0 * 4 + x.
    const tiles = await Promise.all(
      [0, 1, 2, 3].map((index) => fetchTile(2, index, { baseUrl: BASE })),
    );

    expect(tiles.map(({ nodes }) => nodes.length)).toEqual([3, 3, 3, 3]);
    // Four refusals, one renewal: the manifest re-fetch is shared per origin, so a viewport whose
    // token ages out does not re-mint once per tile.
    expect(manifestFetches(seen)).toHaveLength(2);
    // Every retry presents the token that renewal produced.
    expect(
      dataRoutes(seen)
        .map((request) => request.authority)
        .filter((presented) => presented === TOKEN_B),
    ).toHaveLength(4);
  });

  it("treats a 404 at the renewal as a re-pin, not a failed renewal", async () => {
    const oldGeneration = genHex(0x31);
    const newGeneration = genHex(0x32);
    let active = oldGeneration;
    const seen = stubAuthorityTransport({
      "/atlas/current": () => json({ generation: active }),
      // The retired generation's manifest is gone with the process that pinned it, so the renewal
      // finds a 404 where it expected a fresh token.
      [`/atlas/generation/${oldGeneration}/manifest`]: () =>
        active === oldGeneration ? manifest(oldGeneration) : notFound(),
      [`/atlas/generation/${newGeneration}/manifest`]: () =>
        manifest(newGeneration, 16, TOKEN_B),
      [`/atlas/tile/${oldGeneration}/plain/1/1/0`]: () =>
        active === oldGeneration
          ? saltile(tileBytes(0x31, 1, 1, 0))
          : unauthorized(),
      [`/atlas/tile/${newGeneration}/plain/1/1/0`]: () =>
        saltile(tileBytes(0x32, 1, 1, 0)),
    });

    const notified = vi.fn();
    const unsubscribe = subscribeToAtlasSessionRevision(notified);
    await fetchTile(1, 1, { baseUrl: BASE });
    const before = getAtlasSessionRevision();

    // A redeploy: the process this session pinned is gone, and the token it holds is refused before
    // the route can answer that the generation is unknown.
    active = newGeneration;
    const { nodes } = await fetchTile(1, 1, { baseUrl: BASE });
    unsubscribe();

    // The renewal's 404 travelled to the caller's own generation-refresh path, which re-bootstrapped
    // and told every holder of a decoded tile to discard it: a re-pin re-attributes row ids, so the
    // two recoveries compose without either knowing about the other.
    expect(nodes).toHaveLength(3);
    expect(getAtlasSessionRevision()).not.toBe(before);
    expect(notified).toHaveBeenCalledTimes(1);
    // The re-bootstrap read `current` again and minted against the new generation.
    expect(
      seen.filter((request) => request.path.endsWith("/current")),
    ).toHaveLength(2);
    expect(dataRoutes(seen).at(-1)).toEqual({
      path: `/atlas/tile/${newGeneration}/plain/1/1/0`,
      method: "POST",
      authority: TOKEN_B,
      contentType: "application/json",
      body: "{}",
    });
  });

  it("does not renew authority at a refused bootstrap: only a data route's 401 can be stale", async () => {
    const generation = genHex(0x40);
    const seen = stubAuthorityTransport({
      "/atlas/current": () => json({ generation }),
      // The manifest refuses the bootstrap itself. A bootstrap presents no token, so there is no
      // stale authority to renew and nothing a renewal could repair: renewing here would re-fetch
      // the request that just failed, and its refusal would renew again.
      [`/atlas/generation/${generation}/manifest`]: () => unauthorized(),
      [`/atlas/tile/${generation}/plain/1/1/0`]: () =>
        saltile(tileBytes(0x40, 1, 1, 0)),
    });

    await expect(fetchTile(1, 1, { baseUrl: BASE })).rejects.toMatchObject({
      name: "FetchTileError",
      status: 401,
    });

    // One manifest fetch, and the tile route was never reached: the refusal is the bootstrap's own.
    expect(manifestFetches(seen)).toHaveLength(1);
    expect(dataRoutes(seen)).toHaveLength(0);
  });

  it("renews at most once per request: a second refusal is terminal", async () => {
    const generation = genHex(0x41);
    const seen = stubAuthorityTransport({
      "/atlas/current": () => json({ generation }),
      [`/atlas/generation/${generation}/manifest`]: () =>
        manifest(generation, 16, TOKEN_B),
      // A route that refuses whatever it is handed, including the token just minted for it. The
      // client cannot ask why: the refusal names no cause, by contract.
      [`/atlas/tile/${generation}/plain/1/1/0`]: () => unauthorized(),
    });

    await expect(fetchTile(1, 1, { baseUrl: BASE })).rejects.toThrow(/401/u);

    // Two attempts, one renewal — never a loop, and the refusal reaches the caller intact.
    expect(dataRoutes(seen)).toHaveLength(2);
    expect(manifestFetches(seen)).toHaveLength(2);
  });

  it("drops the token with the session that minted it", async () => {
    const generation = genHex(0x51);
    let minted = TOKEN_A;
    const seen = stubAuthorityTransport({
      "/atlas/current": () => json({ generation }),
      [`/atlas/generation/${generation}/manifest`]: () =>
        manifest(generation, 16, minted),
      [`/atlas/tile/${generation}/plain/1/1/0`]: () =>
        saltile(tileBytes(0x51, 1, 1, 0)),
    });

    await fetchTile(1, 1, { baseUrl: BASE });
    clearAtlasSessionCache(BASE);
    minted = TOKEN_B;
    await fetchTile(1, 1, { baseUrl: BASE });

    // A token seals view state resolved under the generation its session pinned, and the next
    // generation's key refuses it as a forgery rather than as an expiry — so a dropped session
    // must not leave its token behind to be presented into a wasted round trip.
    expect(dataRoutes(seen).map((request) => request.authority)).toEqual([
      TOKEN_A,
      TOKEN_B,
    ]);
  });

  it("renews against the generation a re-pin left pinned", async () => {
    const oldGeneration = genHex(0x71);
    const newGeneration = genHex(0x72);
    let active = oldGeneration;
    // Every mint hands out a fresh token, and only the freshest one opens: the client's held token
    // is the one the last manifest response gave it, whichever route that response came from.
    let held = 0;
    let expired = false;
    const mint = (generation: string): Response => {
      held += 1;
      expired = false;
      return manifest(generation, 16, token(0xc0 + held));
    };
    const seen = stubAuthorityTransport({
      "/atlas/current": () => json({ generation: active }),
      [`/atlas/generation/${oldGeneration}/manifest`]: () =>
        active === oldGeneration ? mint(oldGeneration) : notFound(),
      [`/atlas/generation/${newGeneration}/manifest`]: () =>
        mint(newGeneration),
      [`/atlas/tile/${oldGeneration}/plain/1/1/0`]: (request) =>
        active === oldGeneration &&
        !expired &&
        request.authority === token(0xc0 + held)
          ? saltile(tileBytes(0x71, 1, 1, 0))
          : unauthorized(),
      [`/atlas/tile/${newGeneration}/plain/1/1/0`]: (request) =>
        !expired && request.authority === token(0xc0 + held)
          ? saltile(tileBytes(0x72, 1, 1, 0))
          : unauthorized(),
    });

    await fetchTile(1, 1, { baseUrl: BASE });
    // A redeploy: the 401 leads to a 404 at the retired manifest, and the re-pin re-bootstraps.
    active = newGeneration;
    await fetchTile(1, 1, { baseUrl: BASE });
    const afterRepin = getAtlasSessionRevision();

    // Then the new session's own token ages out. The renewal must address the generation this
    // session pinned: aimed at the retired one it would 404 forever, and every such 404 travels as
    // a re-pin, discarding the painted tiles of a generation that never moved.
    expired = true;
    const { nodes } = await fetchTile(1, 1, { baseUrl: BASE });

    expect(nodes).toHaveLength(3);
    expect(getAtlasSessionRevision()).toBe(afterRepin);
    expect(manifestFetches(seen).at(-1)?.path).toBe(
      `/atlas/generation/${newGeneration}/manifest`,
    );
  });

  it("rides out a transient failure at the renewal", async () => {
    const generation = genHex(0x81);
    let expired = true;
    let blipped = false;
    const seen = stubAuthorityTransport({
      "/atlas/current": () => json({ generation }),
      [`/atlas/generation/${generation}/manifest`]: (request) => {
        if (request.authority === null) {
          return manifest(generation, 16, TOKEN_A);
        }
        if (!blipped) {
          // One 503 between the refusal and the fresh token.
          blipped = true;
          return new Response("unavailable", { status: 503 });
        }
        expired = false;
        return manifest(generation, 16, TOKEN_B);
      },
      [`/atlas/tile/${generation}/plain/1/1/0`]: () =>
        expired ? unauthorized() : saltile(tileBytes(0x81, 1, 1, 0)),
    });

    // The refusal that started the renewal is already past retrying — a `401` is terminal for the
    // request that took it — so a blip here would fail a viewport whose only problem was an
    // expiring token.
    const { nodes } = await fetchTile(1, 1, { baseUrl: BASE });

    expect(nodes).toHaveLength(3);
    expect(manifestFetches(seen)).toHaveLength(3);
    expect(dataRoutes(seen).map((request) => request.authority)).toEqual([
      TOKEN_A,
      TOKEN_B,
    ]);
  });

  it("clears the session and re-bootstraps when its renewal is refused", async () => {
    const generation = genHex(0x91);
    // The held token stops being admitted anywhere — at the data route and at its own renewal, where
    // an expiry would have been forgiven — while a tokenless bootstrap still succeeds and mints a new
    // one. The cause is the server's business; what the client sees is that its own renewal refused.
    let minted = TOKEN_A;
    let admitted = TOKEN_A;
    let refusingPresented = false;
    const seen = stubAuthorityTransport({
      "/atlas/current": () => json({ generation }),
      [`/atlas/generation/${generation}/manifest`]: (request) =>
        request.authority !== null && refusingPresented
          ? unauthorized()
          : manifest(generation, 16, minted),
      [`/atlas/tile/${generation}/plain/1/1/0`]: (request) =>
        request.authority === admitted
          ? saltile(tileBytes(0x91, 1, 1, 0))
          : unauthorized(),
    });

    await fetchTile(1, 1, { baseUrl: BASE });
    const before = getAtlasSessionRevision();
    // Where the revision moved, measured in requests already sent, so the order can be asserted
    // rather than described: the drop must be visible to holders before the new token exists.
    const movedAfter: number[] = [];
    const unsubscribe = subscribeToAtlasSessionRevision(() => {
      movedAfter.push(seen.length);
    });
    const settled = seen.length;

    minted = TOKEN_B;
    admitted = TOKEN_B;
    refusingPresented = true;

    // The session is replaced and the request retried, so the caller sees a painted tile.
    const { nodes } = await fetchTile(1, 1, { baseUrl: BASE, retry: 0 });
    expect(nodes).toHaveLength(3);

    // Advanced once, for the one session that was really pinned.
    expect(getAtlasSessionRevision()).toBe(before + 1);
    const recovery = seen.slice(settled);
    const bootstrap = recovery.findIndex((request) =>
      request.path.endsWith("/current"),
    );
    expect(bootstrap).toBeGreaterThanOrEqual(0);
    // The clear landed before the token-less bootstrap went out, so no freshly minted token is ever
    // adopted beside rows painted under the session it replaced.
    expect(movedAfter).toEqual([settled + bootstrap]);

    // The two manifest calls of the recovery, in order: the renewal that presented the refused token,
    // then the replacement bootstrap that presented none. Asserting it on the manifest is the whole
    // point — `/current` carries no token under any implementation, so reading token-lessness off it
    // would pass against a bootstrap that presented the dead token.
    expect(
      manifestFetches(recovery).map((request) => request.authority),
    ).toEqual([TOKEN_A, null]);
    // Refused with the old token, retried once with the new one.
    expect(dataRoutes(recovery).map((request) => request.authority)).toEqual([
      TOKEN_A,
      TOKEN_B,
    ]);
    unsubscribe();
  });

  it("replaces the session once: a refusal after the fresh bootstrap is terminal", async () => {
    const generation = genHex(0x92);
    const seen = stubAuthorityTransport({
      "/atlas/current": () => json({ generation }),
      // Every presented token is refused, so the recovery's own session is refused in turn.
      [`/atlas/generation/${generation}/manifest`]: (request) =>
        request.authority === null
          ? manifest(generation, 16, TOKEN_A)
          : unauthorized(),
      [`/atlas/tile/${generation}/plain/1/1/0`]: () => unauthorized(),
    });

    // The class is the assertion, not the wording: what reaches the caller is the refusal of a
    // renewal, which is the one failure that ends a session.
    await expect(fetchTile(1, 1, { baseUrl: BASE, retry: 0 })).rejects.toThrow(
      AtlasAuthorityEndedError,
    );

    // One replacement, never a loop: two bootstraps and two tile attempts, then the refusal reaches
    // the caller. A bootstrap that presents no token cannot be refused for authority, so a refusal
    // after one is no longer staleness and nothing further is dropped.
    expect(
      seen.filter((request) => request.path.endsWith("/current")),
    ).toHaveLength(2);
    expect(dataRoutes(seen)).toHaveLength(2);
  });

  it("reads the caller's cut at a renewal, never the generation's schedule or limits", async () => {
    const generation = genHex(0x61);
    let renewed = false;
    const seen = stubAuthorityTransport({
      "/atlas/current": () => json({ generation }),
      [`/atlas/generation/${generation}/manifest`]: (request) => {
        // Every block but `scopeSchedule` holds for the generation's lifetime, so this shrinking
        // document cannot happen on a real server: it is here so that a refresh which re-read the
        // schedule or the limits would fail loudly. Its `scopeSchedule` is the bootstrap's, which
        // is what keeps the session alive across the renewal.
        if (request.authority === null) {
          return manifest(generation, 16, TOKEN_A);
        }
        renewed = true;
        return manifest(generation, 1, TOKEN_B);
      },
      [`/atlas/tile/${generation}/plain/3/5/1`]: () =>
        renewed ? saltile(tileBytes(0x61, 3, 5, 1)) : unauthorized(),
    });

    // Zoom 3 is beyond the renewal document's maxZoom of 1 and within the bootstrap's 16. The
    // session keeps the schedule and limits the bootstrap resolved; a refresh renews authority.
    const { nodes } = await fetchTile(3, 13, { baseUrl: BASE });

    expect(nodes).toHaveLength(3);
    expect(manifestFetches(seen)).toHaveLength(2);
  });

  it("renews a restricted session at its own sealed cut without ending it", async () => {
    const generation = genHex(0x63);
    // The negative control for the case below, and the reason it is a separate test: a nonzero `k`
    // is the normal state of a restricted caller, not a defect. A renewal carries the sealed offset
    // verbatim, so the cut is unchanged, so the rows painted at `z + 8` stay painted.
    let expired = true;
    const seen = stubAuthorityTransport({
      "/atlas/current": () => json({ generation }),
      [`/atlas/generation/${generation}/manifest`]: (request) => {
        if (request.authority === null) {
          return manifest(generation, 16, TOKEN_A, 2);
        }
        expired = false;
        return manifest(generation, 16, TOKEN_B, 2);
      },
      [`/atlas/tile/${generation}/plain/1/1/0`]: () =>
        expired ? unauthorized() : saltile(tileBytes(0x63, 1, 1, 0, 8)),
    });

    const before = getAtlasSessionRevision();
    const { nodes } = await fetchTile(1, 1, { baseUrl: BASE });

    expect(nodes).toHaveLength(3);
    // One renewal and no replacement: no `/current` re-read, and the binding never moved.
    expect(manifestFetches(seen)).toHaveLength(2);
    expect(
      seen.filter((request) => request.path.endsWith("/current")),
    ).toHaveLength(1);
    expect(getAtlasSessionRevision()).toBe(before);
  });

  it("ends the session when a renewal re-mints at a different delivery cut", async () => {
    const generation = genHex(0x62);
    // The one manifest block that is per-caller rather than per-generation: `scopeSchedule` states
    // the delivery cut this caller's view resolved. The server seals no offset for a view that
    // resolves as the corpus — at every mint, including a renewal carrying a predecessor's nonzero
    // one — and refuses a token that carries one with the uniform `401` whose stated remedy is a
    // fresh manifest request. So a session sealed at `k = 2` can be refused and then renewed at
    // `k = 0`, and the renewal's `200` is where the change is visible.
    //
    // Without the cut comparison the recovery the server promises cannot complete: the renewal
    // succeeds, the session keeps `m + 2`, and the retry decodes a corpus head counted from `m` and
    // fails its `firstBucket` check — a terminal decode failure that no recovery path reaches, with
    // every later tile of the session failing the same way.
    let corpus = false;
    let minted = TOKEN_A;
    const seen = stubAuthorityTransport({
      "/atlas/current": () => json({ generation }),
      [`/atlas/generation/${generation}/manifest`]: () =>
        manifest(generation, 16, minted, corpus ? 0 : 2),
      [`/atlas/tile/${generation}/plain/1/1/0`]: (request) => {
        if (request.authority !== minted) {
          return unauthorized();
        }
        // The head is counted from the cut the current view serves, which is the whole point: the
        // corpus view delivers at `z + 6` where the scoped one delivered at `z + 8`.
        return saltile(tileBytes(0x62, 1, 1, 0, corpus ? 6 : 8));
      },
    });

    // Painted under the scoped view, two levels deeper than the corpus serves.
    expect((await fetchTile(1, 1, { baseUrl: BASE })).nodes).toHaveLength(3);
    const before = getAtlasSessionRevision();
    const settled = seen.length;

    corpus = true;
    minted = TOKEN_B;

    // The session is replaced and the request retried, so the caller still sees a painted tile —
    // decoded against the cut the successor session resolved.
    const { nodes } = await fetchTile(1, 1, { baseUrl: BASE, retry: 0 });
    expect(nodes).toHaveLength(3);

    // Advanced once, so every holder of rows painted at the old cut discarded them: they are rows
    // the renewed authority would not deliver, and no remap exists.
    expect(getAtlasSessionRevision()).toBe(before + 1);
    const recovery = seen.slice(settled);
    // The renewal presented the refused token and succeeded; the replacement bootstrap presented
    // none. Asserting token-lessness on the manifest is what proves the second one is a bootstrap.
    expect(
      manifestFetches(recovery).map((request) => request.authority),
    ).toEqual([TOKEN_A, null]);
    expect(dataRoutes(recovery).map((request) => request.authority)).toEqual([
      TOKEN_A,
      TOKEN_B,
    ]);
  });

  it("names the moved cut as its own failure when the replacement is not available", async () => {
    const generation = genHex(0x64);
    // The class is the assertion. A superseded caller cannot replace the session, so the error it
    // raised travels intact rather than being reported as a decode mismatch or a refusal — which is
    // what lets the session's owner tell a successful renewal at a moved cut from a refused one.
    let corpus = false;
    const seen = stubAuthorityTransport({
      "/atlas/current": () => json({ generation }),
      [`/atlas/generation/${generation}/manifest`]: (request) => {
        if (request.authority === null) {
          return manifest(generation, 16, TOKEN_A, 2);
        }
        // The pinned session is dropped by someone else — a principal transition, say — while this
        // renewal is in flight, which is a real ordering because a renewal outlives its callers'
        // signals on purpose. The caller is superseded, so it may replace nothing and its own
        // failure is what reaches it.
        clearAtlasSessionCache(BASE);
        return manifest(generation, 16, TOKEN_B, 0);
      },
      [`/atlas/tile/${generation}/plain/1/1/0`]: (request) =>
        !corpus && request.authority === TOKEN_A
          ? saltile(tileBytes(0x64, 1, 1, 0, 8))
          : unauthorized(),
    });

    await fetchTile(1, 1, { baseUrl: BASE });
    corpus = true;

    await expect(
      fetchTile(1, 1, { baseUrl: BASE, retry: 0 }),
    ).rejects.toBeInstanceOf(AtlasDeliveryCutChangedError);
    // One painted tile and one refusal: the superseded caller retried nothing.
    expect(dataRoutes(seen)).toHaveLength(2);
  });
});

/**
 * The transport's half of the principal-transition contract.
 *
 * It registers its reset at module load (see `shared/principal-scoped-state.ts`), and these tests
 * drive that registration through the module-wide tracker the auth provider calls.
 *
 * Every test states the principal it starts under before bootstrapping, because the tracker is
 * module-wide: the first principal a file observes is not a transition, and a later test inherits the
 * previous one.
 */
describe("a change of authenticated principal", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearAtlasSessionCache();
  });

  it("re-bootstraps the session and re-mints the token under the new principal", async () => {
    enterPrincipal("actor-a");
    const generation = genHex(0x81);
    let minted = TOKEN_A;
    const seen = stubAuthorityTransport({
      "/atlas/current": () => json({ generation }),
      [`/atlas/generation/${generation}/manifest`]: () =>
        manifest(generation, 16, minted),
      [`/atlas/tile/${generation}/plain/1/1/0`]: () =>
        saltile(tileBytes(0x81, 1, 1, 0)),
    });

    await fetchTile(1, 1, { baseUrl: BASE });
    // A sign-out and a sign-in as someone else, in one tab: no page load, so this module keeps
    // everything unless the transition drops it.
    minted = TOKEN_B;
    enterPrincipal("actor-b");
    await fetchTile(1, 1, { baseUrl: BASE });

    // The bootstrap runs again: the rows the first session's tiles decoded to are rows actor-a was
    // allowed to see, and the token seals the actor hash-api resolved for actor-a, so every data
    // route would refuse it.
    expect(
      seen.filter((request) => request.path.endsWith("/current")),
    ).toHaveLength(2);
    expect(dataRoutes(seen).map((request) => request.authority)).toEqual([
      TOKEN_A,
      TOKEN_B,
    ]);
  });

  it("advances the session revision, so derived state is replaced rather than kept", async () => {
    enterPrincipal("actor-a");
    const generation = genHex(0x82);
    stubAuthorityTransport({
      "/atlas/current": () => json({ generation }),
      [`/atlas/generation/${generation}/manifest`]: () => manifest(generation),
      [`/atlas/tile/${generation}/plain/1/1/0`]: () =>
        saltile(tileBytes(0x82, 1, 1, 0)),
    });
    const notifications: number[] = [];
    const unsubscribe = subscribeToAtlasSessionRevision(() => {
      notifications.push(getAtlasSessionRevision());
    });

    await fetchTile(1, 1, { baseUrl: BASE });
    const pinned = getAtlasSessionRevision();
    enterPrincipal("actor-b");

    // Dropping the session is not enough on its own: a row id decoded under actor-a is a valid id,
    // so anything derived from it stays usable and wrong. The revision is what tells holders of
    // decoded tiles to replace them, and it must have moved before the new principal renders.
    expect(getAtlasSessionRevision()).toBe(pinned + 1);
    expect(notifications).toEqual([pinned + 1]);
    unsubscribe();
  });

  it("keeps the session, the token and the painted tiles when the principal is unchanged", async () => {
    enterPrincipal("actor-a");
    const generation = genHex(0x83);
    const seen = stubAuthorityTransport({
      "/atlas/current": () => json({ generation }),
      [`/atlas/generation/${generation}/manifest`]: () => manifest(generation),
      [`/atlas/tile/${generation}/plain/1/1/0`]: () =>
        saltile(tileBytes(0x83, 1, 1, 0)),
    });

    await fetchTile(1, 1, { baseUrl: BASE });
    const pinned = getAtlasSessionRevision();
    // The app refetches the authenticated user on every navigation, so re-observing the same
    // principal is the overwhelmingly common case. It must cost nothing at all.
    enterPrincipal("actor-a");
    await fetchTile(1, 1, { baseUrl: BASE });

    expect(getAtlasSessionRevision()).toBe(pinned);
    expect(
      seen.filter((request) => request.path.endsWith("/current")),
    ).toHaveLength(1);
    expect(dataRoutes(seen).map((request) => request.authority)).toEqual([
      TOKEN_A,
      TOKEN_A,
    ]);
  });

  /** A response the test releases by hand, so a stale publisher can finish after its world is gone. */
  const held = () => {
    let release!: (response: Response) => void;
    const promise = new Promise<Response>((resolve) => {
      release = resolve;
    });
    return { promise, release };
  };

  it("refuses a superseded bootstrap's authority rather than letting it replace the new principal's", async () => {
    enterPrincipal("actor-a");
    const generation = genHex(0x84);
    const gate = held();
    let currents = 0;
    let manifests = 0;
    const seen = stubAuthorityTransport({
      "/atlas/current": () => {
        currents += 1;
        // The first caller's `current` is held: everything below happens while that bootstrap sits
        // in its first await, which is where a principal change is most damaging.
        return currents === 1 ? gate.promise : json({ generation });
      },
      [`/atlas/generation/${generation}/manifest`]: () => {
        manifests += 1;
        return manifest(
          generation,
          16,
          manifests === 1 ? TOKEN_B : token(0xa2),
        );
      },
      [`/atlas/tile/${generation}/plain/1/1/0`]: () =>
        saltile(tileBytes(0x84, 1, 1, 0)),
    });

    const superseded = fetchTile(1, 1, { baseUrl: BASE });
    enterPrincipal("actor-b");
    await fetchTile(1, 1, { baseUrl: BASE });
    gate.release(json({ generation }));

    // Its own failure is the recovery: the memoized promise it would have resolved was dropped by
    // the same transition, and its awaiting callers belong to the population that was dropped.
    await expect(superseded).rejects.toThrow(/superseded/);
    // The unconditional `authorityCache.set` in a bootstrap is the sharp edge: unguarded it installs
    // a tokenless entry over the successor's, and every later data request goes out bare.
    await fetchTile(1, 1, { baseUrl: BASE });
    expect(dataRoutes(seen).map((request) => request.authority)).toEqual([
      TOKEN_B,
      TOKEN_B,
    ]);
    expect(manifests).toBe(1);
  });

  it("refuses a superseded renewal's token rather than writing it over the new principal's", async () => {
    enterPrincipal("actor-a");
    const generation = genHex(0x85);
    const gate = held();
    let expired = false;
    let manifests = 0;
    const seen = stubAuthorityTransport({
      "/atlas/current": () => json({ generation }),
      [`/atlas/generation/${generation}/manifest`]: (request) => {
        manifests += 1;
        // A presented token is a renewal, and this one is held until after the principal changed.
        return request.authority === null
          ? manifest(generation, 16, manifests === 1 ? TOKEN_A : TOKEN_B)
          : gate.promise;
      },
      [`/atlas/tile/${generation}/plain/1/1/0`]: (request) =>
        expired && request.authority === TOKEN_A
          ? unauthorized()
          : saltile(tileBytes(0x85, 1, 1, 0)),
    });

    await fetchTile(1, 1, { baseUrl: BASE });
    expired = true;
    const stale = fetchTile(1, 1, { baseUrl: BASE });
    await vi.waitFor(() => {
      expect(manifests).toBe(2);
    });
    enterPrincipal("actor-b");
    await fetchTile(1, 1, { baseUrl: BASE });
    gate.release(manifest(generation, 16, token(0xa2)));
    await stale;

    // Retention resolves its entry by origin at the moment the response lands, so an unguarded late
    // mint is written into whichever entry now holds the origin — here, the next principal's.
    await fetchTile(1, 1, { baseUrl: BASE });
    expect(dataRoutes(seen).at(-1)?.authority).toBe(TOKEN_B);
  });

  it("does not clear the new principal's session when a superseded renewal is refused", async () => {
    enterPrincipal("actor-a");
    const generation = genHex(0x86);
    const gate = held();
    let expired = false;
    let manifests = 0;
    const seen = stubAuthorityTransport({
      "/atlas/current": () => json({ generation }),
      [`/atlas/generation/${generation}/manifest`]: (request) => {
        manifests += 1;
        // A presented token is a renewal, and this one is held until after the principal changed.
        return request.authority === null
          ? manifest(generation, 16, manifests === 1 ? TOKEN_A : TOKEN_B)
          : gate.promise;
      },
      [`/atlas/tile/${generation}/plain/1/1/0`]: (request) =>
        expired && request.authority === TOKEN_A
          ? unauthorized()
          : saltile(tileBytes(0x86, 1, 1, 0)),
    });

    await fetchTile(1, 1, { baseUrl: BASE });
    expired = true;
    const stale = fetchTile(1, 1, { baseUrl: BASE, retry: 0 });
    await vi.waitFor(() => {
      expect(manifests).toBe(2);
    });
    enterPrincipal("actor-b");
    await fetchTile(1, 1, { baseUrl: BASE });

    const pinned = getAtlasSessionRevision();
    const notified = vi.fn();
    const unsubscribe = subscribeToAtlasSessionRevision(notified);
    const settled = seen.length;

    // A's renewal is refused, late — the recovery for a refusal is destructive, and this one
    // addresses a session that no longer exists.
    gate.release(unauthorized());
    await expect(stale).rejects.toThrow(AtlasAuthorityEndedError);

    // It fails its own dropped callers and touches nothing else: B's revision does not move, nobody
    // is told to discard, and no bootstrap is issued on the word of a superseded request.
    expect(getAtlasSessionRevision()).toBe(pinned);
    expect(notified).not.toHaveBeenCalled();
    expect(
      seen
        .slice(settled)
        .filter((request) => request.path.endsWith("/current")),
    ).toHaveLength(0);

    // And B's token survives unswapped: the next request still presents the one B's bootstrap minted.
    await fetchTile(1, 1, { baseUrl: BASE });
    expect(dataRoutes(seen).at(-1)?.authority).toBe(TOKEN_B);
    unsubscribe();
  });

  it("moves nothing when no session was pinned under the previous principal", () => {
    enterPrincipal("actor-a");
    const notifications: number[] = [];
    const unsubscribe = subscribeToAtlasSessionRevision(() => {
      notifications.push(getAtlasSessionRevision());
    });
    const pinned = getAtlasSessionRevision();

    enterPrincipal("actor-b");

    // Correct, not a hole: nothing can be painted without a resolved session, so with no session to
    // drop there is no misattribution to fix — and moving the revision anyway would throw away a
    // signed-in principal's live view on every sign-in that follows a public visit.
    expect(getAtlasSessionRevision()).toBe(pinned);
    expect(notifications).toEqual([]);
    unsubscribe();
  });
});
