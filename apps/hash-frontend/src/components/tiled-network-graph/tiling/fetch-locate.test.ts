import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import { enterPrincipal } from "../../../shared/principal-scoped-state";
import { SALTILE_MEDIA_TYPE } from "../atlas-decode/envelope";
import { WORLD_SIZE } from "./atlas-tile-coordinate";
import { fetchLocate } from "./fetch-locate";
import {
  ATLAS_AUTHORITY_HEADER,
  ATLAS_RETIRED_GENERATION_PROBLEM,
  clearAtlasSessionCache,
  getAtlasSessionRevision,
  getSaltileSession,
  subscribeToAtlasSessionRevision,
} from "./fetch-tile";
/**
 * Locate's half of the session-replacement contract.
 *
 * Locate is the third transport that pins a session and owns its replacement, so it carries both arms
 * of that contract independently: a refused renewal replaces the session it pinned, and a refusal
 * addressing a session that has since been replaced touches nothing. Each arm is written so that a
 * transport branching on `404` alone fails it — the missing case is the whole subject, not its
 * symptoms.
 *
 * These drive the transport as far as its refusal, never to a decoded response: the discriminator is
 * what happens to the session, so no locate wire fixture is needed to pin it.
 */

import type * as LocateDocument from "../atlas-decode/locate-document";
import type { VersionedUrl } from "@blockprotocol/type-system";

const BASE = "http://api.test/atlas";
const COLORED_TYPES: readonly VersionedUrl[] = [
  "https://t.test/person/v/3" as VersionedUrl,
  "https://t.test/authored/v/1" as VersionedUrl,
];

const genHex = (byte: number): string =>
  byte.toString(16).padStart(2, "0").repeat(32);

const token = (byte: number): string =>
  `${byte.toString(16).padStart(2, "0")}-opaque-authority`;

const TOKEN_A = token(0xa1);
const TOKEN_B = token(0xb2);

const manifestBody = (generation: string): unknown => ({
  generation,
  wireVersion: 1,
  variants: ["plain"],
  bucketSchedule: { span: 64, cut: "z+6", maxZoom: 16 },
  scopeSchedule: { k: 0, cut: "z+6", maxZoom: 16 },
  limits: {
    tile: { coloredTypeIds: 8 },
    edges: { tiles: 32, edges: 16384 },
    locate: {
      coloredTypeIds: 8,
      edges: 512,
      properties: 20,
      linkTypeIds: 5,
      linkProperties: 10,
    },
    translate: { entityIds: 1024 },
    authorityRefreshSeconds: 480,
    authorityHardSeconds: 600,
  },
  createdAt: "2026-07-19T16:00:00Z",
});

const json = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

/** The manifest response: the document plus a freshly minted token, as the server sends it. */
const manifest = (generation: string, minted: string): Response =>
  new Response(JSON.stringify(manifestBody(generation)), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "private, no-store",
      [ATLAS_AUTHORITY_HEADER]: minted,
    },
  });

const unauthorized = (): Response =>
  new Response(
    JSON.stringify({ type: "unauthorized", detail: "authority refused" }),
    { status: 401, headers: { "content-type": "application/problem+json" } },
  );

/**
 * The atlas's refusal for a generation it no longer serves: the re-pin signal.
 *
 * The `type` is the server's own URI, and the transport reads it - a `404` alone does not say which
 * refusal arrived, and the other one this route can answer must not replace a session. A fixture
 * inventing a slug here would model a server nobody runs, and would model it in the direction that
 * makes the test pass.
 */
const notFound = (): Response =>
  new Response(
    JSON.stringify({
      type: ATLAS_RETIRED_GENERATION_PROBLEM,
      detail: "no longer served",
    }),
    { status: 404, headers: { "content-type": "application/problem+json" } },
  );

/** The atlas's refusal for a source id naming no visible node: a `404` that ends nothing. */
const unknownEntity = (): Response =>
  new Response(
    JSON.stringify({
      type: "/problems/atlas/unknown-entity",
      detail: "the entity id does not name a visible node",
    }),
    { status: 404, headers: { "content-type": "application/problem+json" } },
  );

interface RecordedRequest {
  readonly path: string;
  readonly authority: string | null;
  readonly body: unknown;
}

/** Stubs global fetch with canned routes, recording each path and presented token. */
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
      authority: new Headers(init?.headers).get(ATLAS_AUTHORITY_HEADER),
      body:
        typeof init?.body === "string"
          ? (JSON.parse(init.body) as unknown)
          : undefined,
    };
    seen.push(request);
    const route = routes[request.path];
    return Promise.resolve(route === undefined ? notFound() : route(request));
  }) as typeof fetch);
  return seen;
};

/** A response held open, so it can land after the events that were supposed to retire it. */
const held = (): {
  promise: Promise<Response>;
  release: (response: Response) => void;
} => {
  let release: (response: Response) => void = () => {};
  const promise = new Promise<Response>((resolve) => {
    release = resolve;
  });
  return { promise, release };
};

const bootstraps = (seen: RecordedRequest[]): RecordedRequest[] =>
  seen.filter((request) => request.path.endsWith("/current"));

describe("fetchLocate and its session", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearAtlasSessionCache();
  });

  it("maps a decoded locate without truncating nodes to source properties", async () => {
    const generation = genHex(0x77);
    const bytes = readFileSync(
      new URL(
        "../../../../../../libs/@local/graph/atlas/fixtures/wire/g7-locate.saltile",
        import.meta.url,
      ),
    );
    const seen = stubAuthorityTransport({
      "/atlas/current": () => json({ generation }),
      [`/atlas/generation/${generation}/manifest`]: () =>
        manifest(generation, TOKEN_A),
      [`/atlas/locate/${generation}/plain`]: () =>
        new Response(new Uint8Array(bytes), {
          headers: { "content-type": SALTILE_MEDIA_TYPE },
        }),
    });
    const document = await fetchLocate(61, {
      baseUrl: BASE,
      retry: 0,
      coloredTypeIds: COLORED_TYPES,
    });
    expect(seen.at(-1)?.body).toEqual({
      row: 61,
      coloredTypeIds: [
        "https://t.test/person/v/3",
        "https://t.test/authored/v/1",
      ],
    });
    expect(document.nodes.map((node) => node.id)).toEqual([61, 11, 21, 41]);
    expect(document.nodes.map((node) => node.typeIndices)).toEqual([
      [0],
      [0],
      [],
      [1],
    ]);
    expect(document.nodes[0]).toMatchObject({
      x: 0.8125 * WORLD_SIZE,
      y: 0.375 * WORLD_SIZE,
      typeId: "https://t.test/person/v/3",
    });
    expect(document.nodes[1]).not.toHaveProperty("label");
    expect(document.nodes[1]).not.toHaveProperty("typeId");
    expect(document.nodes[0]?.properties).toEqual(
      new Map<string, LocateDocument.Scalar>([
        ["https://x.test/age/", -3n],
        ["https://x.test/name/", "Ada"],
        ["https://x.test/ok/", true],
        ["https://x.test/score/", 0.5],
      ]),
    );
    for (const neighbour of document.nodes.slice(1)) {
      expect(neighbour).not.toHaveProperty("properties");
    }
    expect(document.edges.map((edge) => [edge.source, edge.target])).toEqual([
      [61, 11],
      [41, 61],
      [21, 41],
    ]);
    expect(document.edges[0]?.typeIds).toEqual([
      "https://t.test/person/v/3",
      "https://t.test/authored/v/1",
    ]);
    expect(document.edges.map((edge) => edge.typeIdsComplete)).toEqual([
      true,
      false,
      false,
    ]);
    expect(document.edges.map((edge) => edge.propertiesComplete)).toEqual([
      true,
      false,
      true,
    ]);
    expect([...document.edges[0]!.properties!.values()]).toEqual([
      977n,
      null,
      -2.5,
    ]);
    expect(document.edges[1]?.properties).toBeNull();
    expect(document.edges[2]?.properties).toEqual(new Map());
    expect(typeof document.entityId).toBe("string");
    expect(document.edges.every((edge) => typeof edge.id === "string")).toBe(
      true,
    );
    expect(document).toMatchObject({
      cell: { z: 3n, x: 5n, y: 2n },
      zoom: 3n,
      complete: false,
      typeIdsComplete: true,
      propertiesComplete: false,
    });
  });

  it("rejects a decoded locate from another generation without retiring the session", async () => {
    const generation = genHex(0x78);
    const bytes = readFileSync(
      new URL(
        "../../../../../../libs/@local/graph/atlas/fixtures/wire/g7-locate.saltile",
        import.meta.url,
      ),
    );
    const seen = stubAuthorityTransport({
      "/atlas/current": () => json({ generation }),
      [`/atlas/generation/${generation}/manifest`]: () =>
        manifest(generation, TOKEN_A),
      [`/atlas/locate/${generation}/plain`]: () =>
        new Response(new Uint8Array(bytes), {
          headers: { "content-type": SALTILE_MEDIA_TYPE },
        }),
    });
    await getSaltileSession(BASE);
    const revision = getAtlasSessionRevision();
    await expect(
      fetchLocate(61, {
        baseUrl: BASE,
        retry: 0,
        coloredTypeIds: COLORED_TYPES,
      }),
    ).rejects.toThrow("failed to decode locate");
    expect(getAtlasSessionRevision()).toBe(revision);
    expect(bootstraps(seen)).toHaveLength(1);
  });

  it("replaces the session when a locate renewal is refused", async () => {
    const generation = genHex(0x71);
    const seen = stubAuthorityTransport({
      "/atlas/current": () => json({ generation }),
      // Any presented token is refused, including at its own renewal; only a tokenless bootstrap mints.
      [`/atlas/generation/${generation}/manifest`]: (request) =>
        request.authority === null
          ? manifest(generation, TOKEN_A)
          : unauthorized(),
      [`/atlas/locate/${generation}/plain`]: () => unauthorized(),
    });

    const notified = vi.fn();
    const unsubscribe = subscribeToAtlasSessionRevision(notified);
    const before = getAtlasSessionRevision();

    // The locate itself cannot succeed against this server; the session is what is under test.
    await expect(fetchLocate(1, { baseUrl: BASE, retry: 0 })).rejects.toThrow();

    // A branch keyed on `404` alone leaves all three of these unchanged, which is exactly the
    // omission this test exists for.
    expect(getAtlasSessionRevision()).toBe(before + 1);
    expect(notified).toHaveBeenCalledTimes(1);
    expect(bootstraps(seen)).toHaveLength(2);
    unsubscribe();
  });

  it("keeps the session when the source names no visible node", async () => {
    // Locate is the one route whose ordinary miss is a `404`: an entity outside this generation, or one
    // the caller may not see, answers `unknown-entity`. Read as a re-pin it would drop the session,
    // move the revision, discard every painted tile, and re-issue the locate only to be refused the
    // same way - a whole view lost to a search result. Nothing about the session is wrong here, so
    // nothing about it moves, and the refusal is the caller's to render.
    const generation = genHex(0x73);
    let locates = 0;
    const seen = stubAuthorityTransport({
      "/atlas/current": () => json({ generation }),
      [`/atlas/generation/${generation}/manifest`]: () =>
        manifest(generation, TOKEN_A),
      [`/atlas/locate/${generation}/plain`]: () => {
        locates += 1;
        return unknownEntity();
      },
    });

    await getSaltileSession(BASE);
    const pinned = getAtlasSessionRevision();
    const notified = vi.fn();
    const unsubscribe = subscribeToAtlasSessionRevision(notified);
    const settled = seen.length;

    await expect(fetchLocate(1, { baseUrl: BASE, retry: 0 })).rejects.toThrow();

    expect(getAtlasSessionRevision()).toBe(pinned);
    expect(notified).not.toHaveBeenCalled();
    expect(bootstraps(seen.slice(settled))).toHaveLength(0);
    // One attempt, not two: there is no successor session for a second one to run under.
    expect(locates).toBe(1);
    unsubscribe();
  });

  it("does not clear the new principal's session when a superseded locate fails", async () => {
    enterPrincipal("actor-a");
    const generation = genHex(0x72);
    const gate = held();
    let locates = 0;
    let manifests = 0;
    const seen = stubAuthorityTransport({
      "/atlas/current": () => json({ generation }),
      [`/atlas/generation/${generation}/manifest`]: () => {
        manifests += 1;
        return manifest(generation, manifests === 1 ? TOKEN_A : TOKEN_B);
      },
      // The first locate is held open across the principal transition; it is A's request.
      [`/atlas/locate/${generation}/plain`]: () => {
        locates += 1;
        return locates === 1 ? gate.promise : notFound();
      },
    });

    const stale = fetchLocate(1, { baseUrl: BASE, retry: 0 });
    await vi.waitFor(() => {
      expect(locates).toBe(1);
    });
    // B arrives and pins a session of its own — the successor a late refusal must not be able to drop.
    enterPrincipal("actor-b");
    await getSaltileSession(BASE);
    expect(manifests).toBe(2);

    const pinned = getAtlasSessionRevision();
    const notified = vi.fn();
    const unsubscribe = subscribeToAtlasSessionRevision(notified);
    const settled = seen.length;

    // A's locate is refused as a re-pin, late. Recovering on it would drop B's session and token on
    // the word of a request that never addressed them.
    gate.release(notFound());
    await expect(stale).rejects.toThrow();

    expect(getAtlasSessionRevision()).toBe(pinned);
    expect(notified).not.toHaveBeenCalled();
    expect(bootstraps(seen.slice(settled))).toHaveLength(0);
    unsubscribe();
  });
});
