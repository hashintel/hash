import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildResponse,
  cborBool,
  cborBstr,
  cborMap,
  cborUint,
  u32le,
} from "../atlas-decode/fixtures";
import { SALTILE_MEDIA_TYPE } from "../atlas-decode/wire";
import { fetchEdgesForTiles } from "./fetch-edges-for-tiles";
import { clearAtlasSessionCache, FetchTileError } from "./fetch-tile";

const BASE = "http://atlas.test";

const genHex = (byte: number): string =>
  byte.toString(16).padStart(2, "0").repeat(32);

const manifestBody = (generation: string, edgesTiles = 32): unknown => ({
  generation,
  wireVersion: 1,
  variants: ["plain"],
  bucketSchedule: { span: 64, cut: "z+m", maxZoom: 16 },
  limits: { coloredTypeIds: 8, edgesTiles, locateNeighbours: 64 },
  createdAt: "2026-07-19T16:00:00Z",
});

/** An edges response echoing a `generationByte`-filled identity, variant 0. */
const edgesBytes = (
  generationByte: number,
  sources: number[],
  targets: number[],
  ids: number[],
  complete = true,
): ArrayBuffer =>
  buildResponse("edges", [
    cborMap([
      [0, cborBstr(Array.from({ length: 32 }, () => generationByte))],
      [1, cborUint(0)],
      [2, cborUint(sources.length)],
      [3, cborBool(complete)],
      [4, cborBool(false)],
    ]),
    u32le(sources),
    u32le(targets),
    u32le(ids),
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

interface Captured {
  readonly path: string;
  readonly body: unknown;
}

/** Stubs global fetch with canned routes, recording each path and JSON body. */
const stubTransport = (routes: Record<string, () => Response>): Captured[] => {
  const captured: Captured[] = [];
  vi.stubGlobal("fetch", ((url: string, init?: RequestInit) => {
    const path = new URL(url, BASE).pathname;
    captured.push({
      path,
      body:
        typeof init?.body === "string"
          ? (JSON.parse(init.body) as unknown)
          : undefined,
    });
    const route = routes[path];
    return Promise.resolve(route === undefined ? notFound() : route());
  }) as typeof fetch);
  return captured;
};

describe("fetchEdgesForTiles", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearAtlasSessionCache();
  });

  it("posts the tile list and decodes the edges response", async () => {
    const generation = genHex(0x11);
    const captured = stubTransport({
      "/v1/atlas/current": () => json({ generation }),
      [`/v1/atlas/generation/${generation}/manifest`]: () =>
        json(manifestBody(generation)),
      [`/v1/atlas/edges/${generation}/plain`]: () =>
        saltile(edgesBytes(0x11, [7, 11], [11, 42], [100, 205])),
    });

    const tiles = [
      { z: 0, x: 0, y: 0 },
      { z: 1, x: 1, y: 0 },
    ];
    const { edges, complete } = await fetchEdgesForTiles(tiles, {
      baseUrl: BASE,
    });

    expect(complete).toBe(true);
    expect(edges).toEqual([
      { id: 100, source: 7, target: 11 },
      { id: 205, source: 11, target: 42 },
    ]);

    const edgesRequest = captured.find((entry) =>
      entry.path.includes("/atlas/edges/"),
    );
    expect(edgesRequest?.body).toEqual({ tiles });
  });

  it("reports cap truncation through complete", async () => {
    const generation = genHex(0x22);
    stubTransport({
      "/v1/atlas/current": () => json({ generation }),
      [`/v1/atlas/generation/${generation}/manifest`]: () =>
        json(manifestBody(generation)),
      [`/v1/atlas/edges/${generation}/plain`]: () =>
        saltile(edgesBytes(0x22, [1], [2], [3], false)),
    });

    const { complete } = await fetchEdgesForTiles([{ z: 0, x: 0, y: 0 }], {
      baseUrl: BASE,
    });
    expect(complete).toBe(false);
  });

  it("returns no edges without a request for an empty tile list", async () => {
    const captured = stubTransport({});
    const { edges } = await fetchEdgesForTiles([], { baseUrl: BASE });

    expect(edges).toEqual([]);
    expect(captured).toEqual([]);
  });

  it("trims the tile list to the manifest's edgesTiles cap", async () => {
    const generation = genHex(0x33);
    const captured = stubTransport({
      "/v1/atlas/current": () => json({ generation }),
      [`/v1/atlas/generation/${generation}/manifest`]: () =>
        json(manifestBody(generation, 2)),
      [`/v1/atlas/edges/${generation}/plain`]: () =>
        saltile(edgesBytes(0x33, [], [], [])),
    });

    const tiles = [
      { z: 1, x: 0, y: 0 },
      { z: 1, x: 1, y: 0 },
      { z: 1, x: 0, y: 1 },
    ];
    await fetchEdgesForTiles(tiles, { baseUrl: BASE });

    const edgesRequest = captured.find((entry) =>
      entry.path.includes("/atlas/edges/"),
    );
    // Only the first two tiles ride the request; the third is beyond the cap.
    expect(edgesRequest?.body).toEqual({ tiles: tiles.slice(0, 2) });
  });

  it("re-bootstraps once when the pinned generation rotates out", async () => {
    const oldGeneration = genHex(0x44);
    const newGeneration = genHex(0x55);
    let active = oldGeneration;
    const captured = stubTransport({
      "/v1/atlas/current": () => json({ generation: active }),
      [`/v1/atlas/generation/${oldGeneration}/manifest`]: () =>
        json(manifestBody(oldGeneration)),
      [`/v1/atlas/generation/${newGeneration}/manifest`]: () =>
        json(manifestBody(newGeneration)),
      [`/v1/atlas/edges/${oldGeneration}/plain`]: () => notFound(),
      [`/v1/atlas/edges/${newGeneration}/plain`]: () =>
        saltile(edgesBytes(0x55, [1], [2], [9])),
    });

    const pending = fetchEdgesForTiles([{ z: 0, x: 0, y: 0 }], {
      baseUrl: BASE,
    });
    active = newGeneration;
    const { edges } = await pending;

    expect(edges).toEqual([{ id: 9, source: 1, target: 2 }]);
    const bootstraps = captured.filter((entry) =>
      entry.path.endsWith("/atlas/current"),
    ).length;
    expect(bootstraps).toBe(2);
  });

  it("throws a FetchTileError when the edges payload is not SALTILE", async () => {
    const generation = genHex(0x66);
    stubTransport({
      "/v1/atlas/current": () => json({ generation }),
      [`/v1/atlas/generation/${generation}/manifest`]: () =>
        json(manifestBody(generation)),
      [`/v1/atlas/edges/${generation}/plain`]: () => json({ not: "saltile" }),
    });

    await expect(
      fetchEdgesForTiles([{ z: 0, x: 0, y: 0 }], { baseUrl: BASE }),
    ).rejects.toBeInstanceOf(FetchTileError);
  });
});
